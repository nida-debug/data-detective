import enum
import uuid

from sqlalchemy import (
    Column, String, Integer, Float, DateTime, ForeignKey, Text, Boolean, JSON
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    user = "user"


class DatasetStatus(str, enum.Enum):
    uploaded = "uploaded"
    profiling = "profiling"
    cleaned = "cleaned"
    analyzed = "analyzed"
    failed = "failed"


class AnalysisType(str, enum.Enum):
    profiling = "profiling"
    eda = "eda"
    kpi = "kpi"
    root_cause = "root_cause"
    anomaly = "anomaly"
    prediction = "prediction"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    # Stored as plain String (not a native Postgres ENUM) so new values (e.g. a
    # future role) never require a database migration — validated by Pydantic
    # on the API layer instead.
    role = Column(String, default=UserRole.user.value, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    datasets = relationship("Dataset", back_populates="owner", cascade="all, delete-orphan")


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    filename = Column(String, nullable=False)
    stored_path = Column(String, nullable=False)
    file_type = Column(String, nullable=False)  # csv / xlsx
    file_size_bytes = Column(Integer, nullable=False)

    rows = Column(Integer, nullable=True)
    columns = Column(Integer, nullable=True)
    status = Column(String, default=DatasetStatus.uploaded.value, nullable=False)

    # Cached profiling summary (missing %, dtypes, etc.) so we don't recompute on every dashboard load
    profile_summary = Column(JSON, nullable=True)
    data_quality_score = Column(Float, nullable=True)

    # Cleaning output — kept separate from stored_path so the original raw file is never overwritten
    cleaned_path = Column(String, nullable=True)
    cleaning_summary = Column(JSON, nullable=True)

    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="datasets")
    analyses = relationship("Analysis", back_populates="dataset", cascade="all, delete-orphan")


class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id = Column(UUID(as_uuid=True), ForeignKey("datasets.id"), nullable=False)
    # String, not native ENUM — see note on User.role above. This is the exact
    # column that would have forced another DB reset every time we added a
    # new analysis type (like "kpi" today); now it never will again.
    analysis_type = Column(String, nullable=False)

    # Structured results (chart data, stats, feature importances, anomaly scores etc.)
    result_json = Column(JSON, nullable=True)
    # Plain-English AI-generated explanation, if the AI insight layer is used
    insight_text = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    dataset = relationship("Dataset", back_populates="analyses")
    reports = relationship("Report", back_populates="analysis", cascade="all, delete-orphan")


class Report(Base):
    __tablename__ = "reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analysis_id = Column(UUID(as_uuid=True), ForeignKey("analyses.id"), nullable=False)

    file_path = Column(String, nullable=False)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())

    analysis = relationship("Analysis", back_populates="reports")
