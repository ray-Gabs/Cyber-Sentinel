/**
 * GlitchText — cyberpunk terminal glitch effect triggered on hover.
 * Characters scramble then resolve back to the original text.
 * Used for the Cyber Sentinel wordmark and section headings.
 */
import { useState, useCallback } from "react";

const GLITCH_CHARS = "!<>-_\\/[]{}—=+*^?#01";

interface GlitchTextProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  tag?: "h1" | "h2" | "h3" | "span" | "p";
  speed?: number; // ms per iteration tick (default 28)
}

export function GlitchText({
  text,
  className,
  style,
  tag: Tag = "span",
  speed = 28,
}: GlitchTextProps) {
  const [displayed, setDisplayed] = useState(text);
  const [glitching, setGlitching] = useState(false);

  const trigger = useCallback(() => {
    if (glitching) return;
    setGlitching(true);
    let step = 0;
    const total = text.length;
    const id = setInterval(() => {
      setDisplayed(
        text
          .split("")
          .map((char, idx) => {
            if (char === " ") return " ";
            if (idx < step) return text[idx];
            return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
          })
          .join(""),
      );
      step += 1 / 2.5;
      if (step >= total) {
        clearInterval(id);
        setDisplayed(text);
        setGlitching(false);
      }
    }, speed);
  }, [text, glitching, speed]);

  return (
    <Tag
      className={className}
      style={{ cursor: "default", ...style }}
      onMouseEnter={trigger}
    >
      {displayed}
    </Tag>
  );
}
