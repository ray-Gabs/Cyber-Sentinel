import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Scan, AlertTriangle, X, Loader2 } from "lucide-react";
import { globalSearch, SearchResults } from "@/services/searchService";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function levelColor(level: number): string {
  if (level >= 12) return "var(--red)";
  if (level >= 7) return "var(--yellow)";
  return "var(--text-muted)";
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const debouncedQuery = useDebounce(query, 280);

  // Keyboard shortcut to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults(null);
      setCursor(0);
    }
  }, [open]);

  // Fetch results
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    globalSearch(debouncedQuery)
      .then((r) => { if (!cancelled) setResults(r); })
      .catch(() => { if (!cancelled) setResults({ scans: [], alerts: [] }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  const allItems = [
    ...(results?.scans ?? []).map((s) => ({
      type: "scan" as const,
      id: s.id,
      label: s.target,
      sub: s.status,
      href: `/scans/${s.id}`,
    })),
    ...(results?.alerts ?? []).map((a) => ({
      type: "alert" as const,
      id: a.id,
      label: a.rule_description,
      sub: a.agent_name,
      level: a.rule_level,
      href: `/alerts/${a.id}`,
    })),
  ];

  const navigate_to = useCallback(
    (href: string) => {
      setOpen(false);
      navigate(href);
    },
    [navigate]
  );

  // Keyboard navigation inside palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, allItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && allItems[cursor]) {
      navigate_to(allItems[cursor].href);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <Search size={16} style={{ color: "var(--text-muted)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search scans, alerts…"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: "var(--text-base)" }}
          />
          {loading && <Loader2 size={14} className="animate-spin" style={{ color: "var(--text-muted)" }} />}
          <button onClick={() => setOpen(false)} style={{ color: "var(--text-muted)" }}>
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-1">
          {!query.trim() && (
            <p className="px-4 py-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
              Type to search scans and alerts
            </p>
          )}

          {results && allItems.length === 0 && (
            <p className="px-4 py-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
              No results for &quot;{query}&quot;
            </p>
          )}

          {results && results.scans.length > 0 && (
            <>
              <p className="px-4 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Scans
              </p>
              {results.scans.map((s, i) => {
                const idx = i;
                return (
                  <button
                    key={s.id}
                    className="w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors"
                    style={{
                      backgroundColor: cursor === idx ? "var(--bg-elevated)" : "transparent",
                      color: "var(--text-base)",
                    }}
                    onMouseEnter={() => setCursor(idx)}
                    onClick={() => navigate_to(`/scans/${s.id}`)}
                  >
                    <Scan size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
                    <span className="flex-1 truncate">{s.target}</span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>{s.status}</span>
                  </button>
                );
              })}
            </>
          )}

          {results && results.alerts.length > 0 && (
            <>
              <p className="px-4 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Alerts
              </p>
              {results.alerts.map((a, i) => {
                const idx = (results?.scans.length ?? 0) + i;
                return (
                  <button
                    key={a.id}
                    className="w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors"
                    style={{
                      backgroundColor: cursor === idx ? "var(--bg-elevated)" : "transparent",
                      color: "var(--text-base)",
                    }}
                    onMouseEnter={() => setCursor(idx)}
                    onClick={() => navigate_to(`/alerts/${a.id}`)}
                  >
                    <AlertTriangle size={14} style={{ color: levelColor(a.rule_level), flexShrink: 0 }} />
                    <span className="flex-1 truncate">{a.rule_description}</span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>{a.agent_name}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* Footer hint */}
        <div
          className="flex items-center gap-4 px-4 py-2 text-xs"
          style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)" }}
        >
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> open</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
