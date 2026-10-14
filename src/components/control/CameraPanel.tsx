import { useEffect, useRef, useState, useCallback } from "react";
import { useRelaySocket } from "@/lib/relay";
import { Play, Square, Gauge, Image as ImageIcon, Video, RefreshCw } from "lucide-react";

const WIDTH_OPTIONS = [
  { label: "QVGA", value: 320 },
  { label: "VGA", value: 640 },
  { label: "HD", value: 1280 },
  { label: "FHD", value: 1920 },
];
const FPS_OPTIONS = [5, 10, 15, 20, 30];
// ffmpeg -q:v scale: 2 (best) .. 31 (worst). Flip for the UI.
const QUALITY_OPTIONS = [
  { label: "Low", value: 15 },
  { label: "Medium", value: 8 },
  { label: "High", value: 3 },
];

function cmdId() {
  return (
    (globalThis as any).crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function formatBps(bytesPerSec: number) {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
}

export function CameraPanel({ deviceId }: { deviceId: string }) {
  const { connected, send, onMessage } = useRelaySocket(deviceId);
  const [running, setRunning] = useState(false);
  const [devices, setDevices] = useState<string[]>([]);
  const [device, setDevice] = useState<string>("");
  const [width, setWidth] = useState(640);
  const [quality, setQuality] = useState(8);
  const [fps, setFps] = useState(15);
  const [actualFps, setActualFps] = useState(0);
  const [actualBps, setActualBps] = useState(0);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const framesRef = useRef<number[]>([]);
  const bytesRef = useRef<number[]>([]);
  const lastUrlRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  runningRef.current = running;

  const refreshDevices = useCallback(() => {
    send({ type: "cmd", payload: { id: cmdId(), action: "camera.list" } });
  }, [send]);

  useEffect(() => {
    if (connected) refreshDevices();
  }, [connected, refreshDevices]);

  useEffect(() => {
    return onMessage((m) => {
      if (m.type === "camera.frame" && m.payload?.jpeg) {
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
      } else if (m.type === "camera.error" && m.payload?.error) {
        setLastError(String(m.payload.error));
      } else if (m.type === "result" && m.payload?.devices) {
        const list = (m.payload.devices as string[]) ?? [];
        setDevices(list);
        setDevice((d) => d || list[0] || "");
      } else if (m.type === "result" && m.payload?.ok === false && m.payload.error) {
        const err = String(m.payload.error);
        if (err.includes("auto-download failed")) {
          setLastError("Camera setup failed — couldn't download ffmpeg automatically. Check the machine's internet connection.");

        }
      }
    });
  }, [onMessage]);

  useEffect(() => {
    const t = setInterval(() => {
      setActualFps(framesRef.current.length);
      setActualBps(bytesRef.current.reduce((a, b) => a + b, 0));
    }, 500);
    return () => clearInterval(t);
  }, []);

  const start = useCallback(() => {
    setLastError(null);
    send({
      type: "cmd",
      payload: {
        id: cmdId(),
        action: "camera.start",
        device: device || undefined,
        fps,
        width,
        quality,
      },
    });
    setRunning(true);
  }, [send, device, fps, width, quality]);

  const stop = useCallback(() => {
    send({ type: "cmd", payload: { id: cmdId(), action: "camera.stop" } });
    setRunning(false);
    framesRef.current = [];
    bytesRef.current = [];
  }, [send]);

  useEffect(() => {
    if (!running) return;
    send({
      type: "cmd",
      payload: { id: cmdId(), action: "camera.config", fps, width, quality, device },
    });
  }, [fps, width, quality, device, running, send]);

  useEffect(() => {
    return () => {
      if (runningRef.current) {
        send({ type: "cmd", payload: { id: cmdId(), action: "camera.stop" } });
      }
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
    };
  }, [send]);

  const fpsBad = running && actualFps > 0 && actualFps < Math.max(2, fps / 2);

  return (
    <div className="space-y-4">
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

        <label className="ml-2 inline-flex items-center gap-1.5 text-xs">
          <Video className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Device</span>
          <select
            value={device}
            onChange={(e) => setDevice(e.target.value)}
            className="max-w-[220px] truncate rounded-md border border-border/60 bg-background px-2 py-1 text-xs"
          >
            {devices.length === 0 && <option value="">(default)</option>}
            {devices.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button
            onClick={refreshDevices}
            className="rounded-md border border-border/60 p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            aria-label="Refresh cameras"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </label>

        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <Select label="Width" value={width} onChange={(v) => setWidth(Number(v))}
            options={WIDTH_OPTIONS.map((r) => ({ label: r.label, value: r.value }))} />
          <Select label="FPS" value={fps} onChange={(v) => setFps(Number(v))}
            options={FPS_OPTIONS.map((n) => ({ label: `${n}`, value: n }))} />
          <Select label="Quality" value={quality} onChange={(v) => setQuality(Number(v))}
            options={QUALITY_OPTIONS.map((q) => ({ label: q.label, value: q.value }))} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/60 bg-card/60 px-4 py-2 text-xs backdrop-blur-xl">
        <Metric icon={Gauge} label="FPS" value={running ? `${actualFps}` : "—"} hint={`target ${fps}`} warn={fpsBad} />
        <Metric icon={ImageIcon} label="Resolution" value={frameSize ? `${frameSize.w}×${frameSize.h}` : "—"} />
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

      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-black" style={{ minHeight: 360 }}>
        <img ref={imgRef} alt="remote camera" draggable={false} className="block w-full" style={{ userSelect: "none" }} />
        {!running && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Video className="h-6 w-6 opacity-50" />
            {lastError ?? "Press Start to begin streaming the remote webcam."}
          </div>
        )}
        {running && !frameSize && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            {lastError ?? "Waiting for first frame…"}
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Camera streaming is automatic — the agent downloads what it needs on
        first use. Lower the width or quality for slower networks.

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
