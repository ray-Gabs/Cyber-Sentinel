/**
 * GlowStepper — glowing border step progress indicator for scan pipelines.
 * Custom build inspired by React Bits / reactbits.dev/components/glowing-border
 * Steps: completed (green) → active (blue pulse) → pending (dim) → failed (red)
 */
import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepStatus = "completed" | "active" | "pending" | "failed";

export interface GlowStep {
  id: string;
  label: string;
  icon?: React.ElementType;
  status: StepStatus;
}

interface GlowStepperProps {
  steps: GlowStep[];
  className?: string;
}

const STATUS_STYLES: Record<StepStatus, { ring: string; bg: string; text: string; glow: string }> = {
  completed: {
    ring: "var(--stepper-complete)",
    bg:   "rgba(34,197,94,0.15)",
    text: "var(--sev-low-text)",
    glow: "0 0 10px rgba(34,197,94,0.5)",
  },
  active: {
    ring: "var(--stepper-active)",
    bg:   "rgba(59,130,246,0.15)",
    text: "var(--sev-info-text)",
    glow: "0 0 14px rgba(59,130,246,0.6)",
  },
  pending: {
    ring: "var(--stepper-track)",
    bg:   "var(--bg-muted)",
    text: "var(--text-subtle)",
    glow: "none",
  },
  failed: {
    ring: "var(--stepper-failed)",
    bg:   "rgba(239,68,68,0.12)",
    text: "var(--sev-critical-text)",
    glow: "0 0 10px rgba(239,68,68,0.4)",
  },
};

export function GlowStepper({ steps, className }: GlowStepperProps) {
  return (
    <div className={cn("flex items-center gap-0", className)}>
      {steps.map((step, i) => {
        const style = STATUS_STYLES[step.status];
        const Icon  = step.icon;
        const isLast = i === steps.length - 1;

        return (
          <div key={step.id} className="flex items-center" style={{ flex: isLast ? "0 0 auto" : 1 }}>
            {/* Step circle */}
            <div className="flex flex-col items-center gap-1 shrink-0">
              <motion.div
                className="relative flex items-center justify-center rounded-full"
                style={{
                  width:        28,
                  height:       28,
                  border:       `1.5px solid ${style.ring}`,
                  background:   style.bg,
                  boxShadow:    style.glow,
                }}
                animate={step.status === "active" ? { boxShadow: [
                  "0 0 8px rgba(59,130,246,0.4)",
                  "0 0 18px rgba(59,130,246,0.7)",
                  "0 0 8px rgba(59,130,246,0.4)",
                ]} : {}}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              >
                {step.status === "completed" && (
                  <Check size={12} style={{ color: "var(--sev-low-text)" }} strokeWidth={2.5} />
                )}
                {step.status === "failed" && (
                  <X size={12} style={{ color: "var(--sev-critical-text)" }} strokeWidth={2.5} />
                )}
                {(step.status === "active" || step.status === "pending") && Icon && (
                  <Icon size={11} style={{ color: style.text }} />
                )}
                {(step.status === "active" || step.status === "pending") && !Icon && (
                  <span className="text-[9px] font-bold tabular-nums" style={{ color: style.text }}>
                    {i + 1}
                  </span>
                )}

                {/* Active pulse ring */}
                {step.status === "active" && (
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{ border: "1.5px solid var(--accent)" }}
                    animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                  />
                )}
              </motion.div>

              <span
                className="text-[9px] font-medium text-center whitespace-nowrap"
                style={{ color: style.text, maxWidth: 52 }}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line (not after last step) */}
            {!isLast && (
              <div
                className="h-px flex-1 mx-1 mb-4"
                style={{ backgroundColor: "var(--stepper-track)", minWidth: 8 }}
              >
                {(step.status === "completed") && (
                  <motion.div
                    className="h-full"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    style={{ backgroundColor: "var(--stepper-complete)", transformOrigin: "left" }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Utility: map scan stage → step index ───────────────────────────────── */

const RECON_TOOLS = new Set([
  "fingerprint", "subdomain_enum", "crawler", "dir_brute", "whatweb",
]);
const SCAN_TOOLS = new Set([
  "nmap", "nuclei", "sslyze", "zap",
]);

export function getScanStepIndex(
  status: string,
  currentStage: string | null | undefined,
): number {
  if (status === "pending")   return 0;
  if (status === "completed" || status === "failed" || status === "cancelled") return 3;
  if (!currentStage)          return 0;
  if (currentStage === "ai_analysis") return 2;
  if (RECON_TOOLS.has(currentStage))  return 0;
  if (SCAN_TOOLS.has(currentStage))   return 1;
  return 2; // everything else = test/exploit phase
}
