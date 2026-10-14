// WebSocket relay connection for real-time TCP streaming.
// Primary: wss://umad.servemc.net (Caddy/Nginx → localhost:24578).
// Fallback: Cloudflare Worker proxy (same origin, bypasses network blocks).
// On each reconnect we alternate so a dead primary never pins the whole UI.

let RELAY_WS_URLS: string[] = [
  "wss://umad.hidenmc.com",
];
const RELAY_AUTH_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_HIDEN_AUTH_KEY) || "wallahijayiscool"; // must match HIDEN_AUTH_KEY on the relay

// Pull the live relay list from the site so new relays roll out without a
// deploy. Falls back to the compiled defaults on any failure.
if (typeof window !== "undefined") {
  fetch("/api/public/relays", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const list = (j?.relays ?? [])
        .slice()
        .sort((a: any, b: any) => (a.priority ?? 100) - (b.priority ?? 100))
        .map((r: any) => r.ws)
        .filter((u: unknown): u is string => typeof u === "string" && u.startsWith("wss://"));
      if (list.length) RELAY_WS_URLS = list;
    })
    .catch(() => {});
}


// Stable per-browser id so the relay can keep exactly one socket per client.
// If the same tab reconnects (HMR, network blip), the relay drops the old one.
function getClientId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let id = localStorage.getItem("hh_client_id");
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem("hh_client_id", id);
    }
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export type RelayMessage = {
  type: string;
  payload?: any;
  from?: string;
  viewerId?: string;
  deviceId?: string;
  /** Present when the agent forwarded a raw binary frame (e.g. JPEG bytes). */
  binary?: ArrayBuffer;
  [k: string]: any;
};

type Listener = (msg: RelayMessage) => void;

export class RelaySocket {
  private ws: WebSocket | null = null;
  private deviceId: string;
  private listeners = new Set<Listener>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private alive = true;
  private _connected = false;
  private reconnectAttempts = 0;

  constructor(deviceId: string) {
    this.deviceId = deviceId;
  }

  get connected() {
    return this._connected;
  }

  connect() {
    if (this.ws || this.connectTimer) return;
    this.alive = true;
    this.connectTimer = setTimeout(() => {
      this.connectTimer = null;
      this._tryConnect();
    }, 0);
  }

  private _tryConnect() {
    if (!this.alive) return;
    try {
      const clientId = getClientId();
      // Rotate through endpoints on each attempt so one dead host never pins us.
      const base = RELAY_WS_URLS[this.reconnectAttempts % RELAY_WS_URLS.length];
      const url =
        `${base}/?key=${encodeURIComponent(RELAY_AUTH_KEY)}` +
        `&role=viewer&device=${encodeURIComponent(this.deviceId)}` +
        `&clientId=${encodeURIComponent(clientId)}`;
      this.ws = new WebSocket(url);
      this.ws.binaryType = "arraybuffer";

      this.ws.onopen = () => {
        if (!this.alive) {
          this.ws?.close();
          return;
        }
        this._connected = true;
        this.reconnectAttempts = 0;
        this._emit({ type: "_connected" });
        this._send({ type: "hello", role: "viewer", deviceId: this.deviceId, clientId });
        // Keepalive: send a small ping every 20s. Proxies/CF idle-timeout
        // WebSockets around ~100s, so this keeps the connection warm and
        // detects a half-dead socket much sooner than TCP would.
        this._startPing();
      };

      this.ws.onmessage = (ev) => {
        if (ev.data instanceof ArrayBuffer) {
          this._emit({ type: "frame", from: "agent", binary: ev.data });
          return;
        }
        try {
          const msg: RelayMessage = JSON.parse(ev.data);
          if (msg.type === "pong") return; // swallow keepalive replies
          this._emit(msg);
        } catch { /* ignore non-JSON */ }
      };

      this.ws.onclose = () => {
        const wasConnected = this._connected;
        this._connected = false;
        this.ws = null;
        this._stopPing();
        if (wasConnected) this._emit({ type: "_disconnected" });
        if (this.alive) this._scheduleReconnect();
      };

      this.ws.onerror = () => { /* onclose fires after this */ };
    } catch {
      if (this.alive) this._scheduleReconnect();
    }
  }

