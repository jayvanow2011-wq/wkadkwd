import { useEffect, useRef, useState } from "react";
import { Music, Volume2, VolumeX, Play, Pause, Search, SkipForward, SkipBack, Loader2, X } from "lucide-react";

type Track = {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  stream: string;
  durationSec: number;
};

const APP_NAME = "zip-prep-pal";
let AUDIUS_HOST: string | null = null;

async function getHost(): Promise<string> {
  if (AUDIUS_HOST) return AUDIUS_HOST;
  try {
    const r = await fetch("https://api.audius.co");
    const j = await r.json();
    AUDIUS_HOST = (j.data && j.data[0]) || "https://discoveryprovider.audius.co";
  } catch {
    AUDIUS_HOST = "https://discoveryprovider.audius.co";
  }
  return AUDIUS_HOST!;
}

function fmt(sec: number) {
  if (!isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function NavMusicWidget() {
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [queue, setQueue] = useState<Track[]>([]);
  const [idx, setIdx] = useState(0);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  const current = queue[idx];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    const a = audioRef.current; if (!a) return;
    const onTime = () => setCur(a.currentTime);
    const onLoaded = () => setDur(a.duration);
    const onEnded = () => {
      if (idx < queue.length - 1) setIdx(idx + 1);
      else setPlaying(false);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("ended", onEnded);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("ended", onEnded);
    };
  }, [idx, queue.length]);

  useEffect(() => {
    const a = audioRef.current; if (!a || !current) return;
    a.src = current.stream;
    a.muted = muted;
    if (playing) a.play().catch(() => setPlaying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const togglePlay = async () => {
    const a = audioRef.current; if (!a || !current) return;
    if (a.paused) { try { await a.play(); setPlaying(true); } catch {} }
    else { a.pause(); setPlaying(false); }
  };

  const toggleMute = () => {
    const a = audioRef.current;
    const m = !muted; setMuted(m);
    if (a) a.muted = m;
  };

  const next = () => { if (idx < queue.length - 1) setIdx(idx + 1); };
  const prev = () => { if (idx > 0) setIdx(idx - 1); };

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setSearching(true);
    try {
      const host = await getHost();
      const r = await fetch(`${host}/v1/tracks/search?query=${encodeURIComponent(q)}&app_name=${APP_NAME}`);
      const j = await r.json();
      const tracks: Track[] = (j.data || []).slice(0, 30).map((x: any) => ({
        id: x.id,
        title: x.title,
        artist: x.user?.name || "Unknown",
        artwork: x.artwork?.["150x150"] || x.artwork?.["480x480"] || "",
        stream: `${host}/v1/tracks/${x.id}/stream?app_name=${APP_NAME}`,
        durationSec: x.duration || 0,
      }));
      setResults(tracks);
    } catch {} finally { setSearching(false); }
  };

  const playNow = (t: Track) => {
    setQueue((qu) => {
      const nq = [...qu.filter((x) => x.id !== t.id), t];
      setIdx(nq.length - 1);
      return nq;
    });
    setPlaying(true);
  };

  const queueAdd = (t: Track) => {
    setQueue((qu) => qu.some((x) => x.id === t.id) ? qu : [...qu, t]);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent transition"
        title="Music player"
      >
        <Music className={`h-3.5 w-3.5 ${playing ? "text-fuchsia-400 animate-pulse" : ""}`} />
        <span className="font-mono tabular-nums">{fmt(cur)}</span>
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); toggleMute(); }}
          className="ml-0.5 -mr-0.5 rounded p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
          title={muted ? "Unmute" : "Mute"}
          aria-label="Mute"
        >
          {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
        </span>
      </button>

      {open && (
        <div
          ref={popRef}
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[380px] rounded-xl border border-border bg-popover p-3 shadow-2xl animate-in fade-in zoom-in-95"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold">Music player</div>
            <button onClick={() => setOpen(false)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 p-2.5">
            {current?.artwork ? (
              <img src={current.artwork} alt="" className="h-12 w-12 rounded-md object-cover" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Music className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{current?.title ?? "Nothing playing"}</div>
              <div className="truncate text-[11px] text-muted-foreground">{current?.artist ?? "Search Audius for full songs"}</div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-border">
                <div className="h-full bg-foreground transition-all" style={{ width: dur ? `${(cur / dur) * 100}%` : "0%" }} />
              </div>
              <div className="mt-0.5 flex justify-between font-mono text-[10px] text-muted-foreground">
                <span>{fmt(cur)}</span><span>{fmt(dur)}</span>
              </div>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-center gap-2">
            <button onClick={prev} disabled={!current || idx === 0}
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30">
              <SkipBack className="h-4 w-4" />
            </button>
            <button onClick={togglePlay} disabled={!current}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background hover:opacity-90 disabled:opacity-30">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button onClick={next} disabled={!current || idx >= queue.length - 1}
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30">
              <SkipForward className="h-4 w-4" />
            </button>
            <button onClick={toggleMute}
              className="ml-2 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>

          <form onSubmit={search} className="mt-3 flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search songs (Audius)…"
                className="w-full rounded-md border border-border bg-secondary/30 pl-7 pr-2 py-1.5 text-[12px] focus:outline-none focus:border-foreground/30"
              />
            </div>
            <button type="submit" disabled={searching}
              className="rounded-md bg-foreground px-3 py-1.5 text-[11px] font-medium text-background hover:opacity-90 disabled:opacity-50">
              {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Go"}
            </button>
          </form>

          <div className="mt-2 max-h-[280px] overflow-y-auto rounded-md border border-border">
            {results.length === 0 ? (
              <div className="p-4 text-center text-[11px] text-muted-foreground">
                {queue.length > 0 ? `${queue.length} in queue` : "No results yet"}
              </div>
            ) : (
              results.map((t) => (
                <div key={t.id} className="flex items-center gap-2 border-b border-border p-2 last:border-b-0 hover:bg-accent/40">
                  {t.artwork ? (
                    <img src={t.artwork} alt="" className="h-8 w-8 rounded object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-muted"><Music className="h-3 w-3" /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium">{t.title}</div>
                    <div className="truncate text-[10px] text-muted-foreground">{t.artist} · {fmt(t.durationSec)}</div>
                  </div>
                  <button onClick={() => playNow(t)} title="Play now"
                    className="rounded-md p-1.5 text-foreground hover:bg-accent">
                    <Play className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => queueAdd(t)} title="Add to queue"
                    className="rounded-md px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground">
                    +Q
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="mt-2 text-center text-[9px] text-muted-foreground">Full tracks via Audius — free, no rate limits</div>
        </div>
      )}

      <audio ref={audioRef} />
    </div>
  );
}
