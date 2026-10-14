import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { respondFriendRequest } from "@/lib/friends.functions";
import { respondShare } from "@/lib/share.functions";
import { checkRelayHealth } from "@/lib/relay-health.functions";
import { Bell, Check, X, UserPlus, Monitor, MessageCircle, Server, Hammer } from "lucide-react";

export const Route = createFileRoute("/dashboard/notifications")({
  component: NotificationsPage,
});

function StatusDot({ online }: { online: boolean | null }) {
  const color = online === null ? "bg-muted-foreground/40" : online ? "bg-emerald-500" : "bg-red-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${color} ${online ? "animate-pulse" : ""}`} />;
}

function ServiceStatusBar() {
  const [relay, setRelay] = useState<boolean | null>(null);
  const [build, setBuild] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await checkRelayHealth();
        if (!cancelled) setRelay(r.ok);
      } catch { if (!cancelled) setRelay(false); }
      try {
        const res = await fetch("/api/public/buildserver/status", { cache: "no-store" });
        const j = await res.json();
        if (!cancelled) setBuild(!!j.online);
      } catch { if (!cancelled) setBuild(false); }
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div className="absolute right-0 top-0 flex items-center gap-3 text-[10px] text-muted-foreground">
      <div className="flex items-center gap-1.5 rounded-md border border-border bg-card/60 px-2 py-1">
        <Server className="h-3 w-3" />
        <span>Relay</span>
        <StatusDot online={relay} />
      </div>
      <div className="flex items-center gap-1.5 rounded-md border border-border bg-card/60 px-2 py-1">
        <Hammer className="h-3 w-3" />
        <span>Build</span>
        <StatusDot online={build} />
      </div>
    </div>
  );
}

type Notif = {
  id: string;
  title: string;
  body: string | null;
  kind: string;
  payload: any;
  read_at: string | null;
  created_at: string;
};

function NotificationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .order("created_at", { ascending: false })
      .limit(100);
    setItems((data ?? []) as Notif[]);
  };

  useEffect(() => { load(); }, [user]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("notifs-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
  };

  const handleFriend = async (n: Notif, accept: boolean) => {
    setBusy(n.id);
    try {
      await respondFriendRequest({ data: { requester_id: n.payload.requester_id, accept } });
      await markRead(n.id);
      toast.success(accept ? "Accepted" : "Declined");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const handleShare = async (n: Notif, accept: boolean) => {
    setBusy(n.id);
    try {
      await respondShare({ data: { share_id: n.payload.share_id, accept } });
      await markRead(n.id);
      toast.success(accept ? "Accepted" : "Declined");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const iconFor = (k: string) => {
    if (k === "friend_request") return UserPlus;
    if (k === "client_share" || k === "client_request") return Monitor;
    return Bell;
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="relative flex items-center gap-2">
        <Bell className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <ServiceStatusBar />
      </div>

      {/* Persistent join banner */}
      <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <MessageCircle className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium">Community</p>
        </div>
        <div className="flex gap-2">
          <a href="https://discord.gg/YVqhKtceSX" target="_blank" rel="noreferrer" className="rounded-md bg-[#5865F2] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">Discord</a>
          <a href="https://t.me/veltrixlol" target="_blank" rel="noreferrer" className="rounded-md bg-[#0088cc] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">Telegram</a>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const Icon = iconFor(n.kind);
            const actionable =
              (n.kind === "friend_request" && n.payload?.requester_id) ||
              ((n.kind === "client_share" || n.kind === "client_request") && n.payload?.share_id);
            return (
              <div key={n.id} className={`flex items-start gap-3 rounded-lg border p-4 transition ${n.read_at ? "border-border bg-card/50 opacity-70" : "border-primary/30 bg-card"}`}>
                <div className="rounded-md bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{n.title}</div>
                  {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                  <div className="mt-1 text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</div>
                  {actionable && !n.read_at && (
                    <div className="mt-2 flex gap-2">
                      <button
                        disabled={busy === n.id}
                        onClick={() => n.kind === "friend_request" ? handleFriend(n, true) : handleShare(n, true)}
                        className="flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      ><Check className="h-3 w-3" /> Accept</button>
                      <button
                        disabled={busy === n.id}
                        onClick={() => n.kind === "friend_request" ? handleFriend(n, false) : handleShare(n, false)}
                        className="flex items-center gap-1 rounded-md border border-border bg-secondary px-3 py-1 text-xs hover:bg-accent disabled:opacity-50"
                      ><X className="h-3 w-3" /> Decline</button>
                    </div>
                  )}
                </div>
                {!n.read_at && !actionable && (
                  <button onClick={() => markRead(n.id)} className="rounded-md p-1 text-primary transition hover:bg-primary/10">
                    <Check className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
