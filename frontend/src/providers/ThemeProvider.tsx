/**
 * ThemeProvider — dark/light mode + palette switching.
 *
 * Applies to <html>:
 *   class="dark"  or  class="light"
 *   data-palette="A" | "B" | "C"
 *
 * Palette A — Monochromatic Electric Blue (default)
 * Palette B — Complementary: Blue + Amber
 * Palette C — Analogous: Blue + Cyan + Purple
 *
 * Persists both to localStorage.
 * Drop-in replacement for the existing ThemeContext.tsx — exports
 * the same ThemeProvider and useTheme hook, plus palette controls.
 */
import { createContext, useContext, useEffect, useState } from "react";

export type Theme   = "dark" | "light";
export type Palette = "A" | "B" | "C";

interface ThemeContextValue {
  theme:         Theme;
  palette:       Palette;
  isDark:        boolean;
  toggleTheme:   () => void;
  setPalette:    (palette: Palette) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme:       "dark",
  palette:     "A",
  isDark:      true,
  toggleTheme: () => {},
  setPalette:  () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem("cs-theme") as Theme) || "light";
    } catch {
      return "dark";
    }
  });

  const [palette, setPaletteState] = useState<Palette>(() => {
    try {
      return (localStorage.getItem("cs-palette") as Palette) || "A";
    } catch {
      return "A";
    }
  });

  // Apply theme class + palette attribute to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(theme);
    try {
      localStorage.setItem("cs-theme", theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    // Palette A is the default — omit the attribute for A to keep CSS clean
    if (palette === "A") {
      root.removeAttribute("data-palette");
    } else {
      root.setAttribute("data-palette", palette);
    }
    try {
      localStorage.setItem("cs-palette", palette);
    } catch {
      // ignore
    }
  }, [palette]);

  const toggleTheme = () =>
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  const setPalette = (p: Palette) => setPaletteState(p);

  return (
    <ThemeContext.Provider
      value={{ theme, palette, isDark: theme === "dark", toggleTheme, setPalette }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
