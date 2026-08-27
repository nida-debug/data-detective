import { Link, useNavigate } from "react-router-dom";
import { LogOut, FolderSearch, Terminal } from "lucide-react";
import { auth } from "../lib/api";

export default function Layout({ children }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    auth.clearToken();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex bg-ink-950">
      <aside className="w-56 shrink-0 border-r border-ink-700 flex flex-col justify-between py-6 px-4">
        <div>
          <Link to="/" className="flex items-center gap-2 px-2 mb-10">
            <Terminal size={18} className="text-signal-400" />
            <span className="font-display font-semibold text-inktext-100 tracking-tight">
              Data Detective
            </span>
          </Link>
          <nav className="flex flex-col gap-1">
            <Link
              to="/"
              className="px-3 py-2 rounded-md text-sm text-inktext-100 bg-ink-800 border border-ink-700 flex items-center gap-2"
            >
              <FolderSearch size={16} />
              Cases
            </Link>
          </nav>
        </div>
        <button
          onClick={handleLogout}
          className="px-3 py-2 rounded-md text-sm text-inktext-400 hover:text-inktext-100 hover:bg-ink-800 border border-transparent hover:border-ink-700 flex items-center gap-2 transition-colors"
        >
          <LogOut size={16} />
          Log out
        </button>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
