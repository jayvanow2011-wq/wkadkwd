// Shared WebRTC diagnostics store. ScreenPanel pushes snapshots; the
// /status page and the header indicator subscribe.

export type IceServerStat = {
  url: string;
  reachable: boolean | null; // null = pending
  latencyMs: number | null;
  error?: string;
};

export type DiagLogEntry = {
  ts: number;
  level: "info" | "warn" | "error";
  msg: string;
};

export type WebRtcDiagnostics = {
  active: boolean;
  deviceId: string | null;
  sessionId: string | null;
  transport: "idle" | "connecting" | "webrtc" | "jpeg";
  iceGatheringState: RTCIceGathererState | "unknown";
  iceConnectionState: RTCIceConnectionState | "unknown";
  connectionState: RTCPeerConnectionState | "unknown";
  signalingState: RTCSignalingState | "unknown";
  localCandidates: number;
  remoteCandidates: number;
  selectedCandidatePair: {
    local?: string;
    remote?: string;
    type?: string;
  } | null;
  lastError: string | null;
  startedAt: number | null;
  connectedAt: number | null;
  iceServerChecks: IceServerStat[];
  log: DiagLogEntry[];
};

const initial: WebRtcDiagnostics = {
  active: false,
  deviceId: null,
  sessionId: null,
  transport: "idle",
  iceGatheringState: "unknown",
  iceConnectionState: "unknown",
  connectionState: "unknown",
  signalingState: "unknown",
  localCandidates: 0,
  remoteCandidates: 0,
  selectedCandidatePair: null,
  lastError: null,
  startedAt: null,
  connectedAt: null,
  iceServerChecks: [],
  log: [],
};

let state: WebRtcDiagnostics = { ...initial };
const listeners = new Set<(s: WebRtcDiagnostics) => void>();

function emit() {
  for (const l of listeners) l(state);
}

export const webrtcDiagnostics = {
  get(): WebRtcDiagnostics {
    return state;
  },
  subscribe(fn: (s: WebRtcDiagnostics) => void) {
    listeners.add(fn);
    fn(state);
    return () => listeners.delete(fn);
  },
  patch(partial: Partial<WebRtcDiagnostics>) {
    state = { ...state, ...partial };
    emit();
  },
  log(level: DiagLogEntry["level"], msg: string) {
    const entry: DiagLogEntry = { ts: Date.now(), level, msg };
    state = { ...state, log: [...state.log.slice(-99), entry] };
    if (level === "error") state = { ...state, lastError: msg };
    emit();
  },
  reset() {
    state = { ...initial };
    emit();
  },
};

// Lightweight reachability probe — opens an ephemeral RTCPeerConnection
// against a single ICE server and waits to see if any candidate is gathered
// through it. Returns latency in ms or an error.
export async function probeIceServer(
  server: RTCIceServer,
  timeoutMs = 4000,
): Promise<{ ok: boolean; latencyMs: number | null; error?: string }> {
  if (typeof RTCPeerConnection === "undefined") {
    return { ok: false, latencyMs: null, error: "RTCPeerConnection unavailable" };
  }
  const pc = new RTCPeerConnection({ iceServers: [server] });
  const start = performance.now();
  return await new Promise((resolve) => {
    let done = false;
    const finish = (r: { ok: boolean; latencyMs: number | null; error?: string }) => {
      if (done) return;
      done = true;
      try {
        pc.close();
      } catch {}
      resolve(r);
    };
    const timer = setTimeout(() => finish({ ok: false, latencyMs: null, error: "timeout" }), timeoutMs);
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      const c = e.candidate.candidate || "";
      const urls = Array.isArray(server.urls) ? server.urls.join(",") : server.urls;
      const isStun = urls.includes("stun:") && c.includes("typ srflx");
      const isTurn = (urls.includes("turn:") || urls.includes("turns:")) && c.includes("typ relay");
      if (isStun || isTurn) {
        clearTimeout(timer);
        finish({ ok: true, latencyMs: Math.round(performance.now() - start) });
      }
    };
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === "complete" && !done) {
        clearTimeout(timer);
        finish({ ok: false, latencyMs: null, error: "no usable candidate" });
      }
    };
    pc.createDataChannel("probe");
    pc.createOffer()
      .then((o) => pc.setLocalDescription(o))
      .catch((err) => {
        clearTimeout(timer);
        finish({ ok: false, latencyMs: null, error: String(err?.message ?? err) });
      });
  });
}