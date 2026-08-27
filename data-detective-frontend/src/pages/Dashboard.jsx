import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Loader2, FileSpreadsheet, ChevronRight } from "lucide-react";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import DataDetectiveRadarOverview from '../components/DataDetectiveRadarOverview';

const STATUS_STYLES = {
  uploaded: "text-inktext-400 border-ink-600",
  profiling: "text-amber-400 border-amber-400/40",
  cleaned: "text-signal-400 border-signal-400/40",
  analyzed: "text-signal-400 border-signal-400/40",
  failed: "text-danger-400 border-danger-400/40",
};

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.uploaded;
  return (
    <span
      className={`text-[11px] font-mono uppercase tracking-wide border rounded px-1.5 py-0.5 ${style}`}
    >
      {status}
    </span>
  );
}

export default function Dashboard() {
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const loadDatasets = async () => {
    setLoading(true);
    try {
      const res = await api.listDatasets();
      setDatasets(res.data);
    } catch (err) {
      setError("Could not load datasets.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDatasets();
  }, []);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      await api.uploadDataset(file);
      await loadDatasets();
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-8 py-10">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="font-display text-2xl font-medium text-inktext-100">
              Cases
            
            </h1>
            <p className="text-sm text-inktext-400 mt-1">
              Every dataset you upload becomes a case file — profiled,
              cleaned, and analyzed.
            </p>
          </div>
          
         <DataDetectiveRadarOverview datasetId={datasets[0]?.id} />

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 bg-signal-400 text-ink-950 font-medium text-sm rounded-md px-4 py-2.5 hover:bg-signal-500 transition-colors disabled:opacity-60 shrink-0"
          >
            {uploading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Upload size={16} />
            )}
            {uploading ? "Uploading..." : "New case"}
          </button>
        </div>

        {error && (
          <p className="text-sm text-danger-400 bg-danger-400/10 border border-danger-400/30 rounded-md px-3 py-2 mb-6">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-inktext-400 text-sm">
            <Loader2 size={16} className="animate-spin" />
            Loading cases...
          </div>
        ) : datasets.length === 0 ? (
          <div className="border border-dashed border-ink-700 rounded-xl py-16 text-center">
            <FileSpreadsheet size={28} className="mx-auto text-inktext-600 mb-3" />
            <p className="text-inktext-400 text-sm">
              No cases yet. Upload a CSV or Excel file to open your first one.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {datasets.map((d) => (
              <button
                key={d.id}
                onClick={() => navigate(`/datasets/${d.id}`)}
                className="text-left bg-ink-800 border border-ink-700 rounded-xl p-4 hover:border-signal-400/50 transition-colors group"
              >
                <div className="flex items-start justify-between mb-3">
                  <FileSpreadsheet size={18} className="text-inktext-400" />
                  <StatusBadge status={d.status} />
                </div>
                <p className="font-medium text-sm text-inktext-100 truncate mb-1">
                  {d.filename}
                </p>
                <p className="text-xs text-inktext-600 font-mono mb-3">
                  {d.rows ?? "?"} rows &middot; {d.columns ?? "?"} cols
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-inktext-400">
                    Quality:{" "}
                    <span className="text-inktext-100 font-mono">
                      {d.data_quality_score != null
                        ? `${d.data_quality_score.toFixed(0)}/100`
                        : "—"}
                    </span>
                  </span>
                  <ChevronRight
                    size={16}
                    className="text-inktext-600 group-hover:text-signal-400 transition-colors"
                  />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