  private _scheduleReconnect() {
    // Exponential backoff with jitter, capped at 15s. Prevents a tight
    // reconnect loop when the relay is momentarily unreachable.
    const attempt = Math.min(this.reconnectAttempts++, 6);
    const base = Math.min(1000 * 2 ** attempt, 15000);
    const delay = base / 2 + Math.random() * (base / 2);
    this.reconnectTimer = setTimeout(() => this._tryConnect(), delay);
  }

  private _startPing() {
    this._stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try { this.ws.send(JSON.stringify({ type: "ping", t: Date.now() })); } catch { /* ignore */ }
      }
    }, 20000);
  }

  private _stopPing() {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }


  send(msg: RelayMessage) {
    this._send(msg);
  }

  private _send(msg: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private _emit(msg: RelayMessage) {
    for (const fn of this.listeners) {
      try { fn(msg); } catch { /* swallow */ }
    }
  }

  disconnect() {
    this.alive = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.reconnectTimer = null;
    this.connectTimer = null;
    this._stopPing();
    if (this.ws) {
      this.ws.onclose = null;
      if (this.ws.readyState === WebSocket.OPEN) this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }
}

// Hook for React components
import { useEffect, useRef, useState, useCallback } from "react";

// Shared, ref-counted RelaySocket per deviceId. Every panel that calls
// useRelaySocket(deviceId) for the same device gets the *same* underlying
// WebSocket, so we never trigger the relay's "one socket per clientId" kick
// that made the indicator flap on/off/on/off.
type SharedEntry = {
  socket: RelaySocket;
  refCount: number;
  disposeTimer: ReturnType<typeof setTimeout> | null;
};
const sharedRelays = new Map<string, SharedEntry>();

function acquireRelay(deviceId: string): RelaySocket {
  let entry = sharedRelays.get(deviceId);
  if (!entry) {
    entry = { socket: new RelaySocket(deviceId), refCount: 0, disposeTimer: null };
    sharedRelays.set(deviceId, entry);
    entry.socket.connect();
  }
  if (entry.disposeTimer) {
    clearTimeout(entry.disposeTimer);
    entry.disposeTimer = null;
  }
  entry.refCount += 1;
  return entry.socket;
}

function releaseRelay(deviceId: string) {
  const entry = sharedRelays.get(deviceId);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount <= 0) {
    // Delay teardown briefly so a panel unmount/remount (StrictMode, tab
    // switch, HMR) doesn't cause a real disconnect.
    entry.disposeTimer = setTimeout(() => {
      entry!.socket.disconnect();
      sharedRelays.delete(deviceId);
    }, 5000);
  }
}

export function useRelaySocket(deviceId: string) {
  const relayRef = useRef<RelaySocket | null>(null);
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef(new Set<Listener>());

  useEffect(() => {
    const relay = acquireRelay(deviceId);
    relayRef.current = relay;
    setConnected(relay.connected);

    const off = relay.on((msg) => {
      if (msg.type === "_connected") setConnected(true);
      if (msg.type === "_disconnected") setConnected(false);
      for (const fn of listenersRef.current) {
        try { fn(msg); } catch { /* swallow */ }
      }
    });

    return () => {
      off();
      releaseRelay(deviceId);
      relayRef.current = null;
    };
  }, [deviceId]);

  const send = useCallback((msg: RelayMessage) => {
    relayRef.current?.send(msg);
  }, []);

  const onMessage = useCallback((fn: Listener) => {
    listenersRef.current.add(fn);
    return () => { listenersRef.current.delete(fn); };
  }, []);

  return { connected, send, onMessage };
}

/**
 * One-shot liveness check: opens (or reuses) the shared relay socket for
 * `deviceId`, sends a `ping` cmd, and resolves `true` if the agent replies
 * within `timeoutMs`. Does NOT tear the socket down — subsequent panel opens
 * for the same device reuse it.
 */
export function scanDeviceOnline(deviceId: string, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const relay = acquireRelay(deviceId);
    const id =
      (globalThis as any).crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      off();
      clearTimeout(timer);
      // Release on next tick so a re-scan burst reuses the same socket.
      setTimeout(() => releaseRelay(deviceId), 100);
      resolve(v);
    };
    const off = relay.on((msg) => {
      if (msg.type === "result" && msg.payload?.id === id) finish(!!msg.payload?.ok);
    });
    const timer = setTimeout(() => finish(false), timeoutMs);
    // Fire the ping. If the socket isn't open yet, .send is a no-op — the
    // timeout will still resolve false, which is the honest answer.
    relay.send({ type: "cmd", payload: { id, action: "ping" } });
  });
}
