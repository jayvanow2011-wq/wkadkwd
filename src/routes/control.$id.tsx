import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useRelaySocket } from "@/lib/relay";
import { ArrowLeft, Terminal, Info, Monitor, X } from "lucide-react";
import type { LiveInfo, LiveMetric } from "@/components/control/InfoPanel";

const ShellPanel = lazy(() =>
  import("@/components/control/ShellPanel").then((m) => ({ default: m.ShellPanel })),
);
const InfoPanel = lazy(() =>
  import("@/components/control/InfoPanel").then((m) => ({ default: m.InfoPanel })),
);
const ScreenPanel = lazy(() =>
  import("@/components/control/ScreenPanel").then((m) => ({ default: m.ScreenPanel })),
);

export const Route = createFileRoute("/control/$id")({
  component: ControlPage,
  head: () => ({
    meta: [
      { title: "Remote command · Control" },
      { name: "description", content: "Send remote commands to a connected client in realtime." },
    ],
  }),
});

type Device = {
  id: string;
  pc_name: string;
  device_name: string;
  ip_address: string | null;
  os: string | null;
  username: string | null;
  platform: string;
  is_online: boolean;
  last_seen: string;
  last_seen_ip: string | null;
  created_at: string;
};

type TabKey = "shell" | "screen" | "info";

function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted)
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Loading session…
      </div>
    );
  return <>{children}</>;
}

function ControlPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { authed, loading: authLoading } = useAuth();
  const [device, setDevice] = useState<Device | null>(null);
  const [tab, setTab] = useState<TabKey>("shell");
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<LiveMetric | null>(null);
  const [live, setLive] = useState<LiveInfo | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const { connected, onMessage, send } = useRelaySocket(id);
  const infoRequested = useRef(false);

  useEffect(() => {
    if (!authLoading && !authed) navigate({ to: "/" });
  }, [authed, authLoading, navigate]);

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
      setDevice(data as unknown as Device);
      setLoading(false);
    };
    load();
    const ch = supabase
      .channel(`ctrl-dev-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "devices", filter: `id=eq.${id}` },
        (p: any) => setDevice((prev) => ({ ...(prev as Device), ...p.new })),
      )
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [id, navigate]);

  // Subscribe to relay messages: info + metrics from the agent.
  useEffect(() => {
    return onMessage((msg) => {
      if (msg.type === "info" && msg.payload) {
        setLive(msg.payload as LiveInfo);
        setLastUpdate(Date.now());
      } else if (msg.type === "metrics" && msg.payload) {
        setMetric(msg.payload as LiveMetric);
        setLastUpdate(Date.now());
      }
    });
  }, [onMessage]);

  // When the relay connects, ask the agent for a fresh info snapshot once.
  useEffect(() => {
    if (connected && !infoRequested.current) {
      infoRequested.current = true;
      send({
        type: "cmd",
        payload: {
          id:
            (globalThis as any).crypto?.randomUUID?.() ??
            `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          action: "system.info",
        },
      });
    }
  }, [connected, send]);

  if (authLoading || loading || !device) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading session…
      </div>
    );
  }

  const tabs: Array<{ key: TabKey; label: string; icon: typeof Info }> = [
    { key: "shell", label: "Remote Command", icon: Terminal },
    { key: "screen", label: "Screen", icon: Monitor },
    { key: "info", label: "Info", icon: Info },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,oklch(0.6_0.18_280/0.12),transparent_55%),radial-gradient(circle_at_85%_90%,oklch(0.78_0.16_155/0.1),transparent_55%)]" />
      <div className="relative flex h-screen">
        <aside className="flex w-56 flex-col border-r border-border/60 bg-card/40 backdrop-blur-xl">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <button
              onClick={() => window.close()}
              className="rounded-md border border-border/60 p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
              aria-label="Close"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{device.pc_name}</div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    device.is_online && connected
                      ? "bg-emerald-400 shadow-[0_0_8px_oklch(0.7_0.18_155)] animate-pulse"
                      : connected
                        ? "bg-amber-400"
                        : "bg-muted-foreground"
                  }`}
                />
                {device.is_online ? (connected ? "Online" : "DB only") : "Offline"}
              </div>
            </div>
          </div>
          <nav className="flex-1 space-y-1 p-2">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition ${
                    active
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </nav>
          <div className="border-t border-border/60 p-3 text-[11px] text-muted-foreground">
            <div className="font-mono">{device.ip_address ?? "no ip"}</div>
            <div className="mt-0.5">{live?.username ?? device.username ?? "unknown user"}</div>
            <div className="mt-1 flex items-center gap-1">
              <span
                className={`h-1 w-1 rounded-full ${connected ? "bg-emerald-400" : "bg-muted-foreground"}`}
              />
              <span>{connected ? "relay connected" : "relay disconnected"}</span>
            </div>
          </div>
        </aside>
        <main className="flex-1 overflow-auto">
          <div className="flex items-center justify-between border-b border-border/60 bg-card/40 px-6 py-3 backdrop-blur-xl">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Remote control
              </div>
              <h1 className="text-lg font-semibold">
                {tabs.find((t) => t.key === tab)?.label}
              </h1>
            </div>
            <button
              onClick={() => window.close()}
              className="inline-flex items-center gap-1 rounded-md border border-border/60 px-3 py-1.5 text-xs transition hover:bg-accent"
            >
              <X className="h-3 w-3" /> End session
            </button>
          </div>
          <div className="p-6">
            <ClientOnly>
              <Suspense
                fallback={
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    Loading…
                  </div>
                }
              >
                <div className={tab === "shell" ? "" : "hidden"}>
                  <ShellPanel deviceId={id} />
                </div>
                {tab === "screen" && (
                  <div>
                    <ScreenPanel deviceId={id} />
                  </div>
                )}
                <div className={tab === "info" ? "" : "hidden"}>
                  <InfoPanel
                    device={device as any}
                    metric={metric}
                    live={live}
                    lastUpdate={lastUpdate}
                  />
                </div>
              </Suspense>
            </ClientOnly>
          </div>
        </main>
      </div>
    </div>
  );
}
