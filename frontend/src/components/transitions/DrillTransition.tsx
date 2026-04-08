/**
 * Drill Transition
 * Used when: going deeper into a topic (Scans list → Scan detail)
 * Behavior: current page slides left + fades out, new slides in from right
 * Back navigation: reverses direction automatically
 * Duration: 250ms  GPU only: transform + opacity
 */
import { motion } from "framer-motion";

export type DrillDirection = "forward" | "back";

const SLIDE_DISTANCE = "24px";
const DURATION_ENTER = 0.25;
const DURATION_EXIT = 0.18;
const EASE_ENTER = [0.16, 1, 0.3, 1] as const;
const EASE_EXIT  = [0.4, 0, 1, 1] as const;

export function getDrillVariants(direction: DrillDirection) {
  const enterFrom = direction === "forward"  ? SLIDE_DISTANCE : `-${SLIDE_DISTANCE}`;
  const exitTo    = direction === "forward"  ? `-${SLIDE_DISTANCE}` : SLIDE_DISTANCE;

  return {
    initial: {
      opacity: 0,
      x: enterFrom,
    },
    enter: {
      opacity: 1,
      x: 0,
      transition: {
        duration: DURATION_ENTER,
        ease: EASE_ENTER,
      },
    },
    exit: {
      opacity: 0,
      x: exitTo,
      transition: {
        duration: DURATION_EXIT,
        ease: EASE_EXIT,
      },
    },
  };
}

interface DrillTransitionProps {
  children: React.ReactNode;
  layoutKey: string;
  direction: DrillDirection;
}

export function DrillTransition({ children, layoutKey, direction }: DrillTransitionProps) {
  const variants = getDrillVariants(direction);

  return (
    <motion.div
      key={layoutKey}
      variants={variants}
      initial="initial"
      animate="enter"
      exit="exit"
      style={{ width: "100%", height: "100%" }}
    >
      {children}
    </motion.div>
  );
}
