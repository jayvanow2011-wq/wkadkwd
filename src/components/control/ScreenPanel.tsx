import { useEffect, useRef, useState, useCallback } from "react";
import { useRelaySocket } from "@/lib/relay";
import { Play, Square, MousePointerClick, Gauge, Image as ImageIcon } from "lucide-react";

type Resolution = { label: string; width: number };
const RESOLUTIONS: Resolution[] = [
  { label: "480p", width: 854 },
  { label: "720p", width: 1280 },
  { label: "1080p", width: 1920 },
  { label: "Native", width: 0 },
];
const FPS_OPTIONS = [5, 10, 15, 20, 30];
const QUALITY_OPTIONS = [
  { label: "Low", value: 35 },
  { label: "Medium", value: 55 },
  { label: "High", value: 75 },
];

function cmdId() {
  return (
    (globalThis as any).crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function keyCodeToVK(code: string): number {
  if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3); // 'A'=0x41
  if (/^Digit[0-9]$/.test(code)) return code.charCodeAt(5); // '0'=0x30
  if (/^Numpad[0-9]$/.test(code)) return 0x60 + Number(code.slice(6));
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return 0x6F + Number(code.slice(1)); // F1=0x70
  const map: Record<string, number> = {
    Backspace: 0x08, Tab: 0x09, Enter: 0x0D, ShiftLeft: 0xA0, ShiftRight: 0xA1,
    ControlLeft: 0xA2, ControlRight: 0xA3, AltLeft: 0xA4, AltRight: 0xA5,
    CapsLock: 0x14, Escape: 0x1B, Space: 0x20, PageUp: 0x21, PageDown: 0x22,
    End: 0x23, Home: 0x24, ArrowLeft: 0x25, ArrowUp: 0x26, ArrowRight: 0x27,
    ArrowDown: 0x28, Insert: 0x2D, Delete: 0x2E, MetaLeft: 0x5B, MetaRight: 0x5C,
    ContextMenu: 0x5D, NumLock: 0x90, ScrollLock: 0x91,
    Semicolon: 0xBA, Equal: 0xBB, Comma: 0xBC, Minus: 0xBD, Period: 0xBE,
    Slash: 0xBF, Backquote: 0xC0, BracketLeft: 0xDB, Backslash: 0xDC,
    BracketRight: 0xDD, Quote: 0xDE,
    NumpadMultiply: 0x6A, NumpadAdd: 0x6B, NumpadSubtract: 0x6D,
    NumpadDecimal: 0x6E, NumpadDivide: 0x6F, NumpadEnter: 0x0D,
  };
  return map[code] ?? 0;
}

function formatBps(bytesPerSec: number) {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
}

export function ScreenPanel({ deviceId }: { deviceId: string }) {
  const { connected, send, onMessage } = useRelaySocket(deviceId);
  const [running, setRunning] = useState(false);
  const [control, setControl] = useState(false);
  const [maxW, setMaxW] = useState(1280);
  const [quality, setQuality] = useState(55);
  const [fps, setFps] = useState(15);
  const [actualFps, setActualFps] = useState(0);
  const [actualBps, setActualBps] = useState(0);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const framesRef = useRef<number[]>([]);
  const bytesRef = useRef<number[]>([]);
  const lastUrlRef = useRef<string | null>(null);
  const lastMoveRef = useRef(0);
  const runningRef = useRef(false);
  runningRef.current = running;

  // ── incoming frames ──────────────────────────────────────────────────
  useEffect(() => {
    return onMessage((m) => {
      if (m.type === "screen.frame" && m.payload?.jpeg) {
        try {
          const b64 = m.payload.jpeg as string;
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const blob = new Blob([bytes], { type: "image/jpeg" });
          const url = URL.createObjectURL(blob);
          if (imgRef.current) imgRef.current.src = url;
          if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
          lastUrlRef.current = url;
          setFrameSize({ w: m.payload.w ?? 0, h: m.payload.h ?? 0 });
          const now = performance.now();
          framesRef.current.push(now);
          bytesRef.current.push(m.payload.bytes ?? bin.length);
          const cutoff = now - 1000;
          while (framesRef.current.length && framesRef.current[0] < cutoff) {
            framesRef.current.shift();
            bytesRef.current.shift();
          }
        } catch { /* ignore */ }
      } else if (m.type === "result" && m.payload && m.payload.ok === false && m.payload.error) {
        if (String(m.payload.error).includes("not_supported")) {
          setLastError("Agent does not support screen streaming on this OS.");
        }
      }
    });
  }, [onMessage]);

  // ── fps/bps meter tick ───────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      setActualFps(framesRef.current.length);
      setActualBps(bytesRef.current.reduce((a, b) => a + b, 0));
    }, 500);
    return () => clearInterval(t);
  }, []);

  // ── push config live when running ────────────────────────────────────
  useEffect(() => {
    if (!running) return;
    send({
      type: "cmd",
      payload: { id: cmdId(), action: "screen.config", fps, max_width: maxW, quality },
    });
  }, [fps, maxW, quality, running, send]);

  const start = useCallback(() => {
    setLastError(null);
    send({
      type: "cmd",
      payload: { id: cmdId(), action: "screen.start", fps, max_width: maxW, quality },
    });
    setRunning(true);
  }, [send, fps, maxW, quality]);

  const stop = useCallback(() => {
    send({ type: "cmd", payload: { id: cmdId(), action: "screen.stop" } });
    setRunning(false);
    framesRef.current = [];
    bytesRef.current = [];
  }, [send]);

  // ── stop on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (runningRef.current) {
        send({ type: "cmd", payload: { id: cmdId(), action: "screen.stop" } });
      }
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
    };
  }, [send]);

  // ── mouse input ──────────────────────────────────────────────────────
  const sendMouseEvt = useCallback(
    (op: string, e: React.MouseEvent, extra: Record<string, unknown> = {}) => {
      if (!control || !imgRef.current) return;
      const rect = imgRef.current.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      const button = e.button === 2 ? "right" : e.button === 1 ? "middle" : "left";
      send({
        type: "cmd",
        payload: { id: cmdId(), action: "input.mouse", op, x, y, button, ...extra },
      });
    },
    [control, send],
  );

  // ── keyboard input (only when control enabled + container focused) ───
  useEffect(() => {
    if (!control) return;
    const handle = (op: "down" | "up") => (e: KeyboardEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const active = document.activeElement;
      if (active !== el && !el.contains(active as Node | null)) return;
      const vk = keyCodeToVK(e.code);
      if (!vk) return;
      e.preventDefault();
      send({
        type: "cmd",
        payload: { id: cmdId(), action: "input.key", vk, op },
      });
    };
    const d = handle("down");
    const u = handle("up");
    window.addEventListener("keydown", d, true);
    window.addEventListener("keyup", u, true);
    return () => {
      window.removeEventListener("keydown", d, true);
      window.removeEventListener("keyup", u, true);
    };
  }, [control, send]);

  const fpsBad = running && actualFps > 0 && actualFps < Math.max(2, fps / 2);

  return (
    <div className="space-y-4">
      {/* ── toolbar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/60 p-3 backdrop-blur-xl">
        {running ? (
          <button
            onClick={stop}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-500/90 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-500"
          >
            <Square className="h-3.5 w-3.5" /> Stop
          </button>
        ) : (
          <button
            onClick={start}
            disabled={!connected}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5" /> Start
          </button>
        )}

        <label className="ml-2 inline-flex cursor-pointer items-center gap-2 rounded-md border border-border/60 px-3 py-1.5 text-xs">
          <input
            type="checkbox"
            checked={control}
            onChange={(e) => setControl(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          <MousePointerClick className="h-3.5 w-3.5" />
          Enable mouse / keyboard
        </label>

        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <Select
            label="Resolution"
            value={maxW}
            onChange={(v) => setMaxW(Number(v))}
            options={RESOLUTIONS.map((r) => ({ label: r.label, value: r.width }))}
          />
          <Select
            label="FPS"
            value={fps}
            onChange={(v) => setFps(Number(v))}
            options={FPS_OPTIONS.map((n) => ({ label: `${n}`, value: n }))}
          />
          <Select
            label="Quality"
            value={quality}
            onChange={(v) => setQuality(Number(v))}
            options={QUALITY_OPTIONS.map((q) => ({ label: q.label, value: q.value }))}
          />
        </div>
      </div>

      {/* ── metrics strip ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/60 bg-card/60 px-4 py-2 text-xs backdrop-blur-xl">
        <Metric
          icon={Gauge}
          label="FPS"
          value={running ? `${actualFps}` : "—"}
          hint={`target ${fps}`}
          warn={fpsBad}
        />
        <Metric
          icon={ImageIcon}
          label="Resolution"
          value={frameSize ? `${frameSize.w}×${frameSize.h}` : "—"}
        />
        <Metric label="Bitrate" value={running ? formatBps(actualBps) : "—"} />
        <div className="ml-auto inline-flex items-center gap-1.5 text-[11px]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              running
                ? actualFps > 0
                  ? "animate-pulse bg-emerald-400"
                  : "bg-amber-400"
                : "bg-muted-foreground"
            }`}
          />
          {running ? (actualFps > 0 ? "streaming" : "waiting for frames") : "stopped"}
        </div>
      </div>

      {/* ── viewer ──────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        tabIndex={0}
        onContextMenu={(e) => e.preventDefault()}
        className={`relative overflow-hidden rounded-xl border border-border/60 bg-black outline-none ${
          control ? "ring-2 ring-primary/50" : ""
        }`}
        style={{ minHeight: 360 }}
      >
        <img
          ref={imgRef}
          alt="remote screen"
          draggable={false}
          onMouseMove={(e) => {
            if (!control) return;
            const n = performance.now();
            if (n - lastMoveRef.current < 33) return;
            lastMoveRef.current = n;
            sendMouseEvt("move", e);
          }}
          onMouseDown={(e) => sendMouseEvt("down", e)}
          onMouseUp={(e) => sendMouseEvt("up", e)}
          onWheel={(e) => {
            if (!control) return;
            const delta = e.deltaY < 0 ? 1 : -1;
            send({
              type: "cmd",
              payload: { id: cmdId(), action: "input.mouse", op: "scroll", delta },
            });
          }}
          className={`block w-full ${control ? "cursor-crosshair" : "cursor-default"}`}
          style={{ userSelect: "none" }}
        />
        {!running && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <ImageIcon className="h-6 w-6 opacity-50" />
            {lastError ?? "Press Start to begin streaming the remote screen."}
          </div>
        )}
        {running && !frameSize && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Waiting for first frame…
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Streaming happens over the relay socket as JPEG frames. Lower the
        resolution or quality for slower networks. Mouse &amp; keyboard are
        only sent when the panel is focused and “Enable mouse / keyboard” is
        on. Click the viewer first to capture keystrokes.
      </p>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  warn,
}: {
  icon?: typeof Gauge;
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-1.5">
      {Icon ? <Icon className="h-3 w-3 text-muted-foreground" /> : null}
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${warn ? "text-amber-400" : ""}`}>{value}</span>
      {hint ? <span className="text-[10px] text-muted-foreground">({hint})</span> : null}
    </div>
  );
}

function Select<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: string) => void;
  options: Array<{ label: string; value: T }>;
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
