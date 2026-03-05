import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Theme   = "dark" | "light";
export type Accent  = "blue" | "coral" | "green" | "violet";
export type Density = "compact" | "comfortable" | "spacious";
export type Palette = "A" | "B" | "C"; // kept for backwards compat

const STORAGE_KEY = "tweaks_cyber_sentinel";

interface Tweaks {
  theme:   Theme;
  accent:  Accent;
  density: Density;
}

const DEFAULTS: Tweaks = {
  theme:   "dark",
  accent:  "blue",
  density: "comfortable",
};

function load(): Tweaks {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function persist(t: Tweaks) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(t)); } catch { /* ignore */ }
}

interface ThemeContextValue {
  theme:       Theme;
  accent:      Accent;
  density:     Density;
  isDark:      boolean;
  palette:     Palette; // backwards compat — always "A"
  toggleTheme: () => void;
  setTheme:    (t: Theme) => void;
  setAccent:   (a: Accent) => void;
  setDensity:  (d: Density) => void;
  setPalette:  (p: Palette) => void; // no-op, kept for compat
}

const ThemeContext = createContext<ThemeContextValue>({
  theme:   "dark",
  accent:  "blue",
  density: "comfortable",
  isDark:  true,
  palette: "A",
  toggleTheme: () => {},
  setTheme:    () => {},
  setAccent:   () => {},
  setDensity:  () => {},
  setPalette:  () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [tweaks, setTweaks] = useState<Tweaks>(load);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme",   tweaks.theme);
    root.setAttribute("data-accent",  tweaks.accent);
    root.setAttribute("data-density", tweaks.density);
    // Remove old class-based theme so legacy components don't fight the new system
    root.classList.remove("dark", "light");
    persist(tweaks);
  }, [tweaks]);

  const toggleTheme = useCallback(() =>
    setTweaks(t => ({ ...t, theme: t.theme === "dark" ? "light" : "dark" })), []);

  const setTheme   = useCallback((theme:   Theme)   => setTweaks(t => ({ ...t, theme })),   []);
  const setAccent  = useCallback((accent:  Accent)  => setTweaks(t => ({ ...t, accent })),  []);
  const setDensity = useCallback((density: Density) => setTweaks(t => ({ ...t, density })), []);

  return (
    <ThemeContext.Provider value={{
      theme:   tweaks.theme,
      accent:  tweaks.accent,
      density: tweaks.density,
      isDark:  tweaks.theme === "dark",
      palette: "A",
      toggleTheme,
      setTheme,
      setAccent,
      setDensity,
      setPalette: () => {},
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
