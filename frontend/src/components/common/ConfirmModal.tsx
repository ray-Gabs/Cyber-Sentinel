/**
 * ConfirmModal — animated overlay confirmation dialog.
 * Replaces browser confirm() with a system-styled modal.
 */
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Trash2, X } from "lucide-react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  /** Highlighted detail text — e.g. the target URL being deleted */
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" = red confirm button, "warning" = yellow */
  variant?: "danger" | "warning";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  detail,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const isDanger = variant === "danger";
  const accentColor = isDanger ? "var(--sev-critical)" : "#eab308";
  const accentBg    = isDanger ? "rgba(239,68,68,0.12)" : "rgba(234,179,8,0.12)";
  const accentBorder = isDanger ? "rgba(239,68,68,0.25)" : "rgba(234,179,8,0.25)";
  const btnHoverBg   = isDanger ? "rgba(239,68,68,0.85)" : "rgba(234,179,8,0.85)";

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onCancel}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              backgroundColor: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(4px)",
            }}
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 51,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                pointerEvents: "all",
                width: "100%",
                maxWidth: "420px",
                margin: "0 1rem",
                backgroundColor: "var(--bg-card)",
                border: `1px solid ${accentBorder}`,
                borderRadius: "16px",
                boxShadow: `0 0 0 1px ${accentBorder}, 0 20px 60px rgba(0,0,0,0.5), 0 0 40px ${accentBg}`,
                overflow: "hidden",
              }}
            >
              {/* Top accent bar */}
              <div style={{ height: "3px", background: `linear-gradient(90deg, ${accentColor}, transparent)` }} />

              <div style={{ padding: "1.5rem" }}>
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "10px",
                        backgroundColor: accentBg,
                        border: `1px solid ${accentBorder}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {isDanger
                        ? <Trash2 size={18} style={{ color: accentColor }} />
                        : <AlertTriangle size={18} style={{ color: accentColor }} />
                      }
                    </div>
                    <div>
                      <h3
                        style={{
                          fontFamily: "Syne, sans-serif",
                          fontSize: "1rem",
                          fontWeight: 700,
                          color: "var(--text-base)",
                          lineHeight: 1.2,
                        }}
                      >
                        {title}
                      </h3>
                    </div>
                  </div>

                  <button
                    onClick={onCancel}
                    style={{
                      padding: "4px",
                      borderRadius: "6px",
                      color: "var(--text-subtle)",
                      transition: "color 0.15s, background 0.15s",
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.color = "var(--text-base)";
                      (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-muted)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.color = "var(--text-subtle)";
                      (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Message */}
                <p
                  style={{
                    marginTop: "1rem",
                    fontSize: "0.875rem",
                    color: "var(--text-muted)",
                    lineHeight: 1.6,
                  }}
                >
                  {message}
                </p>

                {/* Detail pill — shows what's being deleted */}
                {detail && (
                  <div
                    style={{
                      marginTop: "0.75rem",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "8px",
                      backgroundColor: "var(--bg-muted)",
                      border: "1px solid var(--border)",
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: "0.75rem",
                      color: "var(--text-base)",
                      wordBreak: "break-all",
                    }}
                  >
                    {detail}
                  </div>
                )}

                {/* Warning note */}
                <div
                  style={{
                    marginTop: "0.875rem",
                    padding: "0.625rem 0.75rem",
                    borderRadius: "8px",
                    backgroundColor: accentBg,
                    border: `1px solid ${accentBorder}`,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontSize: "0.75rem",
                    color: accentColor,
                  }}
                >
                  <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                  This action cannot be undone.
                </div>

                {/* Buttons */}
                <div
                  style={{
                    marginTop: "1.25rem",
                    display: "flex",
                    gap: "0.625rem",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    onClick={onCancel}
                    disabled={loading}
                    style={{
                      padding: "0.5rem 1rem",
                      borderRadius: "8px",
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      color: "var(--text-muted)",
                      backgroundColor: "var(--bg-muted)",
                      border: "1px solid var(--border)",
                      cursor: "pointer",
                      transition: "color 0.15s, border-color 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.color = "var(--text-base)";
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--border-muted)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                    }}
                  >
                    {cancelLabel}
                  </button>

                  <button
                    onClick={onConfirm}
                    disabled={loading}
                    style={{
                      padding: "0.5rem 1.125rem",
                      borderRadius: "8px",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      color: "#fff",
                      backgroundColor: accentColor,
                      border: `1px solid ${accentColor}`,
                      cursor: loading ? "not-allowed" : "pointer",
                      opacity: loading ? 0.6 : 1,
                      transition: "background 0.15s, opacity 0.15s",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.375rem",
                    }}
                    onMouseEnter={(e) => {
                      if (!loading) (e.currentTarget as HTMLElement).style.backgroundColor = btnHoverBg;
                    }}
                    onMouseLeave={(e) => {
                      if (!loading) (e.currentTarget as HTMLElement).style.backgroundColor = accentColor;
                    }}
                  >
                    {loading ? (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 0.7s linear infinite" }}>
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        Deleting…
                      </>
                    ) : (
                      confirmLabel
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
