import { createFileRoute } from "@tanstack/react-router";
import { Download, Terminal, ShieldCheck, Cpu } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/dih")({
  component: DihPage,
  head: () => ({
    meta: [
      { title: "Connect agent · Sentinel" },
      { name: "description", content: "Download and connect the Sentinel Windows agent." },
    ],
  }),
});

const SERVER_URL = "https://project--696a7254-17f4-4b69-87cc-096fb12a6369-dev.lovable.app";

function DihPage() {
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");
  const [latency, setLatency] = useState<number | null>(null);

  const test = async () => {
    setStatus("idle");
    const t0 = performance.now();
    // Always test against the origin the page is currently loaded from —
    // that's the server actually serving this page. Cross-origin tests to a
    // not-yet-published domain will always look "unreachable".
    const base = typeof window !== "undefined" ? window.location.origin : SERVER_URL;
    try {
      const r = await fetch(`${base}/api/public/agent/poll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: "00000000-0000-0000-0000-000000000000", device_token: "0".repeat(64) }),
      });
      // 400/401 = server alive, just rejecting fake creds — that's success here.
      setLatency(Math.round(performance.now() - t0));
      setStatus(r.status === 401 || r.status === 400 || r.ok ? "ok" : "err");
    } catch {
      setStatus("err");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,oklch(0.6_0.18_280/0.15),transparent_55%),radial-gradient(circle_at_85%_90%,oklch(0.78_0.16_155/0.12),transparent_55%)]" />

      <div className="relative mx-auto max-w-3xl px-6 py-16">
        <div className="mb-10 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Connect a device</h1>
            <p className="text-sm text-muted-foreground">
              One executable. Zero configuration. Auto-registers on first run.
            </p>
          </div>
        </div>

        <section className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-xl">
          <div className="flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Windows agent</div>
              <div className="text-lg font-medium">sentinel-agent.exe</div>
              <div className="text-xs text-muted-foreground">Silent. Background. ~3 MB.</div>
            </div>
            <a
              href="/downloads/agent.exe"
              download="sentinel-agent.exe"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              <Download className="h-4 w-4" /> Download .exe
            </a>
          </div>

          <div className="mt-6 rounded-lg border border-border/60 bg-background/60 p-4 text-sm">
            <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Server URL</div>
            <code className="font-mono text-sm text-primary">{SERVER_URL}</code>
            <p className="mt-2 text-xs text-muted-foreground">
              The .exe is pre-baked with this URL — no manual entry needed. Run it and
              the device shows up in your dashboard within seconds.
            </p>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={test}
              className="inline-flex items-center gap-2 rounded-md border border-border/60 px-3 py-1.5 text-sm transition hover:bg-accent"
            >
              <Cpu className="h-4 w-4" /> Test server
            </button>
            {status === "ok" && (
              <span className="text-xs text-emerald-400">● online · {latency}ms</span>
            )}
            {status === "err" && (
              <span className="text-xs text-destructive">● unreachable</span>
            )}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-border/60 bg-card/40 p-6 backdrop-blur-xl">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Terminal className="h-4 w-4" /> How it works
          </div>
          <ol className="ml-5 list-decimal space-y-2 text-sm text-muted-foreground">
            <li>Download <code>sentinel-agent.exe</code>.</li>
            <li>Double-click to run. It registers itself and stores a token next to the exe.</li>
            <li>It heartbeats every 5 seconds and polls commands every 1 second.</li>
            <li>Open the dashboard — the new device appears live.</li>
          </ol>
        </section>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          For authorized devices only. All sessions are logged.
        </p>
      </div>
    </div>
  );
}
