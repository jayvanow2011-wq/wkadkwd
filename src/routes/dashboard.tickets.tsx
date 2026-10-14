import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  listTickets, createTicket, claimTicket, closeTicket,
  sendTicketMessage, listTicketMessages,
} from "@/lib/tickets.functions";
import {
  Ticket, Send, Plus, Check, X, Loader2,
  Image as ImageIcon, MessageCircle, ShieldCheck, Lock,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/tickets")({
  component: TicketsPage,
  head: () => ({
    meta: [
      { title: "Support Tickets — VeltrixRAT" },
      { name: "description", content: "Get help from our support team." },
      { property: "og:title", content: "Support — VeltrixRAT" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type TicketRow = {
  id: string;
  user_id: string;
  subject: string;
  status: string;
  claimed_by: string | null;
  created_at: string;
  closed_at: string | null;
};

type Msg = {
  id: string;
  ticket_id: string;
  sender_id: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
};

function TicketsPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [isStaff, setIsStaff] = useState(false);
  const [activeTicket, setActiveTicket] = useState<TicketRow | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, { username: string | null; avatar_url: string | null }>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const _list = useServerFn(listTickets);
  const _create = useServerFn(createTicket);
  const _claim = useServerFn(claimTicket);
  const _close = useServerFn(closeTicket);
  const _sendMsg = useServerFn(sendTicketMessage);
  const _listMsgs = useServerFn(listTicketMessages);

  const loadTickets = async () => {
    try {
      const r = await _list();
      setTickets(r.tickets as any);
      setIsStaff(r.isStaff);
    } catch {}
    setLoading(false);
  };

  const loadMessages = async (ticketId: string) => {
    try {
      const r = await _listMsgs({ data: { ticket_id: ticketId } });
      setMsgs(r.messages as any);
      // Load profiles for senders
      const ids = [...new Set((r.messages as any[]).map((m: any) => m.sender_id))];
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id,username,avatar_url").in("id", ids);
        const map: Record<string, any> = {};
        (profs ?? []).forEach((p: any) => map[p.id] = p);
        setProfiles((prev) => ({ ...prev, ...map }));
      }
    } catch {}
  };

  useEffect(() => { loadTickets(); }, []);

  useEffect(() => {
    if (!activeTicket) return;
    loadMessages(activeTicket.id);
    const ch = supabase
      .channel(`ticket-${activeTicket.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${activeTicket.id}` }, () => loadMessages(activeTicket.id))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeTicket?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  // Realtime ticket updates
  useEffect(() => {
    const ch = supabase
      .channel("tickets-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => loadTickets())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const handleCreate = async () => {
    if (!newSubject.trim()) { toast.error("Subject required"); return; }
    setCreating(true);
    try {
      const r = await _create({ data: { subject: newSubject.trim(), body: newBody } });
      toast.success("Ticket created");
      setShowCreate(false);
      setNewSubject("");
      setNewBody("");
      loadTickets();
      setActiveTicket(r.ticket as any);
    } catch (e: any) { toast.error(e.message); }
    setCreating(false);
  };

  const handleSend = async () => {
    if (!activeTicket || (!body.trim() && !imageFile)) return;
    setSending(true);
    try {
      let imageUrl: string | null = null;
      if (imageFile && user) {
        const path = `${user.id}/${Date.now()}-${imageFile.name}`;
        const { error } = await supabase.storage.from("chat").upload(path, imageFile);
        if (error) throw error;
        imageUrl = supabase.storage.from("chat").getPublicUrl(path).data.publicUrl;
      }
      await _sendMsg({ data: { ticket_id: activeTicket.id, body: body.trim() || undefined, image_url: imageUrl || undefined } });
      setBody("");
      setImageFile(null);
    } catch (e: any) { toast.error(e.message); }
    setSending(false);
  };

  const handleClaim = async (id: string) => {
    try { await _claim({ data: { ticket_id: id } }); toast.success("Ticket claimed"); loadTickets(); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleClose = async (id: string) => {
    try { await _close({ data: { ticket_id: id } }); toast.success("Ticket closed"); loadTickets(); if (activeTicket?.id === id) setActiveTicket(null); }
    catch (e: any) { toast.error(e.message); }
  };

  const hasOpenTicket = tickets.some((t) => t.status === "open" && t.user_id === user?.id);

  if (loading) return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading tickets…</div>;

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 grid grid-cols-[300px_1fr] h-[calc(100vh-7rem)] overflow-hidden border-t border-border/40">
      {/* Ticket list */}
      <aside className="flex flex-col border-r border-border/60 bg-card/30">
        <div className="flex items-center justify-between border-b border-border/40 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Ticket className="h-4 w-4" /> Tickets
          </div>
          {!isStaff && !hasOpenTicket && (
            <button onClick={() => setShowCreate(true)} className="rounded-md bg-primary p-1.5 text-primary-foreground hover:opacity-90">
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {tickets.length === 0 && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              {isStaff ? "No tickets yet." : "No tickets. Create one to get help!"}
            </div>
          )}
          {tickets.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTicket(t)}
              className={`flex w-full flex-col gap-0.5 border-b border-border/30 px-3 py-2.5 text-left transition hover:bg-accent/50 ${activeTicket?.id === t.id ? "bg-accent/60" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{t.subject}</span>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${t.status === "open" ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                  {t.status}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleString()}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Ticket detail */}
      <section className="flex flex-col bg-background">
        {!activeTicket ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center text-muted-foreground">
            <MessageCircle className="h-10 w-10" />
            <p className="mt-3 text-sm">Select a ticket or create one</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 bg-card/30">
              <div>
                <div className="text-sm font-semibold">{activeTicket.subject}</div>
                <div className="text-[10px] text-muted-foreground">
                  {activeTicket.status === "open" ? "Open" : "Closed"}
                  {activeTicket.claimed_by && ` · Claimed`}
                </div>
              </div>
              <div className="flex gap-2">
                {isStaff && activeTicket.status === "open" && !activeTicket.claimed_by && (
                  <button onClick={() => handleClaim(activeTicket.id)} className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                    <ShieldCheck className="mr-1 inline h-3 w-3" /> Claim
                  </button>
                )}
                {(isStaff || activeTicket.user_id === user?.id) && activeTicket.status === "open" && (
                  <button onClick={() => handleClose(activeTicket.id)} className="rounded-md border border-border bg-secondary px-3 py-1 text-xs font-medium hover:bg-accent">
                    <Lock className="mr-1 inline h-3 w-3" /> Close
                  </button>
                )}
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {msgs.length === 0 && <div className="py-10 text-center text-xs text-muted-foreground">No messages yet.</div>}
              {msgs.map((m) => {
                const mine = m.sender_id === user?.id;
                const prof = profiles[m.sender_id];
                return (
                  <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                    <div className="mb-0.5 text-[10px] text-muted-foreground">{prof?.username ?? "user"}</div>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${mine ? "bg-primary text-primary-foreground" : "bg-card border border-border"}`}>
                      {m.image_url && <img src={m.image_url} alt="" className="mb-1.5 max-h-72 rounded-lg" />}
                      {m.body && <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>}
                    </div>
                    <div className="mt-0.5 px-1 text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                );
              })}
            </div>

            {activeTicket.status === "open" && (
              <div className="flex items-end gap-2 border-t border-border/60 bg-card/30 p-3">
                <label className="cursor-pointer rounded-md border border-border bg-secondary p-2 hover:bg-accent">
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
                  <ImageIcon className="h-4 w-4" />
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value.slice(0, 2000))}
                  rows={1}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Type a message…"
                  className="max-h-32 flex-1 resize-none rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <button onClick={handleSend} disabled={sending || (!body.trim() && !imageFile)} className="rounded-md bg-primary p-2 text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Create ticket dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Create Ticket</h2>
              <button onClick={() => setShowCreate(false)}><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Describe your issue and our team will help you.</p>
            <div className="mt-4 space-y-3">
              <input
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value.slice(0, 100))}
                placeholder="Subject"
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value.slice(0, 2000))}
                rows={4}
                placeholder="Describe your issue…"
                className="w-full resize-none rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <div className="flex gap-2">
                <button onClick={() => setShowCreate(false)} className="flex-1 rounded-md border border-border bg-secondary px-4 py-2 text-sm hover:bg-accent">Cancel</button>
                <button onClick={handleCreate} disabled={creating} className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                  {creating ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Submit"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
