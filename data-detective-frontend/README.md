# Data Detective — Frontend

React + Vite + Tailwind dashboard for the Data Detective API. Dark "case
file" aesthetic — every dataset you upload is a "case," with a status badge,
data quality score, and tabs for cleaning, exploration, and business metrics.

## Design notes (for your resume writeup / portfolio description)

- **Color**: near-black ink background (`#0A0E14`), signal-green accent
  (`#3DDC97`) for primary actions and positive states, amber for warnings
  (outliers, in-progress), red for errors.
- **Type**: Space Grotesk for headings (technical, distinctive), Inter for
  body text, JetBrains Mono for data values/IDs — numbers and identifiers
  read as data, not prose.
- **Signature element**: the "reticle" corner-bracket frame around the
  headline data quality score — a targeting/scan-overlay motif that ties
  back to the "detective investigating data" concept without being literal
  about it (see `.reticle` in `src/index.css`).

## Setup

**Requires Node.js 20.19+ or 22.12+** (Vite 8's minimum). Check yours with:
```bash
node --version
```
If it's older, download the LTS installer from https://nodejs.org — this is
a completely separate install from Python, no conflict with your existing
setup.

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the env file and confirm the backend URL:
   ```bash
   cp .env.example .env
   ```
   By default it points to `http://localhost:8000` — your FastAPI backend.
   Make sure that's running first (`uvicorn app.main:app --reload` in the
   backend project).
3. Run the dev server:
   ```bash
   npm run dev
   ```
4. Open the URL it prints (usually `http://localhost:5173`).

## Project structure

```
src/
├── lib/api.js            # Axios client + every backend endpoint call
├── components/Layout.jsx # Sidebar shell used by all authenticated pages
└── pages/
    ├── Login.jsx
    ├── Register.jsx
    ├── Dashboard.jsx      # "Cases" list + upload
    └── DatasetDetail.jsx  # Tabs: Overview, Clean, Explore, Metrics
```

## Known tradeoffs (worth mentioning if asked in an interview)

- **JWT stored in localStorage** (`src/lib/api.js`): simple and works, but
  is readable by any JS running on the page (XSS risk). A production system
  would use an httpOnly cookie set by the backend instead. Deliberate
  tradeoff for a portfolio-scope project, not an oversight.
- **No global state manager** (Redux/Zustand): each page fetches its own
  data with local `useState`. Fine at this size; would need real state
  management if the app grew multi-page-shared-data heavy.
- **Charts recompute EDA/KPIs on each tab's first open**, not cached
  client-side — matches the backend's behavior of always computing fresh
  from the current (possibly just-cleaned) file rather than serving stale
  results.

## Verified before shipping

`npm run build` was run and passed cleanly with no errors before this was
handed to you — Vite/Rollup fail loudly on bad imports, JSX syntax errors,
or missing dependencies, so a clean build is a real signal the code is
structurally sound. Still worth testing the actual user flows once running
locally (register -> upload -> clean -> explore -> metrics -> export PDF).
