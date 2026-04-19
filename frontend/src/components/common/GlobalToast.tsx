import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, X, Info } from "lucide-react";

interface ToastMessage {
  id: number;
  msg: string;
  type: "error" | "success" | "info" | "warning";
}

const STYLES = {
  error:   { icon: AlertTriangle, color: "var(--red)",    bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.3)" },
  warning: { icon: AlertTriangle, color: "var(--yellow)", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.3)" },
  success: { icon: CheckCircle,   color: "var(--green)",  bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.3)" },
  info:    { icon: Info,          color: "var(--accent)", bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.3)" },
};

let _counter = 0;

export function showToast(msg: string, type: ToastMessage["type"] = "info") {
  window.dispatchEvent(
    new CustomEvent("cs:toast", { detail: { msg, type } })
  );
}

export default function GlobalToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { msg, type } = (e as CustomEvent<{ msg: string; type: ToastMessage["type"] }>).detail;
      const id = ++_counter;
      setToasts((prev) => [...prev, { id, msg, type }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
    };
    window.addEventListener("cs:toast", handler);
    return () => window.removeEventListener("cs:toast", handler);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 md:bottom-6">
      {toasts.map((t) => {
        const s = STYLES[t.type];
        const Icon = s.icon;
        return (
          <div
            key={t.id}
            className="flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg text-sm max-w-sm"
            style={{
              backgroundColor: s.bg,
              border: `1px solid ${s.border}`,
              color: "var(--text-base)",
              backdropFilter: "blur(8px)",
            }}
          >
            <Icon size={15} style={{ color: s.color, flexShrink: 0 }} />
            <span className="flex-1">{t.msg}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              style={{ color: "var(--text-muted)" }}
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
