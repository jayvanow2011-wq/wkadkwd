import { useRef, useState } from "react";
import { useDeviceCommands } from "@/hooks/use-device-commands";
import { Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Entry = { cmd: string; out: string; err: string; exit: number | null; pending: boolean };

export function ShellPanel({ deviceId }: { deviceId: string }) {
  const { send } = useDeviceCommands(deviceId);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cmd, setCmd] = useState("");
  const [running, setRunning] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const run = async () => {
    const c = cmd.trim();
    if (!c) return;
    setCmd("");
    setRunning(true);
    const entry: Entry = { cmd: c, out: "", err: "", exit: null, pending: true };
    setEntries((prev) => [...prev, entry]);
    setTimeout(() => scrollerRef.current?.scrollTo({ top: 999999 }), 50);
    try {
      const res = await send("shell.exec", { cmd: c, timeout_ms: 25000 }, 30000);
      setEntries((prev) =>
        prev.map((e, i) =>
          i === prev.length - 1
            ? {
                ...e,
                pending: false,
                out: res.result?.stdout ?? "",
                err: res.result?.stderr ?? res.error ?? "",
                exit: res.result?.exit_code ?? (res.status === "error" ? -1 : 0),
              }
            : e,
        ),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      setEntries((prev) =>
        prev.map((e2, i) =>
          i === prev.length - 1 ? { ...e2, pending: false, err: msg, exit: -1 } : e2,
        ),
      );
      toast.error(msg);
    } finally {
      setRunning(false);
      setTimeout(() => scrollerRef.current?.scrollTo({ top: 999999 }), 50);
    }
  };

  return (
    <div className="flex h-[70vh] flex-col overflow-hidden rounded-xl border border-border/60 bg-black/60 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-border/40 bg-card/40 px-4 py-2 text-xs text-muted-foreground">
        <span className="font-mono">remote shell · {deviceId.slice(0, 8)}</span>
        <button
          onClick={() => setEntries([])}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-accent hover:text-foreground"
        >
          <Trash2 className="h-3 w-3" /> Clear
        </button>
      </div>

      <div ref={scrollerRef} className="flex-1 overflow-auto p-4 font-mono text-xs text-emerald-300">
        {entries.length === 0 && (
          <div className="text-muted-foreground">
            Type a command and press Enter. Example: <code className="text-foreground">whoami</code>,{" "}
            <code className="text-foreground">ipconfig</code>,{" "}
            <code className="text-foreground">dir C:\</code>.
          </div>
        )}
        {entries.map((e, i) => (
          <div key={i} className="mb-3">
            <div className="text-sky-400">
              <span className="text-muted-foreground">$</span> {e.cmd}
            </div>
            {e.pending && <div className="text-muted-foreground">running…</div>}
            {e.out && <pre className="whitespace-pre-wrap text-emerald-200">{e.out}</pre>}
            {e.err && <pre className="whitespace-pre-wrap text-red-400">{e.err}</pre>}
            {e.exit !== null && !e.pending && (
              <div className="text-[10px] text-muted-foreground">exit {e.exit}</div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-border/40 bg-card/40 p-2">
        <span className="pl-2 font-mono text-sky-400">$</span>
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !running && run()}
          placeholder="enter a command…"
          className="flex-1 bg-transparent font-mono text-xs text-emerald-200 outline-none placeholder:text-muted-foreground/60"
        />
        <button
          onClick={run}
          disabled={running || !cmd.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          <Send className="h-3 w-3" /> Run
        </button>
      </div>
    </div>
  );
}
