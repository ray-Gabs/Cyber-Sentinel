/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        sentinel: {
          50:  "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
          950: "#172554",
        },
        severity: {
          critical: "#ef4444",
          high:     "#f97316",
          medium:   "#eab308",
          low:      "#3b82f6",
          info:     "#6b7280",
        },
      },
      fontFamily: {
        display: ["Syne", "system-ui", "sans-serif"],
        sans:    ["IBM Plex Sans", "system-ui", "sans-serif"],
        mono:    ["JetBrains Mono", "Fira Code", "monospace"],
      },
      keyframes: {
        "fade-in-up": {
          "0%":   { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 4px 0 rgba(59,130,246,0.3)" },
          "50%":      { boxShadow: "0 0 20px 4px rgba(59,130,246,0.55)" },
        },
        "slide-in-left": {
          "0%":   { opacity: "0", transform: "translateX(-16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "count-up": {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "alert-in": {
          "0%":   { opacity: "0", transform: "translateX(-8px)", backgroundColor: "rgba(59,130,246,0.12)" },
          "60%":  { backgroundColor: "rgba(59,130,246,0.06)" },
          "100%": { opacity: "1", transform: "translateX(0)", backgroundColor: "transparent" },
        },
      },
      animation: {
        "fade-in-up":    "fade-in-up 0.35s ease-out forwards",
        "fade-in":       "fade-in 0.25s ease-out forwards",
        shimmer:         "shimmer 2s linear infinite",
        "glow-pulse":    "glow-pulse 2.5s ease-in-out infinite",
        "slide-in-left": "slide-in-left 0.3s ease-out forwards",
        "count-up":      "count-up 0.4s ease-out forwards",
        "pulse-slow":    "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "alert-in":      "alert-in 0.6s ease-out forwards",
      },
    },
  },
  plugins: [],
};
