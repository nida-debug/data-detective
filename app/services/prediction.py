"""
Prediction service.

Fits a simple linear trend (numpy polyfit, degree 1) per numeric column
against a detected date column, and forecasts one period ahead.

Deliberately not dressed up as more sophisticated than it is: this is a
straight-line trend, not seasonally adjusted, not an ML model. fit_strength
(the absolute correlation coefficient) tells the caller how much to trust
the forecast — a low value means the trend is weak/noisy and the forecast
number shouldn't be taken as reliable.
"""

import numpy as np
import pandas as pd


def generate_predictions(df: pd.DataFrame, date_column: str = None, target_columns: list = None) -> dict:
    if not date_column:
        for col in df.columns:
            if "date" in col.lower():
                date_column = col
                break

    if not date_column or date_column not in df.columns:
        return {
            "predictions": [],
            "date_column_used": None,
            "note": "No date column detected — trend forecasting needs a time dimension.",
        }

    try:
        dates = pd.to_datetime(df[date_column], errors="coerce")
    except Exception:
        return {
            "predictions": [],
            "date_column_used": date_column,
            "note": "Could not parse the date column.",
        }

    valid = dates.notna()
    if valid.sum() < 3:
        return {
            "predictions": [],
            "date_column_used": date_column,
            "note": "Not enough dated rows to fit a trend (need at least 3).",
        }

    x = (dates[valid] - dates[valid].min()).dt.days.values.astype(float)
    numeric_cols = target_columns or df.select_dtypes(include=[np.number]).columns.tolist()

    predictions = []
    for col in numeric_cols:
        y = df.loc[valid, col].values.astype(float)
        if len(y) < 3 or np.all(y == y[0]) or np.std(x) == 0:
            continue

        slope, intercept = np.polyfit(x, y, 1)
        r = np.corrcoef(x, y)[0, 1] if np.std(y) > 0 else 0.0

        step = (x.max() - x.min()) / max(len(x) - 1, 1)
        next_x = x.max() + step
        forecast_value = slope * next_x + intercept

        predictions.append({
            "column": col,
            "trend": "increasing" if slope > 0.0001 else "decreasing" if slope < -0.0001 else "flat",
            "slope_per_day": float(round(slope, 6)),
            "fit_strength": float(round(abs(r), 3)),
            "forecast_next_period": float(round(forecast_value, 2)),
            "method": "linear trend on historical values — not seasonally adjusted",
        })

    return {
        "predictions": predictions,
        "date_column_used": date_column,
    }
