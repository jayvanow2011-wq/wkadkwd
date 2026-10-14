import { useEffect, useRef } from "react";

/**
 * Distorted ring of small white particles that follows the cursor.
 * Pure canvas, no deps. Disabled on touch / reduced-motion.
 */
export function MouseTrail() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    if (reduce || isTouch) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0;
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const mouse = { x: w / 2, y: h / 2, tx: w / 2, ty: h / 2, active: false };
    const onMove = (e: MouseEvent) => {
      mouse.tx = e.clientX;
      mouse.ty = e.clientY;
      mouse.active = true;
    };
    const onLeave = () => { mouse.active = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);

    const N = 64;
    const particles = Array.from({ length: N }, (_, i) => {
      const a = (i / N) * Math.PI * 2;
      return { a, r: 90, n: Math.random() * 1000 };
    });

    let raf = 0;
    let t = 0;
    const render = () => {
      t += 0.012;
      mouse.x += (mouse.tx - mouse.x) * 0.12;
      mouse.y += (mouse.ty - mouse.y) * 0.12;

      ctx.clearRect(0, 0, w, h);
      const opacity = mouse.active ? 0.9 : 0.35;

      for (let i = 0; i < N; i++) {
        const p = particles[i];
        // Distortion: layered sinusoidal noise around the ring
        const distort =
          Math.sin(p.a * 3 + t * 1.4 + p.n) * 18 +
          Math.cos(p.a * 5 - t * 0.9) * 10 +
          Math.sin(p.a * 2 + t * 2.2 + p.n * 0.3) * 6;
        const r = p.r + distort;
        const x = mouse.x + Math.cos(p.a + t * 0.15) * r;
        const y = mouse.y + Math.sin(p.a + t * 0.15) * r;

        const size = 1.1 + (Math.sin(t * 2 + i) + 1) * 0.6;
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${opacity * (0.4 + 0.6 * Math.abs(Math.sin(i + t)))})`;
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[1] mix-blend-screen"
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}

/**
 * ASCII texture backdrop (dashes / plusses) like the reference image.
 * Renders to a canvas once and tiles softly behind content.
 */
export function AsciiBackdrop() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const draw = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.font = '11px "Geist Mono", ui-monospace, monospace';
      ctx.textBaseline = "top";

      const cellW = 8;
      const cellH = 14;
      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.hypot(w, h) / 2;

      for (let y = 0; y < h; y += cellH) {
        for (let x = 0; x < w; x += cellW) {
          const dx = x - cx;
          const dy = y - cy;
          const d = Math.hypot(dx, dy) / maxR;
          // sparse, fades to center and to far edges
          const ring = Math.sin(d * 6) * 0.5 + 0.5;
          const visible = ring > 0.55 && Math.random() > 0.55;
          if (!visible) continue;
          const a = 0.04 + ring * 0.06;
          ctx.fillStyle = `rgba(255,255,255,${a})`;
          const ch = Math.random() > 0.78 ? "+" : Math.random() > 0.5 ? "-" : ".";
          ctx.fillText(ch, x, y);
        }
      }
    };

    draw();
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}