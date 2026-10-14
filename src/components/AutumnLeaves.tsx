import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useCustomization } from "@/lib/customization-context";

type Particle = {
  x: number;
  y: number;
  size: number;
  speed: number;
  drift: number;
  angle: number;
  spin: number;
  sway: number;
  phase: number;
  color: string;
  shape: number;
  alpha: number;
};

// Rich autumn palette — oranges, ambers, russets, deep browns, mustard, maroon.
const PALETTE = [
  "#c2410c",
  "#ea580c",
  "#b45309",
  "#92400e",
  "#a16207",
  "#7c2d12",
  "#d97706",
  "#f59e0b",
  "#9a3412",
  "#78350f",
  "#ca8a04",
  "#991b1b",
];

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.globalAlpha = p.alpha;
  ctx.fillStyle = p.color;
  const s = p.size;
  ctx.beginPath();
  if (p.shape === 0) {
    // soft round "snowflake-like" dot
    ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2);
  } else if (p.shape === 1) {
    // small pointed leaf
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s * 0.7, -s * 0.3, s * 0.7, s * 0.3, 0, s);
    ctx.bezierCurveTo(-s * 0.7, s * 0.3, -s * 0.7, -s * 0.3, 0, -s);
  } else {
    // tiny ellipse flake
    ctx.ellipse(0, 0, s * 0.5, s * 0.75, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}

/** Falling autumn particles — background atmosphere, never covers text or buttons. */
export function AutumnLeaves() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const { customization } = useCustomization();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const enabled =
    customization.fallingLeaves &&
    customization.animationsEnabled &&
    !pathname.startsWith("/control");

  useEffect(() => {
    if (!enabled) return;
    const canvas = ref.current;
    if (!canvas || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const COUNT = w < 640 ? 40 : 80;
    const make = (initial: boolean): Particle => {
      const shape = Math.random() < 0.65 ? 0 : Math.random() < 0.5 ? 1 : 2;
      return {
        x: Math.random() * w,
        y: initial ? Math.random() * h : -20,
        size: Math.random() * 4 + 2, // small, snow-like
        speed: Math.random() * 0.55 + 0.25,
        drift: Math.random() * 0.5 - 0.25,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.015,
        sway: Math.random() * 1.2 + 0.3,
        phase: Math.random() * Math.PI * 2,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)]!,
        shape,
        alpha: 0.35 + Math.random() * 0.45,
      };
    };

    const parts: Particle[] = Array.from({ length: COUNT }, () => make(true));

    let raf = 0;
    let last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min((now - last) / 16.667, 3);
      last = now;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]!;
        drawParticle(ctx, p);
        p.y += p.speed * dt;
        p.phase += 0.013 * dt;
        p.x += (p.drift + Math.sin(p.phase) * p.sway * 0.35) * dt;
        p.angle += p.spin * dt;
        if (p.y > h + 15) parts[i] = make(false);
        if (p.x > w + 20) p.x = -20;
        if (p.x < -20) p.x = w + 20;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [enabled]);

  if (!enabled) return null;

  // Background layer: fixed, behind all content (-z-10), transparent so page bg shows through.
  // Pages that paint their own opaque bg-background will cover it; that's fine —
  // leaves show through transparent regions and around the main shell.
  return (
    <canvas
      ref={ref}
      className="pointer-events-none fixed inset-0 -z-10"
      aria-hidden
      style={{ mixBlendMode: "screen" }}
    />
  );
}
