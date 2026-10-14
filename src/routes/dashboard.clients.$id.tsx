import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { listFriends } from "@/lib/friends.functions";
import { shareClient, listDeviceAccess, revokeAccess } from "@/lib/share.functions";
import { ArrowLeft, Monitor, Info, Activity, Terminal, Camera, FileBox, Cpu, Network, ScrollText, Share2, X, Users as UsersIcon, Trash2 as TrashIcon } from "lucide-react";

export const Route = createFileRoute("/dashboard/clients/$id")({
  component: ClientControlPage,
});

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
  owner_user_id: string | null;
};

type Metric = {
  id: string;
  cpu_percent: number | null;
  ram_percent: number | null;
  ram_used_mb: number | null;
  ram_total_mb: number | null;
  uptime_seconds: number | null;
  recorded_at: string;
};

type TabKey =
  | "overview"
  | "screen"
  | "camera"
  | "console"
  | "files"
  | "processes"
  | "network"
  | "logs"
  | "access";

const TABS: Array<{ key: TabKey; label: string; icon: typeof Info }> = [
  { key: "overview", label: "Overview", icon: Info },
  { key: "screen", label: "Live Screen", icon: Monitor },
  { key: "camera", label: "Camera", icon: Camera },
  { key: "console", label: "Remote Console", icon: Terminal },
  { key: "files", label: "Files", icon: FileBox },
  { key: "processes", label: "Processes", icon: Cpu },
  { key: "network", label: "Network", icon: Network },
  { key: "logs", label: "Logs", icon: ScrollText },
  { key: "access", label: "Access", icon: UsersIcon },
];

function ClientControlPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [device, setDevice] = useState<Device | null>(null);
  const [metric, setMetric] = useState<Metric | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);
  const [sessionStart] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  const [showShare, setShowShare] = useState(false);
  const isOwner = !!user && device?.owner_user_id === user.id;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase
        .from("devices")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!mounted) return;
      if (!data) {
        navigate({ to: "/dashboard/clients" });
        return;
      }
      setDevice(data as Device);

      const { data: m } = await supabase
        .from("device_metrics")
        .select("*")
        .eq("device_id", id)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (mounted && m) setMetric(m as Metric);
      setLoading(false);
    };
    load();

    const deviceCh = supabase
      .channel(`device-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "devices", filter: `id=eq.${id}` },
        (payload) => setDevice(payload.new as Device),
      )
      .subscribe();

    const metricsCh = supabase
      .channel(`device-metrics-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "device_metrics",
          filter: `device_id=eq.${id}`,
        },
        (payload) => setMetric(payload.new as Metric),
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(deviceCh);
      supabase.removeChannel(metricsCh);
    };
  }, [id, navigate]);

  if (loading || !device) {
    return <div className="text-sm text-muted-foreground">Loading session…</div>;
  }

  const elapsed = Math.floor((now - sessionStart) / 1000);
  const hh = String(Math.floor(elapsed / 3600)).padStart(2, "0");
  const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="relative -m-8 min-h-[calc(100vh-0px)] overflow-hidden bg-background animate-in fade-in zoom-in-[0.99] duration-500">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,oklch(0.6_0.18_280/0.12),transparent_55%),radial-gradient(circle_at_85%_90%,oklch(0.78_0.16_155/0.1),transparent_55%)]" />
      <div className="relative px-8 py-8">

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard/clients"
            className="rounded-md border border-border/60 p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            aria-label="Back to clients"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-xl font-semibold leading-tight">{device.pc_name}</h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    device.is_online
                      ? "bg-emerald-400 shadow-[0_0_8px_oklch(0.7_0.18_155)] animate-pulse"
                      : "bg-muted-foreground"
                  }`}
                />
                {device.is_online ? "Online" : "Offline"} ·{" "}
                {device.username ?? "unknown user"} · {device.ip_address ?? "no ip"}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isOwner && (
            <button onClick={() => setShowShare(true)} className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20">
              <Share2 className="h-3.5 w-3.5" /> Share
            </button>
          )}
          <MetricChip label="CPU" value={metric?.cpu_percent != null ? `${metric.cpu_percent.toFixed(0)}%` : "—"} />
          <MetricChip label="RAM" value={metric?.ram_percent != null ? `${metric.ram_percent.toFixed(0)}%` : "—"} />
          <MetricChip label="Session" value={`${hh}:${mm}:${ss}`} accent />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-1 border-b border-border/60">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm transition ${
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {tab === "overview" && <OverviewTab device={device} metric={metric} />}
        {tab === "access" && <AccessTab deviceId={id} isOwner={isOwner} />}
        {tab !== "overview" && tab !== "access" && <ComingSoonTab name={TABS.find((t) => t.key === tab)!.label} />}
      </div>
      </div>
      {showShare && <ShareDialog deviceId={id} deviceName={device.device_name} onClose={() => setShowShare(false)} />}
    </div>
  );
}

function AccessTab({ deviceId, isOwner }: { deviceId: string; isOwner: boolean }) {
  const _list = useServerFn(listDeviceAccess);
  const _revoke = useServerFn(revokeAccess);
  const [rows, setRows] = useState<any[] | null>(null);

  const load = async () => {
    try { const r = await _list({ data: { device_id: deviceId } }); setRows(r.access); }
    catch (e: any) { toast.error(e.message); setRows([]); }
  };
  useEffect(() => { load(); }, [deviceId]);

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-5 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">People with access</div>
          <p className="text-xs text-muted-foreground">Host always has full control. Controllers can operate the device.</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {rows === null && <div className="text-xs text-muted-foreground">Loading…</div>}
        {rows?.length === 0 && <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Only you have access. Use Share to invite a friend.</div>}
        {rows?.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-md border border-border bg-background/40 p-3">
            {r.profile?.avatar_url ? <img src={r.profile.avatar_url} className="h-8 w-8 rounded-full object-cover" alt="" /> : <div className="h-8 w-8 rounded-full bg-muted" />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{r.profile?.username ?? r.user_id.slice(0, 8)}</div>
              <div className="text-[11px] text-muted-foreground">{r.role} · added {new Date(r.created_at).toLocaleDateString()}</div>
            </div>
            {isOwner && (
              <button onClick={async () => { if (!confirm("Revoke access?")) return; try { await _revoke({ data: { device_id: deviceId, user_id: r.user_id } }); toast.success("Revoked"); load(); } catch (e: any) { toast.error(e.message); }}} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"><TrashIcon className="h-3.5 w-3.5" /></button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ShareDialog({ deviceId, deviceName, onClose }: { deviceId: string; deviceName: string; onClose: () => void }) {
  const _friends = useServerFn(listFriends);
  const _share = useServerFn(shareClient);
  const [friends, setFriends] = useState<any[]>([]);
  useEffect(() => { _friends().then((r) => setFriends(r.friends.filter((f: any) => f.status === "accepted"))); }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Share {deviceName}</h2><button onClick={onClose}><X className="h-4 w-4" /></button></div>
        <p className="mt-1 text-xs text-muted-foreground">Pick a friend to grant controller access.</p>
        <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
          {friends.length === 0 && <div className="py-6 text-center text-xs text-muted-foreground">No friends yet.</div>}
          {friends.map((f) => (
            <div key={f.friendship_id} className="flex items-center gap-2 rounded-md border border-border p-2">
              {f.avatar_url ? <img src={f.avatar_url} alt="" className="h-8 w-8 rounded-full" /> : <div className="h-8 w-8 rounded-full bg-muted" />}
              <div className="min-w-0 flex-1 truncate text-sm">{f.username ?? "user"}</div>
              <button onClick={async () => { try { await _share({ data: { device_id: deviceId, to_user_id: f.other_id } }); toast.success("Share sent"); onClose(); } catch (e: any) { toast.error(e.message); }}} className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">Share</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 px-3 py-2 backdrop-blur-xl">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-sm font-medium ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function OverviewTab({ device, metric }: { device: Device; metric: Metric | null }) {
  const rows: Array<{ label: string; value: string; mono?: boolean }> = [
    { label: "PC name", value: device.pc_name },
    { label: "Device name", value: device.device_name },
    { label: "Operating system", value: device.os ?? "Unknown" },
    { label: "Logged-in user", value: device.username ?? "—" },
    { label: "IP address", value: device.ip_address ?? "—", mono: true },
    { label: "Last seen IP", value: device.last_seen_ip ?? "—", mono: true },
    { label: "Status", value: device.is_online ? "Online" : "Offline" },
    { label: "Last seen", value: new Date(device.last_seen).toLocaleString() },
    { label: "Device ID", value: device.id, mono: true },
    { label: "Registered", value: new Date(device.created_at).toLocaleString() },
  ];

  const uptime = metric?.uptime_seconds ?? 0;
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 overflow-hidden rounded-xl border border-border/60 bg-card/60 backdrop-blur-xl">
        <div className="border-b border-border/40 px-5 py-3 text-sm font-medium">
          Device information
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
          <Bar label="CPU" pct={metric?.cpu_percent ?? null} />
          <Bar label="RAM" pct={metric?.ram_percent ?? null} />
          {metric?.ram_total_mb ? (
            <div className="mt-2 text-xs text-muted-foreground">
              {(metric.ram_used_mb ?? 0).toLocaleString()} MB /{" "}
              {metric.ram_total_mb.toLocaleString()} MB
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-border/60 bg-card/60 p-5 backdrop-blur-xl">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Uptime</div>
          <div className="mt-2 text-lg font-semibold">
            {uptime ? `${days}d ${hours}h` : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

function Bar({ label, pct }: { label: string; pct: number | null }) {
  const value = pct ?? 0;
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
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

function ComingSoonTab({ name }: { name: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-10 text-center backdrop-blur-xl">
      <div className="text-sm font-medium">{name}</div>
      <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
        This panel will activate once the Go agent and consent prompts are wired up. Every action
        will require explicit confirmation on the client device and will be written to the audit log.
      </p>
    </div>
  );
}
