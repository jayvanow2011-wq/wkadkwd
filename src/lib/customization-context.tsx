import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type FontChoice = "sans" | "serif" | "mono" | "display";
export type Density = "compact" | "comfortable" | "spacious";
export type NavStyle = "tabs" | "pills" | "underline";
export type Language = "en" | "ru" | "nl";
export type AIPersonality = "friendly" | "simple" | "aggressive" | "sarcastic" | "uncensored";

export type Customization = {
  accentHue: number;        // 0-360
  accentChroma: number;     // 0.05 - 0.25
  radius: number;           // rem (e.g. 0.75)
  fontScale: number;        // 0.85 - 1.2
  font: FontChoice;
  density: Density;
  sidebarWidth: number;     // px, 200-340
  bgHueShift: number;       // -60..60 deg
  cardOpacity: number;      // 0.4..1
  shadowIntensity: number;  // 0..2
  blurIntensity: number;    // 0..32 px
  letterSpacing: number;    // -0.02..0.08 em
  lineHeight: number;       // 1.2..1.9
  animationsEnabled: boolean;
  fallingLeaves: boolean;   // autumn leaves effect
  navStyle: NavStyle;
  navOrder: string[];       // route paths
  navHidden: string[];      // route paths to hide
  bgColor: string;          // CSS color, empty string = use theme
  bgImage: string;          // data URL or url(...), empty = none
  bgOpacity: number;        // 0..1 overlay strength on image
  bgBlur: number;           // 0..40 px blur on image
  language: Language;
  aiEnabled: boolean;
  aiPersonality: AIPersonality;
  aiBrief: boolean;
  outlineColor: string;     // outline/border/accent
  textColor: string;        // foreground text
};

export const DEFAULT_CUSTOMIZATION: Customization = {
  accentHue: 268,
  accentChroma: 0.22,
  radius: 0.5,
  fontScale: 1,
  font: "sans",
  density: "comfortable",
  sidebarWidth: 260,
  bgHueShift: 0,
  cardOpacity: 1,
  shadowIntensity: 1,
  blurIntensity: 16,
  letterSpacing: 0,
  lineHeight: 1.5,
  animationsEnabled: true,
  fallingLeaves: true,
  navStyle: "pills",
  navOrder: [],
  navHidden: [],
  bgColor: "",
  bgImage: "",
  bgOpacity: 0.4,
  bgBlur: 0,
  language: "en",
  aiEnabled: true,
  aiPersonality: "friendly",
  aiBrief: true,
  outlineColor: "",
  textColor: "",
};

const STORAGE = "veltrix-customization";

const FONT_STACKS: Record<FontChoice, string> = {
  sans: '"Inter", system-ui, -apple-system, sans-serif',
  serif: '"Instrument Serif", Georgia, serif',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  display: '"Space Grotesk", system-ui, sans-serif',
};

// (density scale removed in clean theme rewrite)

function apply(c: Customization) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--font-display", FONT_STACKS[c.font]);
  root.classList.toggle("no-animations", !c.animationsEnabled);
  // theme handled by ThemeProvider via .theme-* class; nothing else to override.
}

type Ctx = {
  customization: Customization;
  update: <K extends keyof Customization>(k: K, v: Customization[K]) => void;
  reset: () => void;
};

const CustomizationContext = createContext<Ctx | undefined>(undefined);

export function CustomizationProvider({ children }: { children: ReactNode }) {
  const [customization, setCustomization] = useState<Customization>(DEFAULT_CUSTOMIZATION);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE) : null;
      if (raw) {
        const parsed = { ...DEFAULT_CUSTOMIZATION, ...JSON.parse(raw) } as Customization;
        setCustomization(parsed);
        apply(parsed);
        return;
      }
    } catch {}
    apply(DEFAULT_CUSTOMIZATION);
  }, []);

  const update = useCallback(<K extends keyof Customization>(k: K, v: Customization[K]) => {
    setCustomization((prev) => {
      const next = { ...prev, [k]: v };
      try { localStorage.setItem(STORAGE, JSON.stringify(next)); } catch {}
      apply(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    try { localStorage.removeItem(STORAGE); } catch {}
    setCustomization(DEFAULT_CUSTOMIZATION);
    apply(DEFAULT_CUSTOMIZATION);
  }, []);

  const value = useMemo(() => ({ customization, update, reset }), [customization, update, reset]);

  return <CustomizationContext.Provider value={value}>{children}</CustomizationContext.Provider>;
}

export function useCustomization() {
  const ctx = useContext(CustomizationContext);
  if (!ctx) throw new Error("useCustomization must be inside <CustomizationProvider>");
  return ctx;
}