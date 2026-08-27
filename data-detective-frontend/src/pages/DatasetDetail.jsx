import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  Download,
  AlertTriangle,
  Crosshair,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import Layout from "../components/Layout";
import { api } from "../lib/api";

const TABS = ["Overview", "Clean", "Explore", "Metrics", "Signals", "Root Cause", "Forecast"];

const KPI_FORMATTERS = {
  currency: (v) => `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
  percent: (v) => `${v > 0 ? "+" : ""}${Number(v).toFixed(1)}%`,
  number: (v) => Number(v).toLocaleString(),
};

function fmtKpi(value, format) {
  if (value == null) return "N/A";
  const fn = KPI_FORMATTERS[format] || KPI_FORMATTERS.number;
  return fn(value);
}

// Severity/confidence -> color, using only colors already in this file's
// palette (danger-400, amber-400, signal-400) so nothing new needs adding
// to the Tailwind config.
const SEVERITY_STYLES = {
  critical: { text: "text-danger-400", border: "border-danger-400/30", bg: "bg-danger-400/10" },
  high: { text: "text-danger-400", border: "border-danger-400/20", bg: "bg-danger-400/5" },
  medium: { text: "text-amber-400", border: "border-amber-400/30", bg: "bg-amber-400/10" },
  low: { text: "text-signal-400", border: "border-signal-400/30", bg: "bg-signal-400/10" },
};

const CONFIDENCE_STYLES = {
  high: "text-signal-400",
  medium: "text-amber-400",
  low: "text-inktext-400",
};

function CorrelationHeatmap({ correlation }) {
  if (!correlation) return null;
  const { columns, matrix } = correlation;

  const colorFor = (v) => {
    if (v == null) return "#161C26";
    if (v > 0) {
      const alpha = Math.min(Math.abs(v), 1);
      return `rgba(61, 220, 151, ${0.15 + alpha * 0.55})`;
    }
    const alpha = Math.min(Math.abs(v), 1);
    return `rgba(229, 72, 77, ${0.15 + alpha * 0.55})`;
  };

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-xs font-mono">
        <thead>
          <tr>
            <th className="p-2"></th>
            {columns.map((c) => (
              <th
                key={c}
                className="p-2 text-inktext-400 font-normal whitespace-nowrap"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={columns[i]}>
              <td className="p-2 text-inktext-400 whitespace-nowrap">
                {columns[i]}
              </td>
              {row.map((v, j) => (
                <td
                  key={j}
                  className="p-2 text-center text-inktext-100 border border-ink-700"
                  style={{ backgroundColor: colorFor(v) }}
                >
                  {v != null ? v.toFixed(2) : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Histogram({ column, data }) {
  const chartData = data.bin_edges.slice(0, -1).map((edge, i) => ({
    range: `${edge.toFixed(1)}–${data.bin_edges[i + 1].toFixed(1)}`,
    count: data.counts[i],
  }));
  return (
    <div className="bg-ink-800 border border-ink-700 rounded-xl p-4">
      <p className="text-sm font-medium text-inktext-100 mb-3">{column}</p>
      <div style={{ height: 180, position: "relative" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1F2733" vertical={false} />
            <XAxis
              dataKey="range"
              tick={{ fontSize: 9, fill: "#8B93A1" }}
              interval={1}
            />
            <YAxis tick={{ fontSize: 10, fill: "#8B93A1" }} width={30} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#161C26",
                border: "1px solid #2A3341",
                borderRadius: 6,
                fontSize: 12,
              }}
              labelStyle={{ color: "#E8EAED" }}
            />
            <Bar dataKey="count" fill="#3DDC97" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CategoryChart({ column, data }) {
  const chartData = data.labels.map((label, i) => ({
    label: label.length > 14 ? label.slice(0, 14) + "…" : label,
    count: data.counts[i],
  }));
  return (
    <div className="bg-ink-800 border border-ink-700 rounded-xl p-4">
      <p className="text-sm font-medium text-inktext-100 mb-1">{column}</p>
      {data.truncated && (
        <p className="text-[11px] text-amber-400 mb-2">
          Showing top {data.labels.length} values
        </p>
      )}
      <div style={{ height: 180, position: "relative" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#1F2733" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: "#8B93A1" }} />
            <YAxis
              dataKey="label"
              type="category"
              tick={{ fontSize: 10, fill: "#8B93A1" }}
              width={70}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#161C26",
                border: "1px solid #2A3341",
                borderRadius: 6,
                fontSize: 12,
              }}
              labelStyle={{ color: "#E8EAED" }}
            />
            <Bar dataKey="count" fill="#3DDC97" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AnomalyCard({ anomaly }) {
  const s = SEVERITY_STYLES[anomaly.severity] || SEVERITY_STYLES.low;
  return (
    <div className={`bg-ink-800 border ${s.border} rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs font-mono text-inktext-600">{anomaly.id}</span>
        <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${s.border} ${s.text}`}>
          {anomaly.severity}
        </span>
        {anomaly.column && (
          <span className="text-xs font-mono text-inktext-600 ml-auto">{anomaly.column}</span>
        )}
      </div>
      <p className="text-sm font-medium text-inktext-100 mb-1.5">{anomaly.title}</p>
      <p className="text-xs text-inktext-400 leading-relaxed mb-3">{anomaly.description}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        {(anomaly.tags || []).map((t) => (
          <span
            key={t}
            className="text-[10px] font-mono text-signal-400 bg-signal-400/10 border border-signal-400/25 rounded px-1.5 py-0.5"
          >
            {t}
          </span>
        ))}
      </div>
      {anomaly.confirmed === false && (
        <p className="text-[11px] italic text-inktext-600 mt-2.5">
          correlation, not confirmed causation
        </p>
      )}
    </div>
  );
}

function RootCauseCard({ finding }) {
  const confColor = CONFIDENCE_STYLES[finding.confidence] || CONFIDENCE_STYLES.low;
  return (
    <div className="bg-ink-800 border border-ink-700 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Crosshair size={13} className={confColor} />
        <span className="text-xs font-mono text-inktext-600">{finding.id}</span>
        <span className="text-xs font-mono text-inktext-600">→ {finding.anomaly_id}</span>
        <span className={`text-[10px] font-mono uppercase ml-auto ${confColor}`}>
          {finding.confidence} confidence
        </span>
      </div>
      <p className="text-sm font-medium text-inktext-100 mb-1.5">{finding.title}</p>
      <p className="text-xs text-inktext-400 leading-relaxed mb-3">{finding.explanation}</p>
      {finding.candidate_drivers && finding.candidate_drivers.length > 0 && (
        <div className="flex flex-col gap-1 font-mono text-[11px] border-t border-ink-700 pt-2.5">
          {finding.candidate_drivers.map((d, i) => (
            <div key={i} className="flex justify-between text-inktext-400">
              <span>
                {d.column} = <span className="text-inktext-100">{d.value}</span>
              </span>
              <span>
                {Math.round(d.share_in_flagged * 100)}% vs {Math.round(d.share_overall * 100)}% overall
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ForecastCard({ prediction }) {
  const TrendIcon =
    prediction.trend === "increasing" ? TrendingUp : prediction.trend === "decreasing" ? TrendingDown : Minus;
  const trendColor =
    prediction.trend === "increasing" ? "text-signal-400" : prediction.trend === "decreasing" ? "text-danger-400" : "text-inktext-400";
  const fitPct = Math.round(prediction.fit_strength * 100);

  return (
    <div className="bg-ink-800 border border-ink-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-inktext-400">{prediction.column}</p>
        <TrendIcon size={15} className={trendColor} />
      </div>
      <p className="font-display text-2xl font-medium text-inktext-100 mb-1">
        {Number(prediction.forecast_next_period).toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </p>
      <p className={`text-[11px] font-mono mb-3 ${trendColor}`}>{prediction.trend} trend</p>

      <div className="mb-1 flex justify-between text-[10px] font-mono text-inktext-600">
        <span>fit strength</span>
        <span>{fitPct}%</span>
      </div>
      <div className="w-full h-1.5 bg-ink-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-signal-400 rounded-full"
          style={{ width: `${fitPct}%` }}
        />
      </div>
      <p className="text-[10px] text-inktext-600 mt-2.5 italic">{prediction.method}</p>
    </div>
  );
}

export default function DatasetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState("Overview");
  const [profile, setProfile] = useState(null);
  const [cleaning, setCleaning] = useState(null);
  const [eda, setEda] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [anomalies, setAnomalies] = useState(null);
  const [rootCauses, setRootCauses] = useState(null);
  const [predictions, setPredictions] = useState(null);
  const [loadingTab, setLoadingTab] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const loadProfile = async () => {
    const res = await api.getProfile(id);
    setProfile(res.data);
  };

  useEffect(() => {
    loadProfile();
  }, [id]);

  const runClean = async () => {
    setLoadingTab(true);
    setError("");
    try {
      const res = await api.cleanDataset(id);
      setCleaning(res.data.cleaning_summary);
      await loadProfile();
    } catch (err) {
      setError(err.response?.data?.detail || "Cleaning failed.");
    } finally {
      setLoadingTab(false);
    }
  };

  const runEda = async () => {
    setLoadingTab(true);
    setError("");
    try {
      const res = await api.getEda(id);
      setEda(res.data.result_json);
    } catch (err) {
      setError(err.response?.data?.detail || "EDA failed.");
    } finally {
      setLoadingTab(false);
    }
  };

  const runKpis = async () => {
    setLoadingTab(true);
    setError("");
    try {
      const res = await api.getKpis(id);
      setKpis(res.data.result_json);
    } catch (err) {
      setError(err.response?.data?.detail || "KPI detection failed.");
    } finally {
      setLoadingTab(false);
    }
  };

  const runAnomalies = async () => {
    setLoadingTab(true);
    setError("");
    try {
      const res = await api.getAnomalies(id);
      setAnomalies(res.data.result_json);
    } catch (err) {
      setError(err.response?.data?.detail || "Anomaly detection failed.");
    } finally {
      setLoadingTab(false);
    }
  };

  const runRootCauses = async () => {
    setLoadingTab(true);
    setError("");
    try {
      const res = await api.getRootCauses(id);
      setRootCauses(res.data.result_json);
    } catch (err) {
      setError(err.response?.data?.detail || "Root-cause analysis failed.");
    } finally {
      setLoadingTab(false);
    }
  };

  const runPredictions = async () => {
    setLoadingTab(true);
    setError("");
    try {
      const res = await api.getPredictions(id);
      setPredictions(res.data.result_json);
    } catch (err) {
      setError(err.response?.data?.detail || "Prediction generation failed.");
    } finally {
      setLoadingTab(false);
    }
  };

  const handleDownloadReport = async () => {
    setDownloading(true);
    try {
      await api.downloadReport(id, `${profile?.id || "dataset"}_report.pdf`);
    } catch (err) {
      setError("Report generation failed.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-8 py-10">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-sm text-inktext-400 hover:text-inktext-100 mb-6 transition-colors"
        >
          <ArrowLeft size={15} />
          Back to cases
        </button>

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="font-display text-xl font-medium text-inktext-100">
              Case file
            </h1>
            <p className="text-xs text-inktext-600 font-mono mt-1">{id}</p>
          </div>
          <button
            onClick={handleDownloadReport}
            disabled={downloading}
            className="flex items-center gap-2 bg-ink-800 border border-ink-700 text-inktext-100 text-sm rounded-md px-4 py-2 hover:border-signal-400/50 transition-colors disabled:opacity-60"
          >
            {downloading ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Download size={15} />
            )}
            Export PDF report
          </button>
        </div>

        <div className="flex gap-1 border-b border-ink-700 mb-6 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm border-b-2 whitespace-nowrap transition-colors ${
                tab === t
                  ? "border-signal-400 text-inktext-100"
                  : "border-transparent text-inktext-400 hover:text-inktext-100"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-sm text-danger-400 bg-danger-400/10 border border-danger-400/30 rounded-md px-3 py-2 mb-6">
            {error}
          </p>
        )}

        {tab === "Overview" && profile && (
          <div>
            <div className="reticle bg-ink-800 border border-ink-700 rounded-xl inline-block mb-6">
              <p className="text-xs text-inktext-400 mb-1">
                Data quality score
              </p>
              <p className="font-display text-4xl font-semibold text-signal-400">
                {profile.data_quality_score != null
                  ? profile.data_quality_score.toFixed(0)
                  : "—"}
                <span className="text-lg text-inktext-600">/100</span>
              </p>
            </div>

            {profile.profile_summary && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-ink-800 border border-ink-700 rounded-xl p-4">
                  <p className="text-sm font-medium text-inktext-100 mb-3">
                    Missing values by column
                  </p>
                  <div className="flex flex-col gap-1.5 font-mono text-xs">
                    {Object.entries(
                      profile.profile_summary.missing_by_column || {}
                    ).map(([col, count]) => (
                      <div key={col} className="flex justify-between">
                        <span className="text-inktext-400">{col}</span>
                        <span
                          className={
                            count > 0 ? "text-amber-400" : "text-inktext-600"
                          }
                        >
                          {count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-ink-800 border border-ink-700 rounded-xl p-4">
                  <p className="text-sm font-medium text-inktext-100 mb-3">
                    Column types
                  </p>
                  <div className="flex flex-col gap-1.5 font-mono text-xs">
                    {Object.entries(profile.profile_summary.dtypes || {}).map(
                      ([col, dtype]) => (
                        <div key={col} className="flex justify-between">
                          <span className="text-inktext-400">{col}</span>
                          <span className="text-inktext-100">{dtype}</span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "Clean" && (
          <div>
            {!cleaning ? (
              <button
                onClick={runClean}
                disabled={loadingTab}
                className="flex items-center gap-2 bg-signal-400 text-ink-950 font-medium text-sm rounded-md px-4 py-2.5 hover:bg-signal-500 transition-colors disabled:opacity-60"
              >
                {loadingTab ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                Run cleaning
              </button>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-ink-800 border border-ink-700 rounded-xl p-4">
                  <p className="text-sm font-medium text-inktext-100 mb-3">
                    Summary
                  </p>
                  <div className="flex flex-col gap-2 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-inktext-400">Rows before</span>
                      <span className="text-inktext-100">
                        {cleaning.rows_before}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-inktext-400">Rows after</span>
                      <span className="text-inktext-100">
                        {cleaning.rows_after}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-inktext-400">
                        Duplicates removed
                      </span>
                      <span className="text-signal-400">
                        {cleaning.duplicates_removed}
                      </span>
                    </div>
                  </div>
                </div>

                {Object.keys(cleaning.outliers_detected || {}).length > 0 && (
                  <div className="bg-ink-800 border border-amber-400/30 rounded-xl p-4">
                    <p className="text-sm font-medium text-inktext-100 mb-3 flex items-center gap-1.5">
                      <AlertTriangle size={14} className="text-amber-400" />
                      Outliers flagged (not removed)
                    </p>
                    <div className="flex flex-col gap-1.5 text-xs font-mono">
                      {Object.entries(cleaning.outliers_detected).map(
                        ([col, info]) => (
                          <div key={col} className="text-inktext-400">
                            <span className="text-inktext-100">{col}</span>:{" "}
                            {info.count} value(s) outside{" "}
                            {info.lower_bound.toFixed(1)}–
                            {info.upper_bound.toFixed(1)}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "Explore" && (
          <div>
            {!eda ? (
              <button
                onClick={runEda}
                disabled={loadingTab}
                className="flex items-center gap-2 bg-signal-400 text-ink-950 font-medium text-sm rounded-md px-4 py-2.5 hover:bg-signal-500 transition-colors disabled:opacity-60"
              >
                {loadingTab ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                Run exploration
              </button>
            ) : (
              <div className="flex flex-col gap-8">
                {Object.keys(eda.histograms || {}).length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-inktext-100 mb-3">
                      Distributions
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(eda.histograms).map(([col, data]) => (
                        <Histogram key={col} column={col} data={data} />
                      ))}
                    </div>
                  </div>
                )}

                {eda.correlation_matrix && (
                  <div>
                    <p className="text-sm font-medium text-inktext-100 mb-3">
                      Correlation matrix
                    </p>
                    <div className="bg-ink-800 border border-ink-700 rounded-xl p-4">
                      <CorrelationHeatmap correlation={eda.correlation_matrix} />
                    </div>
                  </div>
                )}

                {Object.keys(eda.category_distributions || {}).length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-inktext-100 mb-3">
                      Category breakdowns
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(eda.category_distributions).map(
                        ([col, data]) => (
                          <CategoryChart key={col} column={col} data={data} />
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "Metrics" && (
          <div>
            {!kpis ? (
              <button
                onClick={runKpis}
                disabled={loadingTab}
                className="flex items-center gap-2 bg-signal-400 text-ink-950 font-medium text-sm rounded-md px-4 py-2.5 hover:bg-signal-500 transition-colors disabled:opacity-60"
              >
                {loadingTab ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                Detect KPIs
              </button>
            ) : kpis.kpis.length === 0 ? (
              <p className="text-sm text-inktext-400">
                No standard business metric columns (revenue, quantity,
                customer ID, etc.) were detected by name in this dataset.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {kpis.kpis.map((kpi) => (
                  <div
                    key={kpi.name}
                    className="bg-ink-800 border border-ink-700 rounded-xl p-4"
                  >
                    <p className="text-xs text-inktext-400 mb-1">
                      {kpi.name}
                    </p>
                    <p className="font-display text-2xl font-medium text-inktext-100">
                      {fmtKpi(kpi.value, kpi.format)}
                    </p>
                    <p className="text-[11px] text-inktext-600 font-mono mt-1">
                      {kpi.source_column}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "Signals" && (
          <div>
            {!anomalies ? (
              <button
                onClick={runAnomalies}
                disabled={loadingTab}
                className="flex items-center gap-2 bg-signal-400 text-ink-950 font-medium text-sm rounded-md px-4 py-2.5 hover:bg-signal-500 transition-colors disabled:opacity-60"
              >
                {loadingTab ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                Run anomaly detection
              </button>
            ) : anomalies.anomaly_count === 0 ? (
              <p className="text-sm text-inktext-400">
                No anomalies detected — this dataset looks clean.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {anomalies.anomalies.map((a) => (
                  <AnomalyCard key={a.id} anomaly={a} />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "Root Cause" && (
          <div>
            {!rootCauses ? (
              <button
                onClick={runRootCauses}
                disabled={loadingTab}
                className="flex items-center gap-2 bg-signal-400 text-ink-950 font-medium text-sm rounded-md px-4 py-2.5 hover:bg-signal-500 transition-colors disabled:opacity-60"
              >
                {loadingTab ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                Run root-cause analysis
              </button>
            ) : rootCauses.root_cause_count === 0 ? (
              <p className="text-sm text-inktext-400">
                No anomalies to investigate — nothing to trace back to a cause.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {rootCauses.root_causes.map((f) => (
                  <RootCauseCard key={f.id} finding={f} />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "Forecast" && (
          <div>
            {!predictions ? (
              <button
                onClick={runPredictions}
                disabled={loadingTab}
                className="flex items-center gap-2 bg-signal-400 text-ink-950 font-medium text-sm rounded-md px-4 py-2.5 hover:bg-signal-500 transition-colors disabled:opacity-60"
              >
                {loadingTab ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                Run forecast
              </button>
            ) : predictions.predictions.length === 0 ? (
              <p className="text-sm text-inktext-400">
                {predictions.note || "Not enough data to forecast a trend."}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {predictions.predictions.map((p) => (
                  <ForecastCard key={p.column} prediction={p} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
