# Data Detective

A full-stack AI-powered analytics platform. Upload a dataset (CSV/XLSX) and it gets cleaned, profiled, and investigated like a case file — automatic outlier detection, root-cause analysis, KPI discovery, and trend forecasting, all surfaced through a dark "case-file" React dashboard.

## What's implemented

**Auth & data layer**
- JWT auth: register, login, `/auth/me`
- 4-table schema: `users`, `datasets`, `analyses`, `reports`
- Full CORS setup for a local frontend dev server

**Dataset ingestion**
- Upload (CSV/XLSX) with file type + size validation
- Automatic quick profile on upload (missing values, dtypes, duplicates)
- Data Quality Score (0–100 heuristic), always computed against the **original** upload — see Design Notes

**Cleaning**
- Whitespace/formatting normalization on text columns
- Duplicate row removal
- Missing value imputation (median for numeric, mode for categorical)
- Outliers detected via IQR and **flagged, not auto-removed** — before/after summary returned per operation

**Analysis**
- Full EDA endpoint: summary stats, histograms, correlation matrix, category distributions — returned as chart-ready JSON for Plotly/Recharts/Chart.js
- KPI auto-detection: pattern-matches column names (revenue, profit, cost, quantity, customer, date) and computes relevant aggregates (total revenue, AOV, unique customers, revenue per customer, MoM growth)
- Anomaly detection (IQR-based) with severity ratings
- Root-cause analysis: surfaces which categorical values concentrate detected anomalies, explicitly labeled as statistical association, not proven causation
- Linear trend forecasting when a date column is present
- PDF report export (ReportLab) bundling quality score, cleaning summary, KPIs, and EDA into one document

**Frontend**
- React + Vite + Tailwind, dark "case-file" investigation theme
- Login / Register pages
- Dashboard (dataset list/upload) + per-dataset detail view with tabs: Overview, Clean, Explore, Metrics, Signals, Root Cause, Forecast

Verified end-to-end against a real PostgreSQL instance (not just SQLite) — register → login → protected route → upload → clean → every analysis endpoint → report export, plus auth rejection for bad passwords and missing tokens.

## Project structure

```
data-detective/
├── app/
│   ├── main.py              # FastAPI app, CORS, router wiring
│   ├── config.py             # env-based settings
│   ├── database.py            # SQLAlchemy engine/session
│   ├── models.py               # ORM models (User, Dataset, Analysis, Report)
│   ├── schemas.py                # Pydantic request/response models
│   ├── auth.py                    # password hashing, JWT, current-user dependency
│   ├── routers/
│   │   ├── auth.py                  # /auth/register, /auth/login, /auth/me
│   │   └── datasets.py               # upload, list, profile, clean, eda, kpis, anomalies, root-causes, predictions, report
│   └── services/
│       ├── cleaning.py                # whitespace, duplicates, missing values, outlier flagging
│       ├── eda.py                      # summary stats, histograms, correlation matrix
│       ├── kpi.py                       # KPI column detection + aggregates
│       ├── anomaly.py                    # IQR-based anomaly detection
│       ├── root_cause.py                  # categorical association analysis
│       ├── prediction.py                   # linear trend forecasting
│       └── report.py                        # PDF report generation
├── uploads/                # uploaded + cleaned files (gitignored)
├── requirements.txt
└── .env.example

data-detective-frontend/
├── src/
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── DatasetDetail.jsx
│   │   ├── Login.jsx
│   │   └── Register.jsx
│   ├── components/
│   └── lib/api.js
└── package.json
```

## Setup

### Backend

1. **Install PostgreSQL** locally (or use Docker: `docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`)
2. Create the database:
   ```bash
   createdb data_detective
   ```
3. Copy `.env.example` to `.env` and adjust if needed:
   ```bash
   cp .env.example .env
   ```
4. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
   > Note: if you hit a `bcrypt`/`passlib` error about "password cannot be
   > longer than 72 bytes" or version detection, it's because `bcrypt>=4.1`
   > broke `passlib`'s version check. This is already pinned in
   > `requirements.txt` (`bcrypt==4.0.1`), but if you upgrade dependencies
   > later, keep that pin or migrate off `passlib` to calling `bcrypt` directly.
5. Run the server:
   ```bash
   uvicorn app.main:app --reload
   ```
6. Open the interactive API docs: **http://localhost:8000/docs**

### Frontend

```bash
cd data-detective-frontend
npm install
npm run dev
```

Runs at **http://localhost:5173**. Make sure the backend is running on port 8000 first (the frontend's `lib/api.js` points there by default).

## Quick test via curl

```bash
# Register
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"password123","full_name":"Your Name"}'

# Login (note: this endpoint uses form data, not JSON)
curl -X POST http://localhost:8000/auth/login \
  -d "username=you@example.com&password=password123"

# Upload a dataset (replace TOKEN with the access_token from login)
curl -X POST http://localhost:8000/datasets/upload \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@sample.csv"
```

## Design notes / decisions worth knowing for your resume writeup

- **Data quality score is computed against the original upload, not the cleaned data.** The `/clean` endpoint originally recalculated the score off the just-cleaned dataframe — which by definition has zero missing values and zero duplicates, so it always returned ~100 regardless of how dirty the source file was. Fixed by scoring against the pre-cleaning dataframe, which is what actually got persisted in the `/upload` step and is still in scope in the same function. This is a good "bug I found and fixed" story: the failure was silent (no crash, no error — just a misleading number), and it only surfaces when you test with a genuinely messy file instead of clean sample data.
- **Outliers are flagged, not auto-removed.** Automatically deleting statistical outliers can silently discard real data (e.g. a genuinely large sale) — the app surfaces them for human review instead via the Signals tab.
- **Root-cause findings are labeled as statistical associations, not proven causation** — the app is explicit about this distinction rather than overstating confidence to the user.
- **`create_all()` vs Alembic**: tables are currently created automatically on startup. Fine for this project's scope, but in a real team setting this is where you'd switch to Alembic migrations for schema evolution.
- **Numpy → native type casting**: profiling and scoring code explicitly casts numpy scalars (`np.int64`, `np.float64`) to native Python types before storing as JSON — Postgres' JSON column via psycopg2 can't serialize numpy types directly. The kind of bug that only shows up testing against real Postgres instead of assuming it'll work.
- **UUID primary keys**: used instead of auto-increment ints — avoids leaking row counts/sequential IDs, matches how most production systems are built.

## License

MIT
