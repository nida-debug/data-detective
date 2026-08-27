import React, { useState, useEffect } from "react";
import {
  Crosshair,
  Radar as RadarIcon,
  Clock,
  ArrowUpRight,
  Activity,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { api } from "../lib/api";

// ---------------------------------------------------------------------------
// KPI formatting — matches the {name, source_column, value, format} shape
// returned by GET /datasets/{id}/kpis
// ---------------------------------------------------------------------------

function formatKpiValue(value, format) {
  if (typeof value !== "number") return String(value);
  switch (format) {
    case "currency":
      return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    case "percent":
      return `${value.toFixed(1)}%`;
    case "number":
    default:
      return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
  }
}

// Severity colors/signal-bar lengths for display — the actual severity
// value comes from the backend's real detection in app/services/anomaly.py
// (IQR outliers, strong correlations, missing data, duplicate rows).
const SEVERITY = {
  critical: { color: "var(--alert)", strength: 9, label: "CRITICAL" },
  high: { color: "var(--signal)", strength: 7, label: "HIGH" },
  medium: { color: "var(--warn)", strength: 5, label: "MEDIUM" },
  low: { color: "var(--ok)", strength: 3, label: "LOW" },
};

// Radar blip geometry: spread evenly around the circle. Real anomalies don't
// carry individual timestamps (they're all detected in one pass), so radius
// here is just for visual separation between blips, not a recency signal.
function computeRadarBlips(insights) {
  const count = Math.max(insights.length, 1);
  return insights.map((insight, idx) => {
    const radius = 82 - (idx % 5) * 16;
    const angle = 30 + idx * (300 / count);
    const rad = ((angle - 90) * Math.PI) / 180;
    return {
      ...insight,
      x: 100 + radius * Math.cos(rad),
      y: 100 + radius * Math.sin(rad),
    };
  });
}

// ---------------------------------------------------------------------------

function HudFrame({ children, active }) {
  return (
    <div className="dd-hud" data-active={active}>
      <span className="dd-corner dd-corner-tl" />
      <span className="dd-corner dd-corner-tr" />
      <span className="dd-corner dd-corner-bl" />
      <span className="dd-corner dd-corner-br" />
      {children}
    </div>
  );
}

function SignalBar({ strength, color }) {
  return (
    <div className="dd-signalbar" aria-hidden="true">
      {Array.from({ length: 10 }).map((_, i) => (
        <span
          key={i}
          className="dd-signalseg"
          style={{ background: i < strength ? color : "var(--grid)" }}
        />
      ))}
    </div>
  );
}

function KPIStat({ kpi }) {
  return (
    <HudFrame>
      <div className="dd-kpi">
        <div className="dd-kpi-label">{kpi.name}</div>
        <div className="dd-mono dd-kpi-value">{formatKpiValue(kpi.value, kpi.format)}</div>
        {kpi.source_column && (
          <div className="dd-kpi-source dd-mono">from {kpi.source_column}</div>
        )}
      </div>
    </HudFrame>
  );
}

function InsightCard({ insight, hovered, setHovered }) {
  const s = SEVERITY[insight.severity] || SEVERITY.low;
  return (
    <div
      onMouseEnter={() => setHovered(insight.id)}
      onMouseLeave={() => setHovered(null)}
    >
      <HudFrame active={hovered === insight.id}>
        <div className="dd-card">
          <div className="dd-card-head">
            <Crosshair size={13} strokeWidth={2} color={s.color} />
            <span className="dd-mono dd-case-id">{insight.id}</span>
            {insight.column && (
              <span className="dd-mono dd-time">{insight.column}</span>
            )}
          </div>

          <h3 className="dd-card-title">{insight.title}</h3>
          <p className="dd-card-desc">{insight.description}</p>

          <div className="dd-card-signal">
            <SignalBar strength={s.strength} color={s.color} />
            <span className="dd-mono dd-sev-label" style={{ color: s.color }}>
              {s.label}
            </span>
          </div>

          <div className="dd-card-foot">
            <div className="dd-tags">
              {(insight.tags || []).map((t) => (
                <span key={t} className="dd-mono dd-tag">
                  {t}
                </span>
              ))}
            </div>
            <button className="dd-investigate">
              Investigate <ArrowUpRight size={13} strokeWidth={2} />
            </button>
          </div>

          {insight.confirmed === false && (
            <div className="dd-unconfirmed dd-mono">
              correlation, not confirmed causation
            </div>
          )}
        </div>
      </HudFrame>
    </div>
  );
}

export default function DataDetectiveRadarOverview({ datasetId }) {
  const [hovered, setHovered] = useState(null);

  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [insightsError, setInsightsError] = useState(null);

  useEffect(() => {
    if (!datasetId) {
      setLoading(false);
      setError("No dataset selected yet.");
      setInsightsLoading(false);
      setInsightsError(null);
      return;
    }

    setLoading(true);
    setError(null);
    api
      .getKpis(datasetId)
      .then((res) => {
        setKpis(res.data?.result_json?.kpis || []);
      })
      .catch((err) => {
        setError(
          err.response?.data?.detail || "Couldn't load KPIs for this dataset."
        );
      })
      .finally(() => setLoading(false));

    setInsightsLoading(true);
    setInsightsError(null);
    api
      .getAnomalies(datasetId)
      .then((res) => {
        setInsights(res.data?.result_json?.anomalies || []);
      })
      .catch((err) => {
        setInsightsError(
          err.response?.data?.detail || "Couldn't run anomaly detection for this dataset."
        );
      })
      .finally(() => setInsightsLoading(false));
  }, [datasetId]);

  const radarBlips = computeRadarBlips(insights || []);
  const activeCount = insights ? insights.length : 0;

  return (
    <div className="dd-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

        .dd-root {
          --void: #05070a;
          --panel: #0b0f13;
          --grid: #1b2329;
          --signal: #2fe6c9;
          --alert: #ff5555;
          --warn: #ffb13d;
          --ok: #57c785;
          --text: #e7eef0;
          --text-muted: #6c7a80;

          background: var(--void);
          color: var(--text);
          font-family: 'Inter', sans-serif;
          padding: 40px clamp(16px, 4vw, 48px);
          border-radius: 18px;
          max-width: 920px;
          margin: 0 auto;
          background-image:
            linear-gradient(var(--grid) 1px, transparent 1px),
            linear-gradient(90deg, var(--grid) 1px, transparent 1px);
          background-size: 28px 28px;
          background-position: center;
        }

        .dd-mono { font-family: 'IBM Plex Mono', monospace; }

        .dd-header-row {
          display: flex;
          align-items: center;
          gap: 28px;
          margin-bottom: 36px;
          flex-wrap: wrap;
        }

        .dd-radar-wrap {
          width: 128px;
          height: 128px;
          flex-shrink: 0;
          position: relative;
        }
        .dd-radar-sweep {
          transform-origin: 100px 100px;
        }
        @media (prefers-reduced-motion: no-preference) {
          .dd-radar-sweep { animation: dd-spin 5s linear infinite; }
        }
        @keyframes dd-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: no-preference) {
          .dd-blip-pulse { animation: dd-blip 1.8s ease-in-out infinite; }
        }
        @keyframes dd-blip {
          0%, 100% { opacity: 1; r: 3.2; }
          50% { opacity: 0.45; r: 4.4; }
        }

        .dd-header-text { min-width: 220px; }
        .dd-eyebrow {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.16em;
          color: var(--signal);
          margin-bottom: 10px;
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .dd-title {
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700;
          font-size: clamp(24px, 3.2vw, 32px);
          text-transform: uppercase;
          letter-spacing: 0.01em;
          line-height: 1.08;
          margin: 0 0 8px 0;
        }
        .dd-subtitle {
          color: var(--text-muted);
          font-size: 14px;
          max-width: 48ch;
          margin: 0;
        }

        /* HUD frame — corner brackets instead of full borders */
        .dd-hud {
          position: relative;
          padding: 3px;
        }
        .dd-corner {
          position: absolute;
          width: 12px;
          height: 12px;
          border-color: var(--grid);
          border-style: solid;
          border-width: 0;
          transition: border-color 0.15s ease;
        }
        .dd-hud[data-active="true"] .dd-corner { border-color: var(--signal); }
        .dd-corner-tl { top: 0; left: 0; border-top-width: 1.5px; border-left-width: 1.5px; }
        .dd-corner-tr { top: 0; right: 0; border-top-width: 1.5px; border-right-width: 1.5px; }
        .dd-corner-bl { bottom: 0; left: 0; border-bottom-width: 1.5px; border-left-width: 1.5px; }
        .dd-corner-br { bottom: 0; right: 0; border-bottom-width: 1.5px; border-right-width: 1.5px; }

        .dd-kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          margin-bottom: 40px;
        }
        @media (max-width: 640px) {
          .dd-kpi-grid { grid-template-columns: repeat(2, 1fr); }
        }
        .dd-kpi {
          background: var(--panel);
          padding: 14px 14px 12px;
        }
        .dd-kpi-label {
          font-size: 11px;
          color: var(--text-muted);
          margin-bottom: 8px;
        }
        .dd-kpi-value {
          font-size: 21px;
          font-weight: 500;
          margin-bottom: 4px;
        }
        .dd-kpi-source {
          font-size: 10.5px;
          color: var(--text-muted);
          opacity: 0.75;
        }

        .dd-state-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12.5px;
          color: var(--text-muted);
          padding: 14px 16px;
          background: var(--panel);
          border-radius: 6px;
          margin-bottom: 40px;
        }
        .dd-state-row[data-error="true"] { color: var(--alert); }
        .dd-spin { animation: dd-rotate 0.9s linear infinite; }
        @keyframes dd-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .dd-placeholder-tag {
          margin-left: auto;
          font-size: 9.5px;
          letter-spacing: 0.08em;
          color: var(--warn);
          background: rgba(255, 177, 61, 0.08);
          border: 1px solid rgba(255, 177, 61, 0.3);
          padding: 2px 6px;
          border-radius: 3px;
          text-transform: uppercase;
        }

        .dd-section-label {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.14em;
          color: var(--text-muted);
          text-transform: uppercase;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .dd-card {
          background: var(--panel);
          padding: 16px 18px;
          margin-bottom: 12px;
        }
        .dd-card-head {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 8px;
        }
        .dd-case-id { font-size: 11px; color: var(--text-muted); }
        .dd-time { margin-left: auto; font-size: 11px; color: var(--text-muted); }

        .dd-card-title {
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 600;
          font-size: 16.5px;
          margin: 0 0 6px 0;
          line-height: 1.3;
        }
        .dd-card-desc {
          font-size: 13.5px;
          line-height: 1.55;
          color: var(--text-muted);
          margin: 0 0 14px 0;
        }

        .dd-card-signal {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
        }
        .dd-signalbar {
          display: flex;
          gap: 2px;
        }
        .dd-signalseg {
          width: 5px;
          height: 12px;
          border-radius: 1px;
        }
        .dd-sev-label {
          font-size: 10.5px;
          letter-spacing: 0.06em;
        }

        .dd-card-foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .dd-tags { display: flex; gap: 6px; flex-wrap: wrap; }
        .dd-tag {
          font-size: 10.5px;
          color: var(--signal);
          background: rgba(47, 230, 201, 0.08);
          border: 1px solid rgba(47, 230, 201, 0.25);
          padding: 2px 7px;
          border-radius: 3px;
        }

        .dd-investigate {
          font-family: 'Inter', sans-serif;
          font-size: 12.5px;
          font-weight: 500;
          color: var(--text);
          background: transparent;
          border: 1px solid var(--grid);
          border-radius: 4px;
          padding: 6px 10px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          cursor: pointer;
          transition: border-color 0.15s ease, color 0.15s ease;
        }
        .dd-investigate:hover { border-color: var(--signal); color: var(--signal); }
        .dd-investigate:focus-visible { outline: 2px solid var(--signal); outline-offset: 2px; }

        .dd-unconfirmed {
          margin-top: 10px;
          font-size: 11px;
          font-style: italic;
          color: var(--text-muted);
        }
      `}</style>

      <div className="dd-header-row">
        <div className="dd-radar-wrap">
          <svg viewBox="0 0 200 200" width="100%" height="100%">
            <circle cx="100" cy="100" r="90" fill="none" stroke="var(--grid)" strokeWidth="1" />
            <circle cx="100" cy="100" r="60" fill="none" stroke="var(--grid)" strokeWidth="1" />
            <circle cx="100" cy="100" r="30" fill="none" stroke="var(--grid)" strokeWidth="1" />
            <line x1="100" y1="10" x2="100" y2="190" stroke="var(--grid)" strokeWidth="1" />
            <line x1="10" y1="100" x2="190" y2="100" stroke="var(--grid)" strokeWidth="1" />

            <g className="dd-radar-sweep">
              <defs>
                <linearGradient id="sweepGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--signal)" stopOpacity="0" />
                  <stop offset="100%" stopColor="var(--signal)" stopOpacity="0.35" />
                </linearGradient>
              </defs>
              <path d="M100,100 L100,10 A90,90 0 0,1 190,100 Z" fill="url(#sweepGrad)" />
            </g>

            {radarBlips.map((b) => (
              <circle
                key={b.id}
                cx={b.x}
                cy={b.y}
                r="3.2"
                fill={(SEVERITY[b.severity] || SEVERITY.low).color}
                className={b.severity === "critical" ? "dd-blip-pulse" : ""}
              />
            ))}

            <circle cx="100" cy="100" r="2.5" fill="var(--text)" />
          </svg>
        </div>

        <div className="dd-header-text">
          <div className="dd-eyebrow">
            <RadarIcon size={13} strokeWidth={2} />
            SIGNAL LOCK · {activeCount} ACTIVE
          </div>
          <h1 className="dd-title">Target Acquisition</h1>
          <p className="dd-subtitle">
            Data Detective is tracking every anomaly from first detection to root cause.
          </p>
        </div>
      </div>

      {loading && (
        <div className="dd-state-row dd-mono">
          <Loader2 size={14} strokeWidth={2} className="dd-spin" />
          Loading KPIs…
        </div>
      )}

      {!loading && error && (
        <div className="dd-state-row dd-mono" data-error="true">
          <AlertCircle size={14} strokeWidth={2} />
          {error}
        </div>
      )}

      {!loading && !error && kpis && kpis.length > 0 && (
        <div className="dd-kpi-grid">
          {kpis.map((kpi) => (
            <KPIStat key={kpi.name} kpi={kpi} />
          ))}
        </div>
      )}

      <div className="dd-section-label">
        <Activity size={13} strokeWidth={2} />
        Detected signals
      </div>

      {insightsLoading && (
        <div className="dd-state-row dd-mono">
          <Loader2 size={14} strokeWidth={2} className="dd-spin" />
          Running anomaly detection…
        </div>
      )}

      {!insightsLoading && insightsError && (
        <div className="dd-state-row dd-mono" data-error="true">
          <AlertCircle size={14} strokeWidth={2} />
          {insightsError}
        </div>
      )}

      {!insightsLoading && !insightsError && insights && insights.length === 0 && (
        <div className="dd-state-row dd-mono">
          No anomalies detected — this dataset looks clean.
        </div>
      )}

      {!insightsLoading &&
        !insightsError &&
        insights &&
        insights.map((insight) => (
          <InsightCard
            key={insight.id}
            insight={insight}
            hovered={hovered}
            setHovered={setHovered}
          />
        ))}
    </div>
  );
}
