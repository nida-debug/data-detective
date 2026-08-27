"""
Exploratory Data Analysis service. Returns everything pre-shaped for charting
libraries (Plotly, Recharts, Chart.js) — the frontend should never need to
do its own binning, aggregation, or correlation math against raw rows.
"""
from typing import Any

import numpy as np
import pandas as pd

# Cap how many distinct categories we return per column so a high-cardinality
# text column (e.g. "customer_id") doesn't blow up the response size.
MAX_CATEGORIES = 20
HISTOGRAM_BINS = 10


def _safe_float(value: Any) -> float | None:
    """NaN/inf are not valid JSON — convert to None so the response stays valid JSON."""
    try:
        f = float(value)
        if np.isnan(f) or np.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return None


def generate_eda(df: pd.DataFrame) -> dict[str, Any]:
    numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
    categorical_cols = df.select_dtypes(include=["object", "category", "bool"]).columns.tolist()

    # --- Summary statistics ---
    summary_stats: dict[str, Any] = {}
    for col in numeric_cols:
        series = df[col].dropna()
        summary_stats[col] = {
            "type": "numeric",
            "count": int(series.count()),
            "mean": _safe_float(series.mean()) if len(series) else None,
            "std": _safe_float(series.std()) if len(series) else None,
            "min": _safe_float(series.min()) if len(series) else None,
            "q1": _safe_float(series.quantile(0.25)) if len(series) else None,
            "median": _safe_float(series.median()) if len(series) else None,
            "q3": _safe_float(series.quantile(0.75)) if len(series) else None,
            "max": _safe_float(series.max()) if len(series) else None,
        }
    for col in categorical_cols:
        series = df[col].dropna()
        value_counts = series.value_counts()
        summary_stats[col] = {
            "type": "categorical",
            "count": int(series.count()),
            "unique_values": int(series.nunique()),
            "top_value": str(value_counts.index[0]) if len(value_counts) else None,
            "top_value_count": int(value_counts.iloc[0]) if len(value_counts) else None,
        }

    # --- Histograms (numeric columns) ---
    histograms: dict[str, Any] = {}
    for col in numeric_cols:
        series = df[col].dropna()
        if len(series) < 2 or series.nunique() < 2:
            continue
        counts, bin_edges = np.histogram(series, bins=HISTOGRAM_BINS)
        histograms[col] = {
            "bin_edges": [_safe_float(x) for x in bin_edges],
            "counts": [int(c) for c in counts],
        }

    # --- Correlation matrix (numeric columns only, needs at least 2) ---
    correlation_matrix = None
    if len(numeric_cols) >= 2:
        corr = df[numeric_cols].corr(numeric_only=True)
        correlation_matrix = {
            "columns": numeric_cols,
            "matrix": [
                [_safe_float(v) for v in row]
                for row in corr.values
            ],
        }

    # --- Category distributions (top N values per categorical column) ---
    category_distributions: dict[str, Any] = {}
    for col in categorical_cols:
        series = df[col].dropna()
        if series.empty:
            continue
        value_counts = series.value_counts().head(MAX_CATEGORIES)
        category_distributions[col] = {
            "labels": [str(x) for x in value_counts.index.tolist()],
            "counts": [int(c) for c in value_counts.values.tolist()],
            "truncated": int(series.nunique()) > MAX_CATEGORIES,
        }

    return {
        "row_count": int(df.shape[0]),
        "column_count": int(df.shape[1]),
        "numeric_columns": numeric_cols,
        "categorical_columns": categorical_cols,
        "summary_stats": summary_stats,
        "histograms": histograms,
        "correlation_matrix": correlation_matrix,
        "category_distributions": category_distributions,
    }
