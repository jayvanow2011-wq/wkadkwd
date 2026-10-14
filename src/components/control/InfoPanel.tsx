import { Activity, Cpu, HardDrive, Wifi, Clock } from "lucide-react";

type Device = {
  id: string;
  pc_name: string;
  device_name: string;
  ip_address: string | null;
  os: string | null;
  username: string | null;
  is_online: boolean;
  last_seen: string;
  last_seen_ip: string | null;
  created_at: string;
};

export type LiveMetric = {
  cpu_percent: number | null;
  ram_percent: number | null;
  ram_used_mb: number | null;
  ram_total_mb: number | null;
  uptime_seconds: number | null;
};

export type LiveInfo = {
  pc_name?: string;
  username?: string;
  os?: string;
  arch?: string;
  num_cpu?: number;
  goroutines?: number;
  agent?: string;
  build?: string;
  tag?: string;
  started_at?: number;
};

export function InfoPanel({
  device,
  metric,
  live,
  lastUpdate,
}: {
  device: Device;
  metric: LiveMetric | null;
  live?: LiveInfo | null;
  lastUpdate?: number | null;
}) {
  const uptime = metric?.uptime_seconds ?? 0;
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const mins = Math.floor((uptime % 3600) / 60);

  const since = lastUpdate ? Math.max(0, Math.floor((Date.now() - lastUpdate) / 1000)) : null;

  const rows: Array<{ label: string; value: string; mono?: boolean }> = [
    { label: "PC name", value: live?.pc_name ?? device.pc_name },
    { label: "Device name", value: device.device_name },
    { label: "Operating system", value: live?.os ?? device.os ?? "Unknown" },
    { label: "Architecture", value: live?.arch ?? "—" },
    { label: "Logged-in user", value: live?.username ?? device.username ?? "—" },
    { label: "IP address", value: device.ip_address ?? "—", mono: true },
    { label: "Last seen IP", value: device.last_seen_ip ?? "—", mono: true },
    { label: "Status", value: device.is_online ? "Online" : "Offline" },
    { label: "CPU cores", value: live?.num_cpu ? String(live.num_cpu) : "—" },
    { label: "Agent", value: live?.agent ?? "—" },
    { label: "Build tag", value: live?.tag || device.device_name || "—" },
    { label: "Last seen", value: new Date(device.last_seen).toLocaleString() },
    { label: "Device ID", value: device.id, mono: true },
    { label: "Registered", value: new Date(device.created_at).toLocaleString() },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card/60 backdrop-blur-xl lg:col-span-2">
        <div className="flex items-center justify-between border-b border-border/40 px-5 py-3 text-sm font-medium">
          <span>Device information</span>
          {since !== null && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-normal text-muted-foreground">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_6px_oklch(0.7_0.18_155)]" />
              live · {since}s
            </span>
          )}
        </div>
        <dl className="divide-y divide-border/40">
          {rows.map((r) => (
            <div key={r.label} className="grid grid-cols-3 gap-4 px-5 py-3 text-sm">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className={`col-span-2 ${r.mono ? "font-mono text-xs" : ""}`}>{r.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-border/60 bg-card/60 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
            <span>Live metrics</span>
            <Activity className="h-3 w-3" />
          </div>
          <Bar label="CPU" icon={Cpu} pct={metric?.cpu_percent ?? null} />
          <Bar label="RAM" icon={HardDrive} pct={metric?.ram_percent ?? null} />
          {metric?.ram_total_mb ? (
            <div className="mt-2 text-xs text-muted-foreground">
              {(metric.ram_used_mb ?? 0).toLocaleString()} MB /{" "}
              {metric.ram_total_mb.toLocaleString()} MB
            </div>
          ) : (
            <div className="mt-3 text-[11px] text-muted-foreground">
              Waiting for first metrics push…
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border/60 bg-card/60 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
            <span>Uptime</span>
            <Clock className="h-3 w-3" />
          </div>
          <div className="mt-2 text-lg font-semibold">
            {uptime ? `${days}d ${hours}h ${mins}m` : "—"}
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card/60 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
            <span>Network</span>
            <Wifi className="h-3 w-3" />
          </div>
          <div className="mt-2 font-mono text-sm">{device.ip_address ?? "—"}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {device.is_online ? "connected via relay" : "offline"}
          </div>
        </div>
      </div>
    </div>
  );
}

function Bar({ label, pct, icon: Icon }: { label: string; pct: number | null; icon?: typeof Cpu }) {
  const value = pct ?? 0;
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          {Icon ? <Icon className="h-3 w-3" /> : null}
          {label}
        </span>
        <span className="font-medium">{pct != null ? `${value.toFixed(0)}%` : "—"}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}
