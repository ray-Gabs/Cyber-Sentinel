/**
 * AnimatedList — spring-physics entrance animations for dynamic lists.
 * Inspired by React Bits / reactbits.dev/components/animated-list
 * Uses framer-motion AnimatePresence mode="popLayout".
 * Only animates NEW items (tracks seen IDs). Respects prefers-reduced-motion.
 */
import { useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

interface AnimatedListProps<T> {
  items: T[];
  /** Extract stable unique key from item */
  keyExtractor: (item: T) => string;
  /** Render each item */
  renderItem: (item: T, index: number) => ReactNode;
  /** Max items to show (default: all) */
  maxVisible?: number;
  className?: string;
}

export function AnimatedList<T>({
  items,
  keyExtractor,
  renderItem,
  maxVisible,
  className,
}: AnimatedListProps<T>) {
  const reduced   = useReducedMotion();
  const seenIds   = useRef(new Set<string>());
  const visible   = maxVisible ? items.slice(0, maxVisible) : items;

  // Track which IDs have already been rendered (skip entrance animation for existing items)
  const isNew = (item: T) => {
    const key = keyExtractor(item);
    if (seenIds.current.has(key)) return false;
    seenIds.current.add(key);
    return true;
  };

  if (reduced) {
    return (
      <div className={className}>
        {visible.map((item, i) => (
          <div key={keyExtractor(item)}>{renderItem(item, i)}</div>
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      <AnimatePresence mode="popLayout" initial={false}>
        {visible.map((item, i) => {
          const key     = keyExtractor(item);
          const animate = isNew(item);

          return (
            <motion.div
              key={key}
              layout
              initial={animate ? { opacity: 0, y: -12, scale: 0.97 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{
                type:      "spring",
                stiffness: 320,
                damping:   28,
                mass:      0.8,
              }}
            >
              {renderItem(item, i)}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
