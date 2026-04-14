/**
 * ThemeProvider — dark-only, no toggle.
 * Always applies class="dark" to <html>.
 * Exports the same interface so existing callers don't break.
 */
import { createContext, useContext, useEffect } from "react";

export type Theme   = "dark" | "light";
export type Palette = "A" | "B" | "C";

interface ThemeContextValue {
  theme:       Theme;
  palette:     Palette;
  isDark:      boolean;
  toggleTheme: () => void;
  setPalette:  (palette: Palette) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme:       "dark",
  palette:     "A",
  isDark:      true,
  toggleTheme: () => {},
  setPalette:  () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Force dark mode — permanently remove light class and data-palette
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light");
    root.classList.add("dark");
    root.removeAttribute("data-palette");
    try { localStorage.removeItem("cs-theme"); } catch { /* ignore */ }
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme:       "dark",
        palette:     "A",
        isDark:      true,
        toggleTheme: () => {},  // no-op — dark only
        setPalette:  () => {},  // no-op — palette A only
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
