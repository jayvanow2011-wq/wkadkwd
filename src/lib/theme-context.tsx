import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeName = "dark" | "light" | "summer";
const STORAGE = "larping-theme";

type Ctx = {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
};
const ThemeContext = createContext<Ctx | undefined>(undefined);

function apply(t: ThemeName) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.classList.remove("theme-dark", "theme-light", "theme-summer");
  html.classList.add(`theme-${t}`);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("dark");

  useEffect(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem(STORAGE)) as ThemeName | null;
    const initial = stored ?? "dark";
    setThemeState(initial);
    apply(initial);
  }, []);

  const setTheme = (t: ThemeName) => {
    setThemeState(t);
    try { localStorage.setItem(STORAGE, t); } catch {}
    apply(t);
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be inside <ThemeProvider>");
  return ctx;
}
