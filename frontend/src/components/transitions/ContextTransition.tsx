/**
 * Context Transition
 * Used when: navigating between unrelated sections (Dashboard → Settings)
 * Behavior: fade out + scale down (0.98→0), fade in + scale up (0.98→1)
 * Duration: 300ms  Easing: spring (0.16, 1, 0.3, 1)
 * GPU only: transform + opacity — no layout properties
 */
import { motion } from "framer-motion";

export const contextVariants = {
  initial: {
    opacity: 0,
    scale: 0.98,
  },
  enter: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.3,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: {
      duration: 0,
    },
  },
};

interface ContextTransitionProps {
  children: React.ReactNode;
  layoutKey: string;
}

export function ContextTransition({ children, layoutKey }: ContextTransitionProps) {
  return (
    <motion.div
      key={layoutKey}
      variants={contextVariants}
      initial="initial"
      animate="enter"
      exit="exit"
      style={{ width: "100%", height: "100%" }}
    >
      {children}
    </motion.div>
  );
}
