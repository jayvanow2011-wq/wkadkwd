import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  webrtcDiagnostics,
  probeIceServer,
  type WebRtcDiagnostics,
  type IceServerStat,
} from "@/lib/webrtc-diagnostics";
// ICE_SERVERS moved out of ScreenPanel — define inline fallback
const ICE_SERVERS: RTCIceServer[] = [
  {
    urls: [
      "turn:openrelay.metered.ca:443?transport=tcp",
      "turns:openrelay.metered.ca:443?transport=tcp",
      "turn:openrelay.metered.ca:80?transport=tcp",
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  { urls: "stun:stun.l.google.com:19302" },
];
import { checkRelayHealth, type RelayHealth } from "@/lib/relay-health.functions";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, RefreshCw, Activity, Server } from "lucide-react";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "WebRTC Status — Diagnostics" },
      { name: "description", content: "Live diagnostics for the WebRTC remote-control transport." },
    ],
  }),
  component: StatusPage,
});

function StatusPage() {
  const [d, setD] = useState<WebRtcDiagnostics>(() => webrtcDiagnostics.get());
  const [probing, setProbing] = useState(false);
  const [probeResults, setProbeResults] = useState<IceServerStat[]>([]);
  const [relay, setRelay] = useState<RelayHealth | null>(null);
  const [relayChecking, setRelayChecking] = useState(false);
  const pingRelay = useServerFn(checkRelayHealth);

  const refreshRelay = useCallback(async () => {
    setRelayChecking(true);
    try {
      const r = await pingRelay();
      setRelay(r);
    } catch {
      setRelay({ ok: false, ms: null });
    } finally {
      setRelayChecking(false);
    }
  }, [pingRelay]);

  useEffect(() => {
    const unsub = webrtcDiagnostics.subscribe(setD);
    refreshRelay();
    const t = setInterval(refreshRelay, 15000);
    return () => {
      unsub();
      clearInterval(t);
    };
  }, [refreshRelay]);

  const checkAll = async () => {
    setProbing(true);
    const flat: { server: RTCIceServer; url: string }[] = [];
    for (const s of ICE_SERVERS) {
      const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
      for (const u of urls) flat.push({ server: { ...s, urls: u }, url: u });
    }
    setProbeResults(flat.map((f) => ({ url: f.url, reachable: null, latencyMs: null })));
    const results = await Promise.all(
      flat.map(async (f) => {
        const r = await probeIceServer(f.server, 5000);
        return { url: f.url, reachable: r.ok, latencyMs: r.latencyMs, error: r.error } as IceServerStat;
      }),
    );
    setProbeResults(results);
    setProbing(false);
  };

  const overallOk =
    d.transport === "webrtc" ||
    (d.connectionState === "connected") ||
    probeResults.some((r) => r.reachable);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,oklch(0.6_0.18_280/0.10),transparent_55%),radial-gradient(circle_at_85%_90%,oklch(0.78_0.16_155/0.08),transparent_55%)]" />
      <div className="relative mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="rounded-md border border-border/60 p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Diagnostics</div>
              <h1 className="text-2xl font-semibold">WebRTC Status</h1>
            </div>
          </div>
          <button
            onClick={checkAll}
            disabled={probing}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {probing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Check all
          </button>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
          <Card label="Overall" value={overallOk ? "Healthy" : d.active ? "Degraded" : "Idle"}
            tone={overallOk ? "ok" : d.active ? "warn" : "muted"} />
          <Card label="Transport" value={d.transport} tone={d.transport === "webrtc" ? "ok" : d.transport === "jpeg" ? "warn" : "muted"} />
          <Card label="Connection" value={d.connectionState} tone={d.connectionState === "connected" ? "ok" : d.connectionState === "failed" ? "bad" : "muted"} />
          <Card label="ICE" value={d.iceConnectionState} tone={d.iceConnectionState === "connected" || d.iceConnectionState === "completed" ? "ok" : d.iceConnectionState === "failed" ? "bad" : "muted"} />
        </div>

        <section className="mb-6 rounded-xl border border-border/60 bg-card/40 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-md border ${
                  relay?.ok
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : relay && !relay.ok
                    ? "border-red-500/40 bg-red-500/10 text-red-300"
                    : "border-border/60 bg-muted/30 text-muted-foreground"
                }`}
              >
                <Server className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Backend</div>
                <div className="flex items-center gap-2 text-base font-semibold">
                  {relayChecking && !relay ? (
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Checking…
                    </span>
                  ) : relay?.ok ? (
                    <span className="text-emerald-300">Online</span>
                  ) : (
                    <span className="text-red-300">Offline</span>
                  )}
                  {relay?.ok && relay.ms != null && (
                    <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-xs text-emerald-200">
                      {relay.ms} ms
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={refreshRelay}
              disabled={relayChecking}
              className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-card/60 px-3 py-1.5 text-xs transition hover:bg-accent disabled:opacity-50"
            >
              {relayChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Recheck
            </button>
          </div>
        </section>



        <Section title="Session">
          <KV k="Active" v={d.active ? "yes" : "no"} />
          <KV k="Device" v={d.deviceId ?? "—"} mono />
          <KV k="Session ID" v={d.sessionId ?? "—"} mono />
          <KV k="Started" v={d.startedAt ? new Date(d.startedAt).toLocaleTimeString() : "—"} />
          <KV k="Connected" v={d.connectedAt ? new Date(d.connectedAt).toLocaleTimeString() : "—"} />
          <KV k="Signaling" v={d.signalingState} />
          <KV k="ICE gathering" v={d.iceGatheringState} />
          <KV k="Local candidates" v={String(d.localCandidates)} />
          <KV k="Remote candidates" v={String(d.remoteCandidates)} />
          <KV k="Last error" v={d.lastError ?? "—"} tone={d.lastError ? "bad" : undefined} />
        </Section>

        <Section title="ICE servers">
          <div className="space-y-1.5">
            {(probeResults.length ? probeResults : d.iceServerChecks).length === 0 && (
              <div className="text-sm text-muted-foreground">Click "Check all" to probe STUN/TURN servers.</div>
            )}
            {(probeResults.length ? probeResults : d.iceServerChecks).map((s) => (
              <div
                key={s.url}
                className="flex items-center justify-between rounded-md border border-border/40 bg-card/40 px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs">{s.url}</span>
                <span className="flex items-center gap-2">
                  {s.reachable === null ? (
                    <span className="text-muted-foreground inline-flex items-center gap-1">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> probing
                    </span>
                  ) : s.reachable ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {s.latencyMs}ms
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-red-400">
                      <XCircle className="h-3.5 w-3.5" /> {s.error ?? "fail"}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Event log">
          <div className="max-h-80 overflow-auto rounded-md border border-border/40 bg-black/40 p-3 font-mono text-xs">
            {d.log.length === 0 ? (
              <div className="text-muted-foreground">No events yet. Start a remote-control session.</div>
            ) : (
              d.log.slice().reverse().map((e, i) => (
                <div
                  key={i}
                  className={
                    e.level === "error"
                      ? "text-red-400"
                      : e.level === "warn"
                      ? "text-amber-300"
                      : "text-muted-foreground"
                  }
                >
                  [{new Date(e.ts).toLocaleTimeString()}] {e.level.toUpperCase()} — {e.msg}
                </div>
              ))
            )}
          </div>
        </Section>

        <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <Activity className="h-3.5 w-3.5" />
          Live — updates automatically as the session changes.
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" | "bad" | "muted" }) {
  const color =
    tone === "ok"
      ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/5"
      : tone === "warn"
      ? "text-amber-300 border-amber-500/30 bg-amber-500/5"
      : tone === "bad"
      ? "text-red-300 border-red-500/30 bg-red-500/5"
      : "text-muted-foreground border-border/60 bg-card/40";
  return (
    <div className={`rounded-lg border px-4 py-3 ${color}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-1 text-base font-semibold capitalize">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-xl border border-border/60 bg-card/40 p-5 backdrop-blur-xl">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function KV({ k, v, mono, tone }: { k: string; v: string; mono?: boolean; tone?: "bad" }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/30 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className={`text-right text-xs ${mono ? "font-mono" : ""} ${tone === "bad" ? "text-red-400" : ""}`}>
        {v}
      </span>
    </div>
  );
}