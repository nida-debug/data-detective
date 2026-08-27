"""
Cleaning logic kept separate from the API layer so it can be unit-tested
and reused (e.g. from a background job later) without touching FastAPI code.
"""
import re
from typing import Any

import pandas as pd


def clean_dataframe(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, Any]]:
    """
    Applies a conservative set of automatic fixes and returns (cleaned_df, summary).

    What's fixed automatically (safe, reversible operations):
      - Leading/trailing whitespace + collapsed internal whitespace in text columns
      - Exact duplicate rows removed
      - Missing values filled (median for numeric, mode for categorical)

    What's only flagged, not changed (needs human judgment):
      - Outliers (IQR method) — removing these automatically can silently
        delete real data (e.g. a genuinely huge sale), so we report them
        and let the user decide via the frontend later.
    """
    rows_before, n_columns = df.shape
    missing_before = df.isnull().sum()

    # --- 1. Whitespace / formatting cleanup on text columns ---
    text_cols = df.select_dtypes(include=["object"]).columns.tolist()
    whitespace_fixed_columns = []
    for col in text_cols:
        mask = df[col].notnull()
        if not mask.any():
            continue
        original_values = df.loc[mask, col].astype(str)
        cleaned_values = original_values.str.strip().apply(lambda s: re.sub(r"\s+", " ", s))
        if (cleaned_values != original_values).any():
            whitespace_fixed_columns.append(col)
        df.loc[mask, col] = cleaned_values

    # --- 2. Duplicate rows ---
    duplicates_removed = int(df.duplicated().sum())
    df = df.drop_duplicates().reset_index(drop=True)

    # --- 3. Missing values ---
    missing_values_fixed: dict[str, Any] = {}
    for col in df.columns:
        n_missing = int(df[col].isnull().sum())
        if n_missing == 0:
            continue
        if pd.api.types.is_numeric_dtype(df[col]):
            fill_value = df[col].median()
            df[col] = df[col].fillna(fill_value)
            missing_values_fixed[col] = {
                "method": "median",
                "fill_value": float(fill_value),
                "count": n_missing,
            }
        else:
            mode_series = df[col].mode()
            fill_value = mode_series.iloc[0] if not mode_series.empty else "Unknown"
            df[col] = df[col].fillna(fill_value)
            missing_values_fixed[col] = {
                "method": "mode",
                "fill_value": str(fill_value),
                "count": n_missing,
            }

    # --- 4. Outlier detection (flagged only, IQR method) ---
    outliers_detected: dict[str, Any] = {}
    numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
    for col in numeric_cols:
        q1 = df[col].quantile(0.25)
        q3 = df[col].quantile(0.75)
        iqr = q3 - q1
        if iqr == 0:
            continue
        lower_bound = q1 - 1.5 * iqr
        upper_bound = q3 + 1.5 * iqr
        count = int(((df[col] < lower_bound) | (df[col] > upper_bound)).sum())
        if count > 0:
            outliers_detected[col] = {
                "count": count,
                "lower_bound": float(lower_bound),
                "upper_bound": float(upper_bound),
            }

    rows_after, _ = df.shape

    summary = {
        "rows_before": int(rows_before),
        "rows_after": int(rows_after),
        "columns": int(n_columns),
        "duplicates_removed": duplicates_removed,
        "missing_values_before": {
            k: int(v) for k, v in missing_before.to_dict().items() if v > 0
        },
        "missing_values_fixed": missing_values_fixed,
        "whitespace_fixed_columns": whitespace_fixed_columns,
        "outliers_detected": outliers_detected,
    }

    return df, summary
