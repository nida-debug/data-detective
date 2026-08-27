"""
Root-cause analysis service.

Takes the output of detect_anomalies() and the original DataFrame, and for
each anomaly tries to find a *statistical association* — not a proven cause —
by checking whether specific categorical values are overrepresented among the
flagged rows compared to their share of the whole dataset.

This deliberately does not claim causation. Every finding here is phrased as
"associated with" / "worth investigating", because IQR outliers + category
overrepresentation is evidence of correlation, not proof of a causal driver.
"""

import numpy as np
import pandas as pd


def _outlier_mask(series: pd.Series) -> pd.Series:
    s = series.dropna()
    if s.empty or s.nunique() <= 1:
        return pd.Series([False] * len(series), index=series.index)
    q1, q3 = s.quantile(0.25), s.quantile(0.75)
    iqr = q3 - q1
    if iqr == 0:
        return pd.Series([False] * len(series), index=series.index)
    lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    return (series < lower) | (series > upper)


def _categorical_drivers(df: pd.DataFrame, mask: pd.Series, categorical_cols: list) -> list:
    """Find categorical values overrepresented among masked (flagged) rows
    vs. their share of the full dataset. Returns up to 3 strongest matches."""
    drivers = []
    flagged = df[mask]
    if flagged.empty:
        return drivers

    for col in categorical_cols:
        if col not in df.columns:
            continue
        overall_dist = df[col].value_counts(normalize=True)
        flagged_dist = flagged[col].value_counts(normalize=True)

        for value, flagged_share in flagged_dist.items():
            overall_share = float(overall_dist.get(value, 0))
            # Only worth flagging if the value dominates the flagged rows
            # AND is meaningfully more common there than overall.
            if flagged_share >= 0.5 and (flagged_share - overall_share) >= 0.25:
                drivers.append({
                    "column": col,
                    "value": str(value),
                    "share_in_flagged": float(round(flagged_share, 3)),
                    "share_overall": float(round(overall_share, 3)),
                })

    drivers.sort(key=lambda d: d["share_in_flagged"] - d["share_overall"], reverse=True)
    return drivers[:3]


def generate_root_causes(df: pd.DataFrame, anomalies: list) -> dict:
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    categorical_cols = df.select_dtypes(exclude=[np.number]).columns.tolist()

    findings = []
    counter = 1

    for anomaly in anomalies:
        tags = anomaly.get("tags", [])

        if "outlier" in tags:
            col = anomaly.get("column")
            if col not in numeric_cols:
                continue
            mask = _outlier_mask(df[col])
            drivers = _categorical_drivers(df, mask, categorical_cols)

            if drivers:
                lead = drivers[0]
                explanation = (
                    f"Outlier values in '{col}' are concentrated in rows where "
                    f"'{lead['column']}' = '{lead['value']}' "
                    f"({round(lead['share_in_flagged'] * 100)}% of outliers vs "
                    f"{round(lead['share_overall'] * 100)}% of the full dataset). "
                    f"This is a statistical association, not proven causation — "
                    f"worth investigating whether '{lead['value']}' is a genuine driver."
                )
                confidence = "medium"
            else:
                explanation = (
                    f"Outliers in '{col}' don't cluster around any single category "
                    f"in this dataset. The cause may be external — timing, an "
                    f"upstream system, or something not captured in these columns."
                )
                confidence = "low"

            findings.append({
                "id": f"RC-{counter:03d}",
                "anomaly_id": anomaly.get("id"),
                "title": f"Investigating outliers in '{col}'",
                "explanation": explanation,
                "candidate_drivers": drivers,
                "confidence": confidence,
            })
            counter += 1

        elif "correlation" in tags:
            metric = anomaly.get("metric", {})
            corr = metric.get("correlation")
            cols_involved = [c.strip() for c in anomaly.get("column", "").split(",")]
            c1 = cols_involved[0] if len(cols_involved) > 0 else "these columns"
            c2 = cols_involved[1] if len(cols_involved) > 1 else ""

            explanation = (
                f"'{c1}' and '{c2}' move together (r = {corr}). Correlation alone "
                f"can't establish which one causes the other, or whether both are "
                f"driven by a third factor not present in this dataset."
            )
            findings.append({
                "id": f"RC-{counter:03d}",
                "anomaly_id": anomaly.get("id"),
                "title": "Correlation requires further investigation",
                "explanation": explanation,
                "candidate_drivers": [],
                "confidence": "low",
            })
            counter += 1

        # Missing-data and duplicate-row anomalies don't have a meaningful
        # "root cause" in the same statistical sense — skip them here rather
        # than force a fabricated explanation.

    return {
        "root_causes": findings,
        "root_cause_count": len(findings),
    }
