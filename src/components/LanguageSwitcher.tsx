import { useEffect, useRef, useState } from "react";
import { Globe, Check } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useCustomization } from "@/lib/customization-context";
import { LANGUAGES } from "@/lib/i18n";

export function LanguageSwitcher({ compact }: { compact?: boolean }) {
  const { customization, update } = useCustomization();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const current = LANGUAGES.find((l) => l.id === customization.language) ?? LANGUAGES[0];

  useEffect(() => {
    document.documentElement.lang = customization.language;
  }, [customization.language]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition"
        title="Language"
        aria-label="Language"
      >
        <Globe className={compact ? "h-4 w-4" : "h-3.5 w-3.5"} />
        {!compact && <span className="uppercase">{current.id}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border border-border bg-popover p-1 shadow-lg">
          {LANGUAGES.map((l) => (
            <button
              key={l.id}
              onClick={() => { update("language", l.id); setOpen(false); }}
              className={`flex w-full items-center justify-between px-3 py-2 text-xs transition ${
                customization.language === l.id ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>{l.label}</span>
              {customization.language === l.id && <Check className="h-3 w-3" />}
            </button>
          ))}
          <div className="my-1 h-px bg-border/60" />
          <button
            onClick={() => { setOpen(false); navigate({ to: "/pumpkin" }); }}
            className="flex w-full items-center justify-between px-3 py-2 text-xs text-muted-foreground/70 hover:text-orange-400 transition"
            title="???"
          >
            <span className="tracking-widest">???</span>
            <span className="opacity-50">·</span>
          </button>
        </div>
      )}
    </div>
  );
}
