import os
import uuid
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import models, schemas, auth
from app.config import settings
from app.database import get_db
from app.services.cleaning import clean_dataframe
from app.services.eda import generate_eda
from app.services.kpi import detect_kpis
from app.services.anomaly import detect_anomalies
from app.services.root_cause import generate_root_causes
from app.services.prediction import generate_predictions
from app.services.report import generate_report_pdf

router = APIRouter(prefix="/datasets", tags=["datasets"])


def _read_dataframe(path: str, file_type: str) -> pd.DataFrame:
    if file_type == ".csv":
        return pd.read_csv(path)
    return pd.read_excel(path)


def _compute_quality_score(df: pd.DataFrame) -> float:
    """Simple heuristic: penalize missing values and duplicate rows. 0-100 scale."""
    total_cells = df.shape[0] * df.shape[1] or 1
    missing_ratio = df.isnull().sum().sum() / total_cells
    duplicate_ratio = df.duplicated().sum() / (df.shape[0] or 1)
    score = 100 * (1 - 0.6 * missing_ratio - 0.4 * duplicate_ratio)
    # Explicitly cast to a native Python float — numpy scalars aren't JSON-serializable by psycopg2
    return float(round(max(0.0, min(100.0, score)), 2))


@router.post("/upload", response_model=schemas.DatasetOut, status_code=201)
def upload_dataset(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    ext = Path(file.filename).suffix.lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {settings.ALLOWED_EXTENSIONS}",
        )

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    stored_name = f"{uuid.uuid4()}{ext}"
    stored_path = os.path.join(settings.UPLOAD_DIR, stored_name)

    contents = file.file.read()
    size_mb = len(contents) / (1024 * 1024)
    if size_mb > settings.MAX_UPLOAD_SIZE_MB:
        raise HTTPException(status_code=413, detail="File exceeds max upload size")

    with open(stored_path, "wb") as f:
        f.write(contents)

    # Quick profile pass so the dashboard has something immediately
    try:
        df = _read_dataframe(stored_path, ext)
        rows, cols = df.shape
        quality_score = _compute_quality_score(df)
        profile_summary = {
            "missing_by_column": {k: int(v) for k, v in df.isnull().sum().to_dict().items()},
            "dtypes": df.dtypes.astype(str).to_dict(),
            "duplicate_rows": int(df.duplicated().sum()),
        }
        status_val = models.DatasetStatus.profiling.value
    except Exception as e:
        rows, cols, quality_score, profile_summary = None, None, None, None
        status_val = models.DatasetStatus.failed.value

    dataset = models.Dataset(
        owner_id=current_user.id,
        filename=file.filename,
        stored_path=stored_path,
        file_type=ext,
        file_size_bytes=len(contents),
        rows=rows,
        columns=cols,
        status=status_val,
        profile_summary=profile_summary,
        data_quality_score=quality_score,
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    return dataset


@router.get("", response_model=list[schemas.DatasetOut])
def list_datasets(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    return (
        db.query(models.Dataset)
        .filter(models.Dataset.owner_id == current_user.id)
        .order_by(models.Dataset.uploaded_at.desc())
        .all()
    )


@router.get("/{dataset_id}/profile", response_model=schemas.DatasetProfileOut)
def get_dataset_profile(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    dataset = (
        db.query(models.Dataset)
        .filter(models.Dataset.id == dataset_id, models.Dataset.owner_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.post("/{dataset_id}/clean", response_model=schemas.CleaningResultOut)
def clean_dataset(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    dataset = (
        db.query(models.Dataset)
        .filter(models.Dataset.id == dataset_id, models.Dataset.owner_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    if not os.path.exists(dataset.stored_path):
        raise HTTPException(status_code=410, detail="Original file is missing from storage")

    try:
        df = _read_dataframe(dataset.stored_path, dataset.file_type)
        cleaned_df, summary = clean_dataframe(df)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Cleaning failed: {e}")

    # Save the cleaned file separately — never overwrite the original raw upload
    cleaned_dir = os.path.join(settings.UPLOAD_DIR, "cleaned")
    os.makedirs(cleaned_dir, exist_ok=True)
    cleaned_filename = f"{dataset.id}_cleaned.csv"
    cleaned_path = os.path.join(cleaned_dir, cleaned_filename)
    cleaned_df.to_csv(cleaned_path, index=False)

    dataset.cleaned_path = cleaned_path
    dataset.cleaning_summary = summary
    dataset.status = models.DatasetStatus.cleaned.value
    # Refresh row/quality metrics against the cleaned data
    dataset.rows = int(cleaned_df.shape[0])
    dataset.data_quality_score = _compute_quality_score(df)

    db.commit()
    db.refresh(dataset)
    return dataset


@router.get("/{dataset_id}/eda", response_model=schemas.AnalysisOut)
def get_dataset_eda(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    dataset = (
        db.query(models.Dataset)
        .filter(models.Dataset.id == dataset_id, models.Dataset.owner_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Prefer the cleaned file if it exists — EDA on cleaned data is more meaningful
    # (e.g. duplicate rows won't skew counts, filled values won't show as gaps).
    # Fall back to the raw upload if cleaning hasn't been run yet.
    if dataset.cleaned_path and os.path.exists(dataset.cleaned_path):
        source_path = dataset.cleaned_path
        source_type = ".csv"  # cleaned files are always saved as csv
    elif os.path.exists(dataset.stored_path):
        source_path = dataset.stored_path
        source_type = dataset.file_type
    else:
        raise HTTPException(status_code=410, detail="Dataset file is missing from storage")

    try:
        df = _read_dataframe(source_path, source_type)
        eda_result = generate_eda(df)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"EDA generation failed: {e}")

    analysis = models.Analysis(
        dataset_id=dataset.id,
        analysis_type=models.AnalysisType.eda.value,
        result_json=eda_result,
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    return analysis


@router.get("/{dataset_id}/kpis", response_model=schemas.AnalysisOut)
def get_dataset_kpis(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    dataset = (
        db.query(models.Dataset)
        .filter(models.Dataset.id == dataset_id, models.Dataset.owner_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    if dataset.cleaned_path and os.path.exists(dataset.cleaned_path):
        source_path = dataset.cleaned_path
        source_type = ".csv"
    elif os.path.exists(dataset.stored_path):
        source_path = dataset.stored_path
        source_type = dataset.file_type
    else:
        raise HTTPException(status_code=410, detail="Dataset file is missing from storage")

    try:
        df = _read_dataframe(source_path, source_type)
        kpi_result = detect_kpis(df)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"KPI detection failed: {e}")

    analysis = models.Analysis(
        dataset_id=dataset.id,
        analysis_type=models.AnalysisType.kpi.value,
        result_json=kpi_result,
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    return analysis


@router.get("/{dataset_id}/anomalies", response_model=schemas.AnalysisOut)
def get_dataset_anomalies(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    dataset = (
        db.query(models.Dataset)
        .filter(models.Dataset.id == dataset_id, models.Dataset.owner_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    if dataset.cleaned_path and os.path.exists(dataset.cleaned_path):
        source_path = dataset.cleaned_path
        source_type = ".csv"
    elif os.path.exists(dataset.stored_path):
        source_path = dataset.stored_path
        source_type = dataset.file_type
    else:
        raise HTTPException(status_code=410, detail="Dataset file is missing from storage")

    try:
        df = _read_dataframe(source_path, source_type)
        anomaly_result = detect_anomalies(df)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Anomaly detection failed: {e}")

    analysis = models.Analysis(
        dataset_id=dataset.id,
        analysis_type=models.AnalysisType.anomaly.value,
        result_json=anomaly_result,
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    return analysis

@router.get("/{dataset_id}/root-causes", response_model=schemas.AnalysisOut)
def get_dataset_root_causes(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    dataset = (
        db.query(models.Dataset)
        .filter(models.Dataset.id == dataset_id, models.Dataset.owner_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    if dataset.cleaned_path and os.path.exists(dataset.cleaned_path):
        source_path = dataset.cleaned_path
        source_type = ".csv"
    elif os.path.exists(dataset.stored_path):
        source_path = dataset.stored_path
        source_type = dataset.file_type
    else:
        raise HTTPException(status_code=410, detail="Dataset file is missing from storage")

    try:
        df = _read_dataframe(source_path, source_type)
        anomaly_result = detect_anomalies(df)
        root_cause_result = generate_root_causes(df, anomaly_result["anomalies"])
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Root-cause analysis failed: {e}")

    analysis = models.Analysis(
        dataset_id=dataset.id,
        analysis_type=models.AnalysisType.root_cause.value,
        result_json=root_cause_result,
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    return analysis


@router.get("/{dataset_id}/predictions", response_model=schemas.AnalysisOut)
def get_dataset_predictions(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    dataset = (
        db.query(models.Dataset)
        .filter(models.Dataset.id == dataset_id, models.Dataset.owner_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    if dataset.cleaned_path and os.path.exists(dataset.cleaned_path):
        source_path = dataset.cleaned_path
        source_type = ".csv"
    elif os.path.exists(dataset.stored_path):
        source_path = dataset.stored_path
        source_type = dataset.file_type
    else:
        raise HTTPException(status_code=410, detail="Dataset file is missing from storage")

    try:
        df = _read_dataframe(source_path, source_type)
        prediction_result = generate_predictions(df)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Prediction generation failed: {e}")

    analysis = models.Analysis(
        dataset_id=dataset.id,
        analysis_type=models.AnalysisType.prediction.value,
        result_json=prediction_result,
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    return analysis

    


@router.post("/{dataset_id}/report")
def generate_dataset_report(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    dataset = (
        db.query(models.Dataset)
        .filter(models.Dataset.id == dataset_id, models.Dataset.owner_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    if dataset.cleaned_path and os.path.exists(dataset.cleaned_path):
        source_path = dataset.cleaned_path
        source_type = ".csv"
    elif os.path.exists(dataset.stored_path):
        source_path = dataset.stored_path
        source_type = dataset.file_type
    else:
        raise HTTPException(status_code=410, detail="Dataset file is missing from storage")

    # Recompute EDA and KPIs fresh at report time so the report always
    # reflects the current state of the file (e.g. after cleaning), rather
    # than depending on a specific prior /eda or /kpis call having been made.
    try:
        df = _read_dataframe(source_path, source_type)
        eda_result = generate_eda(df)
        kpi_result = detect_kpis(df)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Report data generation failed: {e}")

    reports_dir = os.path.join(settings.UPLOAD_DIR, "reports")
    os.makedirs(reports_dir, exist_ok=True)
    report_filename = f"{dataset.id}_report.pdf"
    report_path = os.path.join(reports_dir, report_filename)

    try:
        generate_report_pdf(
            output_path=report_path,
            dataset_filename=dataset.filename,
            rows=df.shape[0],
            columns=df.shape[1],
            data_quality_score=dataset.data_quality_score,
            cleaning_summary=dataset.cleaning_summary,
            kpi_result=kpi_result,
            eda_result=eda_result,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {e}")

    # Record this report in the DB — needs a parent Analysis row (FK requirement)
    analysis = models.Analysis(
        dataset_id=dataset.id,
        analysis_type="report",
        result_json={"eda": eda_result, "kpis": kpi_result},
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)

    report = models.Report(analysis_id=analysis.id, file_path=report_path)
    db.add(report)
    db.commit()

    return FileResponse(
        path=report_path,
        media_type="application/pdf",
        filename=f"{Path(dataset.filename).stem}_report.pdf",
    )
