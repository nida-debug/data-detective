"""
Anomaly detection service.

Mirrors the structure of app/services/eda.py and app/services/kpi.py:
takes a cleaned/raw DataFrame, returns a JSON-serializable dict that gets
stored directly in Analysis.result_json.

Detection methods used (all statistically grounded, nothing fabricated):
  1. IQR-based outlier detection per numeric column
  2. Strong pairwise correlation between numeric columns (|r| >= 0.8)
  3. High missing-data ratio per column
  4. Duplicate rows

Each finding is tagged with a severity (critical/high/medium/low) derived
from how extreme the underlying number is, not a fixed label.
"""

import numpy as np
import pandas as pd


def _severity_for_ratio(ratio: float, critical=0.4, high=0.2, medium=0.08) -> str:
    if ratio >= critical:
        return "critical"
    if ratio >= high:
        return "high"
    if ratio >= medium:
        return "medium"
    return "low"


def detect_anomalies(df: pd.DataFrame) -> dict:
    anomalies = []
    counter = 1
    total_rows = len(df) or 1

    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

    # 1. Outlier detection per numeric column (1.5x IQR = flagged, 3x IQR = extreme)
    for col in numeric_cols:
        series = df[col].dropna()
        if series.empty or series.nunique() <= 1:
            continue

        q1, q3 = series.quantile(0.25), series.quantile(0.75)
        iqr = q3 - q1
        if iqr == 0:
            continue

        lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        outliers = series[(series < lower) | (series > upper)]
        if len(outliers) == 0:
            continue

        ratio = len(outliers) / len(series)
        extreme_count = int(((series < q1 - 3 * iqr) | (series > q3 + 3 * iqr)).sum())
        severity = _severity_for_ratio(ratio, critical=0.2, high=0.1, medium=0.03)
        if extreme_count > 0 and severity not in ("critical",):
            severity = "high"  # bump up if any truly extreme values exist

        anomalies.append({
            "id": f"AN-{counter:03d}",
            "title": f"Outliers detected in '{col}'",
            "severity": severity,
            "column": col,
            "description": (
                f"{len(outliers)} of {len(series)} values in '{col}' fall outside the "
                f"expected range ({round(float(lower), 2)} to {round(float(upper), 2)}), "
                f"based on the interquartile range."
                + (f" {extreme_count} are extreme (beyond 3x IQR)." if extreme_count else "")
            ),
            "tags": ["outlier", col],
            "confirmed": True,
            "metric": {
                "outlier_count": int(len(outliers)),
                "total_count": int(len(series)),
                "lower_bound": float(round(lower, 4)),
                "upper_bound": float(round(upper, 4)),
            },
        })
        counter += 1

    # 2. Strong pairwise correlations — flagged as unconfirmed since correlation != causation
    if len(numeric_cols) >= 2:
        corr = df[numeric_cols].corr(numeric_only=True)
        seen = set()
        for c1 in numeric_cols:
            for c2 in numeric_cols:
                if c1 == c2:
                    continue
                pair = tuple(sorted([c1, c2]))
                if pair in seen:
                    continue
                seen.add(pair)

                value = corr.loc[c1, c2]
                if pd.isna(value) or abs(value) < 0.8:
                    continue

                anomalies.append({
                    "id": f"AN-{counter:03d}",
                    "title": f"Strong correlation between '{c1}' and '{c2}'",
                    "severity": "medium",
                    "column": f"{c1}, {c2}",
                    "description": (
                        f"'{c1}' and '{c2}' move together with a correlation of "
                        f"{round(float(value), 2)}. Worth checking whether one drives "
                        f"the other or if they share a common cause."
                    ),
                    "tags": ["correlation", c1, c2],
                    "confirmed": False,
                    "metric": {"correlation": float(round(value, 4))},
                })
                counter += 1

    # 3. Missing data per column
    for col in df.columns:
        missing = int(df[col].isnull().sum())
        ratio = missing / total_rows
        if ratio < 0.10:
            continue
        severity = _severity_for_ratio(ratio, critical=0.4, high=0.25, medium=0.10)
        anomalies.append({
            "id": f"AN-{counter:03d}",
            "title": f"Missing data in '{col}'",
            "severity": severity,
            "column": col,
            "description": (
                f"{missing} of {total_rows} rows ({round(ratio * 100, 1)}%) are missing "
                f"a value for '{col}'."
            ),
            "tags": ["missing-data", col],
            "confirmed": True,
            "metric": {"missing_count": missing, "missing_ratio": float(round(ratio, 4))},
        })
        counter += 1

    # 4. Duplicate rows
    duplicate_count = int(df.duplicated().sum())
    if duplicate_count > 0:
        ratio = duplicate_count / total_rows
        severity = _severity_for_ratio(ratio, critical=0.3, high=0.15, medium=0.05)
        anomalies.append({
            "id": f"AN-{counter:03d}",
            "title": "Duplicate rows detected",
            "severity": severity,
            "column": None,
            "description": (
                f"{duplicate_count} of {total_rows} rows ({round(ratio * 100, 1)}%) are "
                f"exact duplicates of another row."
            ),
            "tags": ["duplicates", "data-quality"],
            "confirmed": True,
            "metric": {"duplicate_count": duplicate_count, "duplicate_ratio": float(round(ratio, 4))},
        })
        counter += 1

    severity_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    anomalies.sort(key=lambda a: severity_rank.get(a["severity"], 4))

    return {
        "anomalies": anomalies,
        "anomaly_count": len(anomalies),
        "severity_summary": {
            level: sum(1 for a in anomalies if a["severity"] == level)
            for level in ["critical", "high", "medium", "low"]
        },
    }
