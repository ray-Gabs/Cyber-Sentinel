/**
 * Continuity Transition
 * Used when: related content updates — tab switching, scan status updating
 * Behavior: cross-fade in place, no positional movement
 * Duration: 200ms  GPU only: opacity
 * Feels like: same context, content evolving
 */
import { motion } from "framer-motion";

export const continuityVariants = {
  initial: {
    opacity: 0,
  },
  enter: {
    opacity: 1,
    transition: {
      duration: 0.2,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.12,
      ease: [0.4, 0, 1, 1] as const,
    },
  },
};

interface ContinuityTransitionProps {
  children: React.ReactNode;
  layoutKey: string;
}

export function ContinuityTransition({ children, layoutKey }: ContinuityTransitionProps) {
  return (
    <motion.div
      key={layoutKey}
      variants={continuityVariants}
      initial="initial"
      animate="enter"
      exit="exit"
      style={{ width: "100%", height: "100%" }}
    >
      {children}
    </motion.div>
  );
}
