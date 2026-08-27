"""
Builds a downloadable PDF summarizing everything the platform knows about a
dataset: overview, data quality, cleaning results, business KPIs, and EDA
stats. Kept as plain functions (not tied to FastAPI) so it's easy to test
standalone and reuse later (e.g. for a scheduled report job).
"""
from datetime import datetime
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)


def _fmt(value: Any, fmt: str = "number") -> str:
    if value is None:
        return "N/A"
    if fmt == "currency":
        return f"${value:,.2f}"
    if fmt == "percent":
        return f"{value:+.1f}%"
    if isinstance(value, float):
        return f"{value:,.2f}"
    return str(value)


def generate_report_pdf(
    output_path: str,
    dataset_filename: str,
    rows: int,
    columns: int,
    data_quality_score: float | None,
    cleaning_summary: dict | None,
    kpi_result: dict | None,
    eda_result: dict | None,
) -> None:
    styles = getSampleStyleSheet()
    title_style = styles["Title"]
    heading_style = styles["Heading2"]
    body_style = styles["Normal"]
    muted_style = ParagraphStyle(
        "Muted", parent=body_style, textColor=colors.HexColor("#666666"), fontSize=9,
    )

    doc = SimpleDocTemplate(output_path, pagesize=letter,
                             topMargin=0.75 * inch, bottomMargin=0.75 * inch)
    story = []

    # --- Header ---
    story.append(Paragraph("Data Detective — Analysis Report", title_style))
    story.append(Paragraph(f"Dataset: {dataset_filename}", heading_style))
    story.append(Paragraph(
        f"Generated {datetime.utcnow().strftime('%B %d, %Y at %H:%M UTC')}",
        muted_style,
    ))
    story.append(Spacer(1, 20))

    # --- Overview table ---
    story.append(Paragraph("Overview", heading_style))
    overview_data = [
        ["Rows", str(rows)],
        ["Columns", str(columns)],
        ["Data Quality Score", f"{data_quality_score:.1f} / 100" if data_quality_score is not None else "N/A"],
    ]
    overview_table = Table(overview_data, colWidths=[2 * inch, 3 * inch])
    overview_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f0f0f0")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(overview_table)
    story.append(Spacer(1, 20))

    # --- Cleaning summary ---
    if cleaning_summary:
        story.append(Paragraph("Data Cleaning Summary", heading_style))
        rows_before = cleaning_summary.get("rows_before")
        rows_after = cleaning_summary.get("rows_after")
        dup_removed = cleaning_summary.get("duplicates_removed", 0)
        missing_fixed = cleaning_summary.get("missing_values_fixed", {})
        whitespace_fixed = cleaning_summary.get("whitespace_fixed_columns", [])
        outliers = cleaning_summary.get("outliers_detected", {})

        clean_data = [
            ["Rows before cleaning", str(rows_before)],
            ["Rows after cleaning", str(rows_after)],
            ["Duplicate rows removed", str(dup_removed)],
            ["Columns with missing values fixed", str(len(missing_fixed)) if missing_fixed else "0"],
            ["Columns with whitespace fixed", ", ".join(whitespace_fixed) if whitespace_fixed else "None"],
        ]
        clean_table = Table(clean_data, colWidths=[2.5 * inch, 3.5 * inch])
        clean_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f0f0f0")),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(clean_table)

        if outliers:
            story.append(Spacer(1, 10))
            story.append(Paragraph(
                "Note: outliers were detected but not automatically removed — "
                "review these values before drawing conclusions:",
                body_style,
            ))
            outlier_lines = [
                f"- <b>{col}</b>: {info['count']} value(s) outside expected range "
                f"({info['lower_bound']:.1f} to {info['upper_bound']:.1f})"
                for col, info in outliers.items()
            ]
            story.append(Paragraph("<br/>".join(outlier_lines), body_style))
        story.append(Spacer(1, 20))

    # --- KPIs ---
    if kpi_result and kpi_result.get("kpis"):
        story.append(Paragraph("Key Business Metrics", heading_style))
        kpi_rows = [["Metric", "Value", "Source Column"]]
        for kpi in kpi_result["kpis"]:
            kpi_rows.append([
                kpi["name"],
                _fmt(kpi["value"], kpi.get("format", "number")),
                kpi.get("source_column", ""),
            ])
        kpi_table = Table(kpi_rows, colWidths=[2.2 * inch, 1.6 * inch, 2.2 * inch])
        kpi_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2c3e50")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7f7f7")]),
        ]))
        story.append(kpi_table)
        story.append(Spacer(1, 20))
    elif kpi_result is not None:
        story.append(Paragraph("Key Business Metrics", heading_style))
        story.append(Paragraph(
            "No standard business metric columns (revenue, quantity, customer ID, etc.) "
            "were detected by name in this dataset.",
            muted_style,
        ))
        story.append(Spacer(1, 20))

    # --- EDA summary stats ---
    if eda_result and eda_result.get("summary_stats"):
        story.append(PageBreak())
        story.append(Paragraph("Column Summary Statistics", heading_style))
        stats = eda_result["summary_stats"]

        numeric_rows = [["Column", "Count", "Mean", "Std Dev", "Min", "Median", "Max"]]
        categorical_rows = [["Column", "Count", "Unique Values", "Most Common"]]
        for col, info in stats.items():
            if info["type"] == "numeric":
                numeric_rows.append([
                    col, str(info["count"]), _fmt(info["mean"]), _fmt(info["std"]),
                    _fmt(info["min"]), _fmt(info["median"]), _fmt(info["max"]),
                ])
            else:
                categorical_rows.append([
                    col, str(info["count"]), str(info["unique_values"]),
                    str(info.get("top_value") or "N/A"),
                ])

        if len(numeric_rows) > 1:
            story.append(Paragraph("Numeric Columns", styles["Heading3"]))
            t = Table(numeric_rows, repeatRows=1)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2c3e50")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]))
            story.append(t)
            story.append(Spacer(1, 16))

        if len(categorical_rows) > 1:
            story.append(Paragraph("Categorical Columns", styles["Heading3"]))
            t = Table(categorical_rows, repeatRows=1)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2c3e50")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]))
            story.append(t)

    doc.build(story)
