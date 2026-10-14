import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Users, Wifi, Activity, Cpu, ArrowUpRight } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/dashboard/")({
  component: OverviewPage,
});


type Device = {
  id: string;
  pc_name: string;
  device_name: string;
  ip_address: string;
  is_online: boolean;
  last_seen: string;
};

type MetricRow = { recorded_at: string; cpu_percent: number | null; ram_percent: number | null };

function useCountUp(value: number, duration = 700) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);
  useEffect(() => {
    fromRef.current = display;
    startRef.current = null;
    let raf = 0;
    const step = (t: number) => {
      if (startRef.current === null) startRef.current = t;
      const p = Math.min(1, (t - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(fromRef.current + (value - fromRef.current) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return display;
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  delay,
  suffix,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  delay: number;
  suffix?: string;
}) {
  const shown = useCountUp(value);
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-xl transition hover:border-border animate-in fade-in slide-in-from-bottom-3 duration-500"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-30 blur-2xl transition group-hover:opacity-60"
        style={{ background: accent }}
      />
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/20">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <div className="text-3xl font-semibold tracking-tight tabular-nums">{shown}</div>
        {suffix && <div className="text-sm text-muted-foreground">{suffix}</div>}
      </div>
    </div>
  );
}

function OverviewPage() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [metrics, setMetrics] = useState<MetricRow[]>([]);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    const load = async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // owned + shared device ids for this user
      const [{ data: owned }, { data: sharedRows }] = await Promise.all([
        supabase
          .from("devices")
          .select("id,pc_name,device_name,ip_address,is_online,last_seen")
          .eq("owner_user_id", user.id),
        supabase.from("device_access").select("device_id").eq("user_id", user.id),
      ]);
      const sharedIds = (sharedRows ?? []).map((r: any) => r.device_id);
      let shared: Device[] = [];
      if (sharedIds.length) {
        const { data } = await supabase
          .from("devices")
          .select("id,pc_name,device_name,ip_address,is_online,last_seen")
          .in("id", sharedIds);
        shared = (data as Device[]) ?? [];
      }
      const map = new Map<string, Device>();
      for (const d of [...(owned ?? []), ...shared] as Device[]) map.set(d.id, d);
      const deviceList = Array.from(map.values());

      const deviceIds = deviceList.map((d) => d.id);
      let metricRows: MetricRow[] = [];
      if (deviceIds.length) {
        const { data: m } = await supabase
          .from("device_metrics")
          .select("recorded_at,cpu_percent,ram_percent,device_id")
          .in("device_id", deviceIds)
          .gte("recorded_at", since)
          .order("recorded_at", { ascending: true });
        metricRows = (m ?? []) as MetricRow[];
      }

      if (!mounted) return;
      setDevices(deviceList);
      setMetrics(metricRows);
    };
    load();

    const channel = supabase
      .channel("overview")
      .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "device_metrics" }, load)
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [user]);


  const total = devices.length;
  const online = devices.filter((d) => d.is_online).length;
  const offline = total - online;

  const chartData = useMemo(() => {
    // bucket metrics into 24 hourly slots
    const buckets: { hour: string; cpu: number; ram: number; count: number }[] = Array.from(
      { length: 24 },
      (_, i) => {
        const h = new Date(Date.now() - (23 - i) * 60 * 60 * 1000);
        return {
          hour: h.getHours().toString().padStart(2, "0") + ":00",
          cpu: 0,
          ram: 0,
          count: 0,
        };
      },
    );
    const now = Date.now();
    for (const m of metrics) {
      const t = new Date(m.recorded_at).getTime();
      const hoursAgo = Math.floor((now - t) / (60 * 60 * 1000));
      const idx = 23 - hoursAgo;
      if (idx >= 0 && idx < 24) {
        buckets[idx].cpu += Number(m.cpu_percent ?? 0);
        buckets[idx].ram += Number(m.ram_percent ?? 0);
        buckets[idx].count += 1;
      }
    }
    return buckets.map((b) => ({
      hour: b.hour,
      cpu: b.count ? +(b.cpu / b.count).toFixed(1) : 0,
      ram: b.count ? +(b.ram / b.count).toFixed(1) : 0,
    }));
  }, [metrics]);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-xl">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Realtime
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total clients" value={total} icon={Users} accent="oklch(0.6 0.18 280 / 0.6)" delay={0} />
        <StatCard label="Active now" value={online} icon={Wifi} accent="oklch(0.78 0.16 155 / 0.6)" delay={80} />
        <StatCard label="Offline" value={offline} icon={Activity} accent="oklch(0.7 0.18 30 / 0.55)" delay={160} />
        <StatCard label="Metrics 24h" value={metrics.length} icon={Cpu} accent="oklch(0.7 0.15 220 / 0.55)" delay={240} />
      </section>

      <section
        className="rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-3 duration-500"
        style={{ animationDelay: "320ms", animationFillMode: "both" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Last 24 hours</h2>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[oklch(0.78_0.16_155)]" /> CPU
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[oklch(0.6_0.18_280)]" /> RAM
            </span>
          </div>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.78 0.16 155)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="oklch(0.78 0.16 155)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ramFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.6 0.18 280)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="oklch(0.6 0.18 280)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="oklch(1 0 0 / 0.06)" vertical={false} />
              <XAxis dataKey="hour" tick={{ fill: "oklch(0.7 0 0)", fontSize: 11 }} tickLine={false} axisLine={false} interval={3} />
              <YAxis tick={{ fill: "oklch(0.7 0 0)", fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 100]} />
              <Tooltip
                contentStyle={{
                  background: "oklch(0.18 0.01 260 / 0.95)",
                  border: "1px solid oklch(1 0 0 / 0.1)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "oklch(0.85 0 0)" }}
              />
              <Area type="monotone" dataKey="cpu" stroke="oklch(0.78 0.16 155)" strokeWidth={2} fill="url(#cpuFill)" />
              <Area type="monotone" dataKey="ram" stroke="oklch(0.6 0.18 280)" strokeWidth={2} fill="url(#ramFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section
        className="rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-3 duration-500"
        style={{ animationDelay: "400ms", animationFillMode: "both" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Active clients</h2>
          <Link to="/dashboard/clients" className="flex items-center gap-1 text-xs text-primary transition hover:opacity-80">
            View all <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        {devices.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">—</div>
        ) : (
          <ul className="divide-y divide-border/60">
            {devices.slice(0, 6).map((d) => (
              <li key={d.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className={`relative flex h-2 w-2`}>
                    {d.is_online && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    )}
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${d.is_online ? "bg-emerald-500" : "bg-muted-foreground/50"}`} />
                  </span>
                  <div>
                    <div className="text-sm font-medium">{d.pc_name}</div>
                    <div className="text-xs text-muted-foreground">{d.device_name} · {d.ip_address}</div>
                  </div>
                </div>
                <Link
                  to="/dashboard/clients/$id"
                  params={{ id: d.id }}
                  className="rounded-md border border-border/60 px-3 py-1 text-xs transition hover:bg-accent hover:text-accent-foreground"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
