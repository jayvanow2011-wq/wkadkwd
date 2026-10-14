import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  listConversations,
  listMessages,
  sendMessage,
  markConversationRead,
} from "@/lib/dm.functions";
import {
  listFriends,
  searchUsers,
  sendFriendRequest,
  respondFriendRequest,
  removeFriend,
} from "@/lib/friends.functions";
import { listFriendDevices, requestClient, respondShare } from "@/lib/share.functions";
import {
  MessageCircle, Send, Image as ImageIcon, Search, UserPlus,
  Check, X, Monitor, Loader2, Trash2,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/chat")({
  component: ChatPage,
});

type Convo = {
  other_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  last_message: string | null;
  last_at: string | null;
  unread: number;
};

type Friend = {
  friendship_id: string;
  status: string;
  other_id: string;
  incoming: boolean;
  outgoing: boolean;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

type Msg = {
  id: string;
  sender_id: string;
  recipient_id: string;
  kind: string;
  body: string | null;
  image_url: string | null;
  payload: any;
  created_at: string;
};

function ChatPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"chats" | "friends">("chats");
  const [convos, setConvos] = useState<Convo[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showReq, setShowReq] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSent = useRef(0);

  const _listConvos = useServerFn(listConversations);
  const _listMsgs = useServerFn(listMessages);
  const _send = useServerFn(sendMessage);
  const _markRead = useServerFn(markConversationRead);
  const _listFriends = useServerFn(listFriends);

  const reloadConvos = async () => {
    try { const r = await _listConvos(); setConvos(r.conversations as any); } catch {}
  };
  const reloadFriends = async () => {
    try { const r = await _listFriends(); setFriends(r.friends as any); } catch {}
  };
  const reloadMessages = async (id: string) => {
    try {
      const r = await _listMsgs({ data: { other_id: id, limit: 200 } });
      setMsgs(r.messages as any);
    } catch (e: any) { toast.error(e.message); }
  };

  useEffect(() => { reloadConvos(); reloadFriends(); }, []);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("chat-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, (p) => {
        const m: any = p.new;
        if (m.sender_id === user.id || m.recipient_id === user.id) {
          reloadConvos();
          if (activeId && (m.sender_id === activeId || m.recipient_id === activeId)) {
            setMsgs((prev) => [...prev, m]);
          }
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "friendships" }, () => reloadFriends())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "friendships" }, () => reloadFriends())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, activeId]);

  useEffect(() => {
    if (!activeId) return;
    reloadMessages(activeId);
    _markRead({ data: { other_id: activeId } }).catch(() => {});
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  useEffect(() => {
    if (!imageFile) { setImagePreview(null); return; }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const doSend = async () => {
    if (!user || !activeId) return;
    const now = Date.now();
    if (now - lastSent.current < 2000) { toast.error("Slow down"); return; }
    if (!body.trim() && !imageFile) return;
    setSending(true);
    try {
      let imageUrl: string | null = null;
      if (imageFile) {
        const path = `${user.id}/${Date.now()}-${imageFile.name}`;
        const { error } = await supabase.storage.from("chat").upload(path, imageFile);
        if (error) throw error;
        imageUrl = supabase.storage.from("chat").getPublicUrl(path).data.publicUrl;
        await _send({ data: { to: activeId, kind: "image", image_url: imageUrl, body: body.trim() || null } });
      } else {
        await _send({ data: { to: activeId, kind: "text", body: body.trim() } });
      }
      setBody(""); setImageFile(null); lastSent.current = Date.now();
    } catch (e: any) { toast.error(e.message); } finally { setSending(false); }
  };

  const accepted = friends.filter((f) => f.status === "accepted");
  const incoming = friends.filter((f) => f.incoming);
  const active = accepted.find((f) => f.other_id === activeId) ?? convos.find((c) => c.other_id === activeId);

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 grid grid-cols-[320px_1fr] h-[calc(100vh-7rem)] overflow-hidden border-t border-border/40">
      {/* LEFT */}
      <aside className="flex flex-col border-r border-border/60 bg-card/30">
        <div className="flex gap-1 border-b border-border/40 p-2">
          <button onClick={() => setTab("chats")} className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${tab === "chats" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent"}`}>Chats</button>
          <button onClick={() => setTab("friends")} className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${tab === "friends" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent"}`}>Friends {incoming.length > 0 && <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{incoming.length}</span>}</button>
          <button onClick={() => setShowAdd(true)} className="rounded-md border border-border bg-secondary p-1.5 text-muted-foreground hover:text-foreground" title="Add friend"><UserPlus className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {tab === "chats" && (
            <>
              {convos.length === 0 && <div className="p-6 text-center text-xs text-muted-foreground">No chats yet. Add a friend to start.</div>}
              {convos.map((c) => (
                <button key={c.other_id} onClick={() => setActiveId(c.other_id)}
                  className={`flex w-full items-center gap-2 border-b border-border/30 px-3 py-2.5 text-left transition hover:bg-accent/50 ${activeId === c.other_id ? "bg-accent/60" : ""}`}>
                  {c.avatar_url ? <img src={c.avatar_url} className="h-9 w-9 rounded-full object-cover" alt="" /> : <div className="h-9 w-9 rounded-full bg-muted" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{c.username ?? c.full_name ?? "user"}</span>
                      {c.last_at && <span className="shrink-0 text-[10px] text-muted-foreground">{new Date(c.last_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">{c.last_message ?? "—"}</span>
                      {c.unread > 0 && <span className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{c.unread}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}
          {tab === "friends" && (
            <>
              {incoming.length > 0 && (
                <div className="border-b border-border/40">
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Incoming</div>
                  {incoming.map((f) => (
                    <div key={f.friendship_id} className="flex items-center gap-2 px-3 py-2">
                      {f.avatar_url ? <img src={f.avatar_url} className="h-8 w-8 rounded-full object-cover" alt="" /> : <div className="h-8 w-8 rounded-full bg-muted" />}
                      <div className="flex-1 truncate text-sm">{f.username ?? "user"}</div>
                      <button onClick={async () => { await respondFriendRequest({ data: { requester_id: f.other_id, accept: true } }); reloadFriends(); reloadConvos(); }} className="rounded-md bg-primary p-1 text-primary-foreground hover:opacity-90"><Check className="h-3.5 w-3.5" /></button>
                      <button onClick={async () => { await respondFriendRequest({ data: { requester_id: f.other_id, accept: false } }); reloadFriends(); }} className="rounded-md border border-border p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
              {accepted.length === 0 && incoming.length === 0 && (
                <div className="p-6 text-center text-xs text-muted-foreground">No friends yet — add one!</div>
              )}
              {accepted.map((f) => (
                <div key={f.friendship_id} className="group flex items-center gap-2 border-b border-border/30 px-3 py-2 hover:bg-accent/40">
                  <button onClick={() => { setTab("chats"); setActiveId(f.other_id); }} className="flex flex-1 items-center gap-2 text-left">
                    {f.avatar_url ? <img src={f.avatar_url} className="h-8 w-8 rounded-full object-cover" alt="" /> : <div className="h-8 w-8 rounded-full bg-muted" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{f.username ?? "user"}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{f.full_name ?? ""}</div>
                    </div>
                  </button>
                  <button onClick={async () => { if (confirm("Remove friend?")) { await removeFriend({ data: { friend_id: f.other_id } }); reloadFriends(); reloadConvos(); }}} className="rounded p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </>
          )}
        </div>
      </aside>

      {/* RIGHT */}
      <section className="flex flex-col bg-background">
        {!activeId ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center text-muted-foreground">
            <MessageCircle className="h-10 w-10" />
            <p className="mt-3 text-sm">Pick a conversation</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 bg-card/30">
              <div className="flex items-center gap-2">
                {(active as any)?.avatar_url ? <img src={(active as any).avatar_url} className="h-8 w-8 rounded-full object-cover" alt="" /> : <div className="h-8 w-8 rounded-full bg-muted" />}
                <div>
                  <div className="text-sm font-semibold">{(active as any)?.username ?? "user"}</div>
                  <div className="text-[10px] text-muted-foreground">Direct message</div>
                </div>
              </div>
              <button onClick={() => setShowReq(true)} className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-accent">
                <Monitor className="h-3.5 w-3.5" /> Request client
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {msgs.length === 0 && <div className="py-10 text-center text-xs text-muted-foreground">No messages — say hi 👋</div>}
              {msgs.map((m) => {
                const mine = m.sender_id === user?.id;
                if (m.kind === "system") {
                  return <div key={m.id} className="text-center text-[11px] text-muted-foreground"><span className="rounded-full bg-muted px-3 py-1">{m.body}</span><div className="mt-0.5">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div></div>;
                }
                if (m.kind === "share_client" || m.kind === "request_client") {
                  return <ShareBubble key={m.id} m={m} mine={mine} onRefresh={() => reloadMessages(activeId!)} />;
                }
                return (
                  <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${mine ? "bg-primary text-primary-foreground" : "bg-card border border-border"}`}>
                      {m.image_url && <img src={m.image_url} alt="" className="mb-1.5 max-h-72 rounded-lg" />}
                      {m.body && <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>}
                    </div>
                    <div className="mt-0.5 px-1 text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                );
              })}
            </div>

            {imagePreview && (
              <div className="flex items-center gap-2 border-t border-border/40 bg-card/30 px-4 py-2">
                <img src={imagePreview} alt="" className="h-16 w-16 rounded-md object-cover" />
                <div className="flex-1 truncate text-xs text-muted-foreground">{imageFile?.name}</div>
                <button onClick={() => setImageFile(null)} className="rounded-md p-1 text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
              </div>
            )}

            <div className="flex items-end gap-2 border-t border-border/60 bg-card/30 p-3">
              <label className="cursor-pointer rounded-md border border-border bg-secondary p-2 hover:bg-accent">
                <input type="file" accept="image/*" className="hidden" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
                <ImageIcon className="h-4 w-4" />
              </label>
              <textarea
                value={body} onChange={(e) => setBody(e.target.value.slice(0, 2000))}
                rows={1}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); } }}
                placeholder="Type a message…"
                className="max-h-32 flex-1 resize-none rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button onClick={doSend} disabled={sending || (!body.trim() && !imageFile)} className="rounded-md bg-primary p-2 text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </>
        )}
      </section>

      {showAdd && <AddFriendDialog onClose={() => { setShowAdd(false); reloadFriends(); }} />}
      {showReq && activeId && <RequestClientDialog hostId={activeId} onClose={() => setShowReq(false)} />}
    </div>
  );
}

function ShareBubble({ m, mine, onRefresh }: { m: Msg; mine: boolean; onRefresh: () => void }) {
  const { user } = useAuth();
  const p = m.payload ?? {};
  const isShare = m.kind === "share_client";
  const [status, setStatus] = useState<"pending" | "accepted" | "declined">("pending");
  const [busy, setBusy] = useState(false);

  // The party that responds: share->recipient (shared_with), request->host (recipient of DM = host)
  const canRespond = user?.id === m.recipient_id && status === "pending";

  useEffect(() => {
    supabase.from("client_shares").select("status").eq("id", p.share_id).maybeSingle().then(({ data }) => {
      if (data) setStatus(data.status as any);
    });
  }, [p.share_id]);

  const respond = async (accept: boolean) => {
    setBusy(true);
    try {
      await respondShare({ data: { share_id: p.share_id, accept } });
      setStatus(accept ? "accepted" : "declined");
      onRefresh();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <div className="max-w-[75%] rounded-2xl border border-primary/30 bg-primary/5 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary"><Monitor className="h-3.5 w-3.5" /> {isShare ? "Client share" : "Access request"}</div>
        <div className="mt-1 text-sm">{p.device_name ?? "Device"}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">Status: {status}</div>
        {canRespond && (
          <div className="mt-2 flex gap-2">
            <button disabled={busy} onClick={() => respond(true)} className="flex-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">Accept</button>
            <button disabled={busy} onClick={() => respond(false)} className="flex-1 rounded-md border border-border bg-secondary px-3 py-1 text-xs hover:bg-accent disabled:opacity-50">Decline</button>
          </div>
        )}
      </div>
      <div className="mt-0.5 px-1 text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
    </div>
  );
}

function AddFriendDialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const doSearch = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try { const r = await searchUsers({ data: { query: q.trim() } }); setResults(r.users); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Add friend</h2><button onClick={onClose}><X className="h-4 w-4" /></button></div>
        <div className="mt-3 flex gap-2">
          <div className="relative flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }} placeholder="Username or name" className="w-full rounded-md border border-border bg-input pl-8 pr-3 py-2 text-sm outline-none focus:border-primary" /></div>
          <button onClick={doSearch} disabled={busy} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Search</button>
        </div>
        <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
          {results.map((u) => (
            <div key={u.id} className="flex items-center gap-2 rounded-md border border-border p-2">
              {u.avatar_url ? <img src={u.avatar_url} alt="" className="h-8 w-8 rounded-full" /> : <div className="h-8 w-8 rounded-full bg-muted" />}
              <div className="min-w-0 flex-1 truncate text-sm">{u.username ?? u.full_name}</div>
              <button onClick={async () => { try { await sendFriendRequest({ data: { user_id: u.id } }); toast.success("Request sent"); } catch (e: any) { toast.error(e.message); }}} className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">Add</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RequestClientDialog({ hostId, onClose }: { hostId: string; onClose: () => void }) {
  const [devs, setDevs] = useState<any[] | null>(null);
  const _list = useServerFn(listFriendDevices);
  useEffect(() => { _list({ data: { friend_id: hostId } }).then((r) => setDevs(r.devices)).catch((e) => { toast.error(e.message); setDevs([]); }); }, [hostId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Request access</h2><button onClick={onClose}><X className="h-4 w-4" /></button></div>
        <p className="mt-1 text-xs text-muted-foreground">Pick a client to request from this friend.</p>
        <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
          {devs === null && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />}
          {devs?.length === 0 && <div className="py-6 text-center text-xs text-muted-foreground">No clients available.</div>}
          {devs?.map((d) => (
            <div key={d.id} className="flex items-center gap-2 rounded-md border border-border p-2">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{d.pc_name}</div><div className="truncate text-[11px] text-muted-foreground">{d.device_name}</div></div>
              <button onClick={async () => { try { await requestClient({ data: { device_id: d.id, host_id: hostId } }); toast.success("Request sent"); onClose(); } catch (e: any) { toast.error(e.message); }}} className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">Request</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
