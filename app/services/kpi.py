"""
Detects likely business KPI columns by name pattern matching, then computes
relevant aggregates. Deliberately conservative: only surfaces a KPI when a
column name clearly matches a known pattern, rather than guessing from data
shape alone — a wrong guess here (e.g. calling an ID column "revenue") is
worse than surfacing fewer, more trustworthy KPIs.
"""
from typing import Any

import numpy as np
import pandas as pd

COLUMN_PATTERNS = {
    "revenue": ["revenue", "sales", "amount", "total_amount", "income", "price"],
    "profit": ["profit", "margin", "net_income"],
    "cost": ["cost", "expense", "expenditure"],
    "quantity": ["quantity", "qty", "units", "volume"],
    "customer_id": ["customer", "client", "user_id", "buyer"],
    "date": ["date", "created_at", "order_date", "timestamp", "purchase_date"],
}


def _safe_float(value: Any) -> float | None:
    try:
        f = float(value)
        if np.isnan(f) or np.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return None


def _match_columns(df: pd.DataFrame, keywords: list[str], numeric_only: bool = True) -> list[str]:
    matches = []
    for col in df.columns:
        col_lower = col.lower().strip()
        if any(kw in col_lower for kw in keywords):
            if numeric_only and not pd.api.types.is_numeric_dtype(df[col]):
                continue
            matches.append(col)
    return matches


def _find_date_column(df: pd.DataFrame) -> tuple[str | None, pd.Series | None]:
    candidates = _match_columns(df, COLUMN_PATTERNS["date"], numeric_only=False)
    for col in candidates:
        parsed = pd.to_datetime(df[col], errors="coerce")
        if parsed.notna().sum() > 0:
            return col, parsed
    return None, None


def detect_kpis(df: pd.DataFrame) -> dict[str, Any]:
    revenue_cols = _match_columns(df, COLUMN_PATTERNS["revenue"])
    profit_cols = _match_columns(df, COLUMN_PATTERNS["profit"])
    quantity_cols = _match_columns(df, COLUMN_PATTERNS["quantity"])
    customer_cols = _match_columns(df, COLUMN_PATTERNS["customer_id"], numeric_only=False)
    date_col, parsed_dates = _find_date_column(df)

    kpis: list[dict[str, Any]] = []

    if revenue_cols:
        col = revenue_cols[0]
        series = df[col].dropna()
        if len(series):
            kpis.append({
                "name": "Total Revenue",
                "source_column": col,
                "value": _safe_float(series.sum()),
                "format": "currency",
            })
            kpis.append({
                "name": "Average Order Value",
                "source_column": col,
                "value": _safe_float(series.mean()),
                "format": "currency",
            })

        if date_col is not None:
            trend = pd.DataFrame({"date": parsed_dates, "value": df[col]}).dropna()
            if not trend.empty:
                monthly = trend.groupby(trend["date"].dt.to_period("M"))["value"].sum().sort_index()
                if len(monthly) >= 2 and monthly.iloc[-2] != 0:
                    growth_pct = (monthly.iloc[-1] - monthly.iloc[-2]) / monthly.iloc[-2] * 100
                    kpis.append({
                        "name": "Month-over-Month Revenue Growth",
                        "source_column": col,
                        "value": _safe_float(growth_pct),
                        "format": "percent",
                    })

    if profit_cols:
        col = profit_cols[0]
        series = df[col].dropna()
        if len(series):
            kpis.append({
                "name": "Total Profit",
                "source_column": col,
                "value": _safe_float(series.sum()),
                "format": "currency",
            })

    if quantity_cols:
        col = quantity_cols[0]
        series = df[col].dropna()
        if len(series):
            kpis.append({
                "name": "Total Units",
                "source_column": col,
                "value": _safe_float(series.sum()),
                "format": "number",
            })

    if customer_cols:
        col = customer_cols[0]
        unique_customers = int(df[col].nunique())
        if unique_customers:
            kpis.append({
                "name": "Unique Customers",
                "source_column": col,
                "value": unique_customers,
                "format": "number",
            })
            if revenue_cols:
                rev_series = df[revenue_cols[0]].dropna()
                if len(rev_series):
                    clv = rev_series.sum() / unique_customers
                    kpis.append({
                        "name": "Revenue per Customer",
                        "source_column": f"{revenue_cols[0]} / {col}",
                        "value": _safe_float(clv),
                        "format": "currency",
                    })

    return {
        "kpis": kpis,
        "detected_columns": {
            "revenue_columns": revenue_cols,
            "profit_columns": profit_cols,
            "quantity_columns": quantity_cols,
            "customer_columns": customer_cols,
            "date_column": date_col,
        },
    }
