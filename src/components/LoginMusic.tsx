import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Play, Pause, SkipForward } from "lucide-react";
import europeAsset from "@/assets/europe-hardtekk.mp3.asset.json";
import freaksAsset from "@/assets/freaks-hardtekk.mp3.asset.json";

const PLAYLIST = [
  { title: "Europe HardTekk", url: europeAsset.url },
  { title: "Freaks — The Dark Triad", url: freaksAsset.url },
];

function fmt(s: number) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${r}`;
}

export function LoginMusic() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [idx, setIdx] = useState(0);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  const ensureAnalyser = () => {
    if (analyserRef.current || !audioRef.current) return;
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      const src = ctx.createMediaElementSource(audioRef.current);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      src.connect(analyser);
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;
      ctxRef.current = ctx;
    } catch {}
  };

  const draw = () => {
    const c = canvasRef.current;
    const a = analyserRef.current;
    if (!c) { rafRef.current = requestAnimationFrame(draw); return; }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = c.width, h = c.height;
    ctx.clearRect(0, 0, w, h);

    if (a) {
      const data = new Uint8Array(a.frequencyBinCount);
      a.getByteFrequencyData(data);
      // emphasise bass: use low ~40% of spectrum
      const slice = Math.floor(data.length * 0.45);
      const bars = 40;
      const step = Math.max(1, Math.floor(slice / bars));
      const bw = w / bars;
      let bassSum = 0;
      for (let i = 0; i < bars; i++) {
        let v = 0;
        for (let j = 0; j < step; j++) v += data[i * step + j] || 0;
        v = v / step / 255;
        // boost bass region
        const boost = i < bars * 0.35 ? 1.35 : 1;
        v = Math.min(1, v * boost);
        if (i < bars * 0.35) bassSum += v;
        const bh = Math.max(2, v * h);
        const grad = ctx.createLinearGradient(0, h - bh, 0, h);
        grad.addColorStop(0, "rgba(244,114,182,0.95)"); // pink
        grad.addColorStop(0.5, "rgba(167,139,250,0.9)"); // violet
        grad.addColorStop(1, "rgba(56,189,248,0.25)"); // cyan fade
        ctx.fillStyle = grad;
        ctx.fillRect(i * bw + 1, h - bh, bw - 2, bh);
      }
      // bass pulse ring
      const bass = bassSum / (bars * 0.35);
      ctx.strokeStyle = `rgba(244,114,182,${0.15 + bass * 0.4})`;
      ctx.lineWidth = 1 + bass * 3;
      ctx.strokeRect(1, 1, w - 2, h - 2);
    }
    rafRef.current = requestAnimationFrame(draw);
  };

  // wire audio events
  useEffect(() => {
    const a = audioRef.current; if (!a) return;
    const onTime = () => setCur(a.currentTime);
    const onLoaded = () => setDur(a.duration);
    const onEnded = () => setIdx((i) => (i + 1) % PLAYLIST.length);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("ended", onEnded);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("ended", onEnded);
    };
  }, []);

  // load track + autoplay muted
  useEffect(() => {
    const a = audioRef.current; if (!a) return;
    a.src = PLAYLIST[idx].url;
    a.muted = muted;
    a.volume = 0.8;
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  // visualizer loop
  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ctxRef.current?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMute = async () => {
    const a = audioRef.current; if (!a) return;
    ensureAnalyser();
    if (ctxRef.current?.state === "suspended") await ctxRef.current.resume();
    a.muted = !a.muted;
    setMuted(a.muted);
    if (!a.muted && a.paused) { try { await a.play(); setPlaying(true); } catch {} }
  };

  const togglePlay = async () => {
    const a = audioRef.current; if (!a) return;
    ensureAnalyser();
    if (ctxRef.current?.state === "suspended") await ctxRef.current.resume();
    if (a.paused) { try { await a.play(); setPlaying(true); } catch {} }
    else { a.pause(); setPlaying(false); }
  };

  const skip = () => setIdx((i) => (i + 1) % PLAYLIST.length);

  const track = PLAYLIST[idx];

  return (
    <div className="pointer-events-none fixed right-6 top-6 z-30 hidden sm:block">
      <div className="pointer-events-auto w-[300px] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-black/70 via-black/60 to-fuchsia-950/40 p-4 backdrop-blur-2xl shadow-[0_30px_80px_-20px_rgba(244,114,182,0.35)]">
        <div className="mb-2 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.22em] text-fuchsia-300/70">Now playing</div>
            <div className="truncate text-[13px] font-semibold text-white">{track.title}</div>
          </div>
          <div className={`h-2 w-2 rounded-full ${playing && !muted ? "bg-fuchsia-400 shadow-[0_0_10px_rgba(244,114,182,0.9)] animate-pulse" : "bg-white/25"}`} />
        </div>

        <canvas ref={canvasRef} width={268} height={72} className="block w-full rounded-lg bg-black/40" />

        <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-white/50">
          <span>{fmt(cur)}</span>
          <span>{fmt(dur)}</span>
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-gradient-to-r from-fuchsia-400 to-violet-400 transition-all"
            style={{ width: dur ? `${(cur / dur) * 100}%` : "0%" }} />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button onClick={togglePlay} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-white text-black text-xs font-semibold hover:bg-white/90 transition">
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? "Pause" : "Play"}
          </button>
          <button onClick={skip} title="Next"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/80 hover:bg-white/[0.08] transition">
            <SkipForward className="h-4 w-4" />
          </button>
          <button onClick={toggleMute} title={muted ? "Unmute" : "Mute"}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/80 hover:bg-white/[0.08] transition">
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
        {muted && (
          <div className="mt-2 text-center text-[10px] text-fuchsia-300/70">Tap unmute for bass 🔊</div>
        )}
      </div>
      <audio ref={audioRef} preload="auto" />
    </div>
  );
}
