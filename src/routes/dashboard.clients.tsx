import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { scanDeviceOnline } from "@/lib/relay";
import { listFriends } from "@/lib/friends.functions";
import { shareClientsBulk, revokeAccessBulk } from "@/lib/share.functions";

import {
  Monitor, Smartphone, Download, Search, ExternalLink, Trash2, Radar, Loader2,
  Share2, UserMinus, X,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/dashboard/clients")({
  component: ClientsPage,
});

type Device = {
  id: string;
  pc_name: string;
  device_name: string;
  ip_address: string | null;
  os: string | null;
  username: string | null;
  tag: string | null;
  platform: string;
  is_online: boolean;
  last_seen: string;
  enrollment_code: string | null;
  owner_user_id?: string | null;
};

const ONLINE_TIMEOUT_MS = 10_000;

type PlatformFilter = "all" | "pc" | "mobile";

function ClientsPage() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [toDelete, setToDelete] = useState<Device | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [, setTick] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [liveOnline, setLiveOnline] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState<null | "share" | "revoke">(null);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    const load = async () => {
      const ownedQ = supabase
        .from("devices")
        .select("id,pc_name,device_name,ip_address,os,username,tag,platform,is_online,last_seen,enrollment_code,created_at,owner_user_id")
        .eq("owner_user_id", user.id)
        .order("created_at", { ascending: false });
      const sharedIdsQ = supabase
        .from("device_access").select("device_id").eq("user_id", user.id);
      const [{ data: owned, error }, { data: sharedRows }] = await Promise.all([ownedQ, sharedIdsQ]);
      let shared: Device[] = [];
      const sharedIds = (sharedRows ?? []).map((r: any) => r.device_id);
      if (sharedIds.length) {
        const { data } = await supabase
          .from("devices")
          .select("id,pc_name,device_name,ip_address,os,username,tag,platform,is_online,last_seen,enrollment_code,created_at,owner_user_id")
          .in("id", sharedIds);
        shared = (data as unknown as Device[]) ?? [];
      }
      const map = new Map<string, Device>();
      for (const d of [...(owned ?? []), ...shared] as unknown as Device[]) map.set(d.id, d);
      if (mounted) {
        if (error) toast.error(error.message);
        setDevices(Array.from(map.values()));
        setLoading(false);
      }
    };
    load();
    const channel = supabase
      .channel("devices-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "device_access" }, load)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, [user]);

  const filtered = useMemo(() => {
    let list = devices;
    if (platformFilter === "pc") list = list.filter((d) => (d.platform || "windows") === "windows");
    if (platformFilter === "mobile") list = list.filter((d) => d.platform === "android");
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (d) =>
        d.pc_name.toLowerCase().includes(q) ||
        d.device_name.toLowerCase().includes(q) ||
        (d.ip_address ?? "").toLowerCase().includes(q) ||
        (d.username ?? "").toLowerCase().includes(q),
    );
  }, [devices, query, platformFilter]);

  // Only owner-devices can be shared/revoked in bulk.
  const selectedOwned = useMemo(
    () => filtered.filter((d) => selected.has(d.id) && d.owner_user_id === user?.id).map((d) => d.id),
    [filtered, selected, user?.id],
  );

  const toggleOne = (id: string) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => {
    const ownAll = filtered.filter((d) => d.owner_user_id === user?.id).map((d) => d.id);
    const all = ownAll.every((id) => selected.has(id));
    setSelected((s) => {
      const n = new Set(s);
      ownAll.forEach((id) => all ? n.delete(id) : n.add(id));
      return n;
    });
  };
  const clearSel = () => setSelected(new Set());

  const runScan = async () => {
    if (scanning || devices.length === 0) return;
    setScanning(true);
    const results: Record<string, boolean> = {};
    await Promise.all(devices.map(async (d) => {
      results[d.id] = await scanDeviceOnline(d.id, 2500);
    }));
    setLiveOnline(results);
    setScanning(false);
    const up = Object.values(results).filter(Boolean).length;
    toast.success(`Scan complete — ${up} / ${devices.length} responded`);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight">clients</h1></div>
        <div className="flex items-center gap-2">
          <button onClick={runScan} disabled={scanning || devices.length === 0}
            className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition hover:bg-accent disabled:opacity-50">
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
            {scanning ? "scanning…" : "scan"}
          </button>
          <a href="/downloads/agent.exe" download="sentinel-agent.exe"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90">
            <Download className="h-4 w-4" /> grab exe
          </a>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        {(["all", "pc", "mobile"] as const).map((f) => (
          <button key={f} onClick={() => setPlatformFilter(f)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              platformFilter === f ? "bg-primary/15 text-primary border border-primary/30"
              : "bg-secondary text-muted-foreground border border-border/60 hover:bg-accent"}`}>
            {f === "pc" && <Monitor className="h-3 w-3" />}
            {f === "mobile" && <Smartphone className="h-3 w-3" />}
            {f === "all" ? "All" : f === "pc" ? "PC" : "Mobile"}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-md border border-border/60 bg-card/60 px-3 py-2 backdrop-blur-xl">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="search name, ip, user…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60" />
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <span className="font-medium">{selected.size} selected</span>
          {selectedOwned.length !== selected.size && (
            <span className="text-muted-foreground">({selectedOwned.length} eligible — you must own the device)</span>
          )}
          <div className="flex-1" />
          <button onClick={() => setBulkMode("share")} disabled={selectedOwned.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 font-medium text-primary-foreground disabled:opacity-40">
            <Share2 className="h-3 w-3" /> Share to friend…
          </button>
          <button onClick={() => setBulkMode("revoke")} disabled={selectedOwned.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1 font-medium disabled:opacity-40">
            <UserMinus className="h-3 w-3" /> Remove friend access…
          </button>
          <button onClick={clearSel} className="rounded p-1 hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-border/60 bg-card/60 backdrop-blur-xl">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-3">
                <input type="checkbox"
                  onChange={toggleAll}
                  checked={
                    filtered.filter(d=>d.owner_user_id===user?.id).length > 0 &&
                    filtered.filter(d=>d.owner_user_id===user?.id).every(d=>selected.has(d.id))
                  }
                />
              </th>
              <th className="px-5 py-3 font-medium">device</th>
              <th className="px-5 py-3 font-medium">tag</th>
              <th className="px-5 py-3 font-medium">user</th>
              <th className="px-5 py-3 font-medium">os</th>
              <th className="px-5 py-3 font-medium">ip</th>
              <th className="px-5 py-3 font-medium">status</th>
              <th className="px-5 py-3 font-medium">last seen</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="px-5 py-8 text-center text-muted-foreground">loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={9} className="px-5 py-8 text-center text-muted-foreground">—</td></tr>}
            {filtered.map((d) => {
              const own = d.owner_user_id === user?.id;
              return (
                <tr key={d.id} className="border-t border-border/40 transition hover:bg-muted/20">
                  <td className="px-3 py-3">
                    <input type="checkbox" disabled={!own} checked={selected.has(d.id)} onChange={() => toggleOne(d.id)} />
                  </td>
                  <td className="px-5 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      {d.platform === "android"
                        ? <Smartphone className="h-4 w-4 text-muted-foreground" />
                        : <Monitor className="h-4 w-4 text-muted-foreground" />}
                      {d.pc_name}
                      {!own && <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-normal uppercase text-muted-foreground">shared</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {d.tag
                      ? <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{d.tag}</span>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{d.username ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{d.os ?? "—"}</td>
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{d.ip_address ?? "—"}</td>
                  <td className="px-5 py-3"><StatusBadge online={liveOnline[d.id] ?? d.is_online} live={d.id in liveOnline} /></td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{new Date(d.last_seen).toLocaleString()}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button onClick={() => window.open(`/control/${d.id}`, "_blank", "noopener")}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition hover:bg-accent">
                        <ExternalLink className="h-3 w-3" /> open
                      </button>
                      {own && (
                        <button onClick={() => setToDelete(d)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/20">
                          <Trash2 className="h-3 w-3" /> yeet
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>yeet this client?</AlertDialogTitle>
            <AlertDialogDescription>
              gonna nuke <span className="font-medium text-foreground">{toDelete?.pc_name}</span> from your list. agent stops responding. no take-backs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>nah</AlertDialogCancel>
            <AlertDialogAction disabled={deleting}
              onClick={async (e) => {
                e.preventDefault();
                if (!toDelete) return;
                setDeleting(true);
                const { error } = await supabase.from("devices").delete().eq("id", toDelete.id);
                setDeleting(false);
                if (error) { toast.error(error.message); return; }
                toast.success("gone");
                setDevices((prev) => prev.filter((x) => x.id !== toDelete.id));
                setToDelete(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "removing…" : "yeet"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {bulkMode && (
        <BulkFriendDialog
          mode={bulkMode}
          deviceIds={selectedOwned}
          onClose={() => setBulkMode(null)}
          onDone={() => { setBulkMode(null); clearSel(); }}
        />
      )}
    </div>
  );
}

function StatusBadge({ online, live }: { online: boolean; live?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${
      online ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${
        online ? "bg-emerald-400 shadow-[0_0_8px_oklch(0.7_0.18_155)] animate-pulse" : "bg-muted-foreground"}`} />
      {online ? (live ? "live" : "online") : "offline"}
    </span>
  );
}

function BulkFriendDialog({
  mode, deviceIds, onClose, onDone,
}: {
  mode: "share" | "revoke"; deviceIds: string[]; onClose: () => void; onDone: () => void;
}) {
  const _list = useServerFn(listFriends);
  const _share = useServerFn(shareClientsBulk);
  const _revoke = useServerFn(revokeAccessBulk);
  const [friends, setFriends] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    _list().then((r: any) => setFriends((r.friends as any[]).filter(f => f.status === "accepted")))
      .catch(() => setFriends([]));
  }, []);

  const run = async (friendId: string) => {
    setBusy(friendId);
    try {
      if (mode === "share") {
        const r = await _share({ data: { device_ids: deviceIds, to_user_id: friendId } });
        toast.success(`Shared ${r.ok} / ${deviceIds.length} clients${r.failed ? ` (${r.failed} failed)` : ""}`);
      } else {
        const r = await _revoke({ data: { device_ids: deviceIds, user_id: friendId } });
        toast.success(`Revoked access on ${r.ok} clients`);
      }
      onDone();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const list = friends.filter(f => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return (f.username ?? "").toLowerCase().includes(q) || (f.full_name ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {mode === "share" ? "Share clients with…" : "Remove friend access from clients"}
          </h2>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {deviceIds.length} client{deviceIds.length === 1 ? "" : "s"} selected.
          {mode === "share" ? " Pick a friend to send access to." : " Pick a friend to revoke."}
        </p>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)}
            placeholder="Search friends…"
            className="w-full rounded-md border border-border bg-input pl-8 pr-3 py-2 text-sm outline-none focus:border-primary" />
        </div>
        <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
          {friends.length === 0 && (
            <div className="py-6 text-center text-xs text-muted-foreground">
              You have no friends yet — add some in Community or Chat.
            </div>
          )}
          {list.map((f) => (
            <div key={f.other_id} className="flex items-center gap-2 rounded-md border border-border p-2">
              {f.avatar_url
                ? <img src={f.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                : <div className="h-8 w-8 rounded-full bg-muted" />}
              <div className="min-w-0 flex-1 truncate text-sm">{f.username ?? f.full_name ?? "user"}</div>
              <button disabled={busy === f.other_id} onClick={() => run(f.other_id)}
                className={`rounded-md px-3 py-1 text-xs font-medium disabled:opacity-40 ${
                  mode === "share"
                    ? "bg-primary text-primary-foreground"
                    : "border border-destructive/40 bg-destructive/10 text-destructive"
                }`}>
                {busy === f.other_id ? "…" : mode === "share" ? "Share" : "Revoke"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
