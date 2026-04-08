/**
 * TransitionProvider — wires page transitions to React Router.
 *
 * Route → Transition type logic:
 *   Different root section (/scans → /alerts)   → Context
 *   Going deeper (/scans → /scans/123)           → Drill (forward)
 *   Going back (/scans/123 → /scans)             → Drill (back)
 *   Same section, same depth (/scans → /scans)   → Continuity
 *
 * Usage: replace the AnimatePresence block in AppLayout with this.
 */
import { useRef } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { ContextTransition } from "./ContextTransition";
import { DrillTransition, type DrillDirection } from "./DrillTransition";
import { ContinuityTransition } from "./ContinuityTransition";

type TransitionType = "context" | "drill-forward" | "drill-back" | "continuity";

function getPathDepth(path: string): number {
  return path.split("/").filter(Boolean).length;
}

function getRootSection(path: string): string {
  return path.split("/").filter(Boolean)[0] ?? "";
}

function resolveTransition(prev: string, next: string): TransitionType {
  if (prev === next) return "continuity";

  const prevRoot = getRootSection(prev);
  const nextRoot = getRootSection(next);

  // Different top-level section → full context swap
  if (prevRoot !== nextRoot) return "context";

  const prevDepth = getPathDepth(prev);
  const nextDepth = getPathDepth(next);

  // Going deeper within the same section
  if (nextDepth > prevDepth) return "drill-forward";

  // Coming back up
  if (nextDepth < prevDepth) return "drill-back";

  // Same depth, same section (sibling route)
  return "continuity";
}

interface TransitionProviderProps {
  children: React.ReactNode;
}

export function TransitionProvider({ children }: TransitionProviderProps) {
  const location = useLocation();

  // Track previous path using a ref — updates synchronously during render
  // so we capture each navigation before state batching flushes
  const prevPathRef   = useRef(location.pathname);
  const transitionRef = useRef<TransitionType>("context");

  // Compute and persist transition type for each navigation
  if (prevPathRef.current !== location.pathname) {
    transitionRef.current = resolveTransition(prevPathRef.current, location.pathname);
    prevPathRef.current   = location.pathname;
  }

  const transition = transitionRef.current;
  const key        = location.pathname;

  const drillDirection: DrillDirection =
    transition === "drill-back" ? "back" : "forward";

  return (
    <AnimatePresence mode="wait">
      {(transition === "drill-forward" || transition === "drill-back") ? (
        <DrillTransition key={key} layoutKey={key} direction={drillDirection}>
          {children}
        </DrillTransition>
      ) : transition === "continuity" ? (
        <ContinuityTransition key={key} layoutKey={key}>
          {children}
        </ContinuityTransition>
      ) : (
        <ContextTransition key={key} layoutKey={key}>
          {children}
        </ContextTransition>
      )}
    </AnimatePresence>
  );
}
