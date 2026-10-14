// Server-side health check for the HidenHost relay.
//
// Tries the direct origin first (umad.servemc.net) and falls back to the
// Cloudflare Worker proxy. Returns `{ ok, ms, via }` where `via` names which
// endpoint responded, so the /status page can show "direct" vs "proxy".

import { createServerFn } from "@tanstack/react-start";

const RELAY_URLS = [
  { url: "https://umad.hidenmc.com", via: "direct" as const },
];
const TIMEOUT_MS = 4000;

export type RelayHealth = {
  ok: boolean;
  ms: number | null;
  via?: "direct" | "proxy" | null;
};

async function pingOne(base: string): Promise<{ ok: boolean; ms: number | null }> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/health`, {
      method: "GET",
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    const ms = Date.now() - started;
    if (!res.ok) return { ok: false, ms };
    try { await res.json(); } catch { /* ignore */ }
    return { ok: true, ms };
  } catch {
    return { ok: false, ms: null };
  } finally {
    clearTimeout(timer);
  }
}

export const checkRelayHealth = createServerFn({ method: "GET" }).handler(
  async (): Promise<RelayHealth> => {
    for (const r of RELAY_URLS) {
      const res = await pingOne(r.url);
      if (res.ok) return { ok: true, ms: res.ms, via: r.via };
    }
    return { ok: false, ms: null, via: null };
  },
);
