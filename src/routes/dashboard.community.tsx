import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { searchUsers, sendFriendRequest, listFriends } from "@/lib/friends.functions";
import {
  Send, Image as ImageIcon, Hash, X, Crown, Trophy, Medal, Users, Search,
  UserPlus, Trash2, Pencil, ShieldAlert, Megaphone, Scroll, Star, Check,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/community")({
  component: CommunityPage,
  head: () => ({
    meta: [
      { title: "Community — Veltrix" },
      { name: "description", content: "Discord-style community: rules, announcements, reviews and leaderboard." },
      { property: "og:title", content: "Veltrix Community" },
      { property: "og:description", content: "Rules, announcements, reviews and the operator leaderboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type ChannelKey = "rules" | "announcements" | "reviews" | "leaderboard";

const CHANNELS: {
  key: ChannelKey; name: string; icon: typeof Hash; desc: string;
}[] = [
  { key: "rules",         name: "rules",         icon: Scroll,      desc: "Read before posting." },
  { key: "announcements", name: "announcements", icon: Megaphone,   desc: "Official updates." },
  { key: "reviews",       name: "reviews",       icon: Star,        desc: "One review per member." },
  { key: "leaderboard",   name: "leaderboard",   icon: Crown,       desc: "Top operators." },
];

type Post = {
  id: string;
  author_id: string;
  channel: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
  author_name?: string;
  author_avatar?: string;
};

function CommunityPage() {
  const { user } = useAuth();
  const [channel, setChannel] = useState<ChannelKey>("announcements");
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasSub, setHasSub] = useState(false);
  const [memberCount, setMemberCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
    supabase
      .from("subscriptions")
      .select("id,status")
      .eq("user_id", user.id)
      .in("status", ["active","trialing","completed","confirmed"])
      .limit(1)
      .then(({ data }) => setHasSub(!!(data && data.length)));
  }, [user]);

  useEffect(() => {
    supabase.from("profiles").select("id", { count: "exact", head: true })
      .then(({ count }) => setMemberCount(count ?? 0));
  }, []);

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 grid grid-cols-[220px_1fr] h-[calc(100vh-7rem)] overflow-hidden border-t border-border/40">
      {/* Server rail / channel list */}
      <aside className="flex flex-col border-r border-border/60 bg-card/40">
        <div className="border-b border-border/40 p-4">
          <div className="text-sm font-bold tracking-tight">Veltrix</div>
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Users className="h-3 w-3" /> {memberCount} members
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Channels
          </div>
          {CHANNELS.map((c) => {
            const Icon = c.icon;
            const active = channel === c.key;
            return (
              <button key={c.key} onClick={() => setChannel(c.key)}
                className={`mt-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ${
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}>
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{c.name}</span>
              </button>
            );
          })}
        </div>
        <div className="border-t border-border/40 p-3 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            realtime
          </div>
        </div>
      </aside>

      {/* Channel content */}
      <section className="flex min-w-0 flex-col bg-background">
        <header className="flex items-center gap-3 border-b border-border/60 bg-card/30 px-5 py-3">
          {(() => { const C = CHANNELS.find(c=>c.key===channel)!; const I = C.icon; return (
            <><I className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-sm font-semibold">#{C.name}</div>
              <div className="text-[11px] text-muted-foreground">{C.desc}</div>
            </div></>
          ); })()}
        </header>

        <div className="flex-1 overflow-hidden">
          {channel === "leaderboard"
            ? <LeaderboardPanel />
            : <FeedPanel
                channel={channel}
                userId={user?.id}
                isAdmin={isAdmin}
                hasSub={hasSub}
              />}
        </div>
      </section>
    </div>
  );
}

/* ─── Feed ─── */
function FeedPanel({ channel, userId, isAdmin, hasSub }:{
  channel: Exclude<ChannelKey,"leaderboard">; userId?: string; isAdmin: boolean; hasSub: boolean;
}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [editing, setEditing] = useState<Post | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const canPost =
    channel === "reviews" ? !!userId && hasSub
    : /* rules | announcements */ !!userId && isAdmin;

  const myReview = useMemo(
    () => (channel === "reviews" && userId) ? posts.find(p => p.author_id === userId) ?? null : null,
    [posts, userId, channel],
  );

  const load = async () => {
    const { data } = await supabase
      .from("community_posts").select("*")
      .eq("channel", channel)
      .order("created_at", { ascending: channel !== "announcements" ? true : false })
      .limit(200);
    if (!data) return;
    const authorIds = [...new Set(data.map((p) => p.author_id))];
    const { data: profiles } = authorIds.length
      ? await supabase.from("profiles").select("id,username,avatar_url").in("id", authorIds)
      : { data: [] };
    const pm = new Map((profiles ?? []).map((p) => [p.id, p]));
    setPosts(data.map((p) => ({
      ...p,
      author_name: pm.get(p.author_id)?.username ?? "anon",
      author_avatar: pm.get(p.author_id)?.avatar_url ?? undefined,
    })));
  };

  useEffect(() => { load(); setEditing(null); setBody(""); setImageFile(null); }, [channel]);

  useEffect(() => {
    const ch = supabase
      .channel(`community-${channel}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "community_posts", filter: `channel=eq.${channel}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [channel]);

  useEffect(() => {
    if (!imageFile) { setImagePreview(null); return; }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // Auto-scroll chat-ish channels
  useEffect(() => {
    if (channel === "announcements") return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [posts, channel]);

  const send = async () => {
    if (!userId) return;
    if (!body.trim() && !imageFile) return;
    setSending(true);
    try {
      let imageUrl: string | null = null;
      if (imageFile) {
        const path = `${userId}/${Date.now()}-${imageFile.name}`;
        const { error } = await supabase.storage.from("chat").upload(path, imageFile);
        if (error) throw error;
        imageUrl = supabase.storage.from("chat").getPublicUrl(path).data.publicUrl;
      }

      if (editing) {
        const { error } = await supabase.from("community_posts")
          .update({ body: body.trim() || null, image_url: imageUrl ?? editing.image_url })
          .eq("id", editing.id);
        if (error) throw error;
        setEditing(null);
      } else {
        const { error } = await supabase.from("community_posts").insert({
          author_id: userId, channel,
          body: body.trim() || null,
          image_url: imageUrl,
        });
        if (error) throw error;
      }
      setBody(""); setImageFile(null);
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally { setSending(false); }
  };

  const del = async (p: Post) => {
    if (!confirm("Delete this post?")) return;
    const { error } = await supabase.from("community_posts").delete().eq("id", p.id);
    if (error) toast.error(error.message);
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {posts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <Hash className="h-7 w-7 opacity-40" />
            <p className="mt-3 text-sm">No messages in #{channel} yet.</p>
          </div>
        )}
        {posts.map((p) => {
          const mine = p.author_id === userId;
          const canDelete = mine || isAdmin;
          const canEdit = mine && channel === "reviews";
          return (
            <article key={p.id} className="group flex gap-3 rounded-lg px-2 py-2 transition hover:bg-accent/30">
              {p.author_avatar
                ? <img src={p.author_avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-muted-foreground">
                    {(p.author_name ?? "?")[0].toUpperCase()}
                  </div>}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{p.author_name}</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(p.created_at).toLocaleString()}</span>
                </div>
                {p.body && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">{p.body}</p>}
                {p.image_url && <img src={p.image_url} alt="" className="mt-2 max-h-80 rounded-lg border border-border" />}
              </div>
              <div className="flex shrink-0 items-start gap-1 opacity-0 transition group-hover:opacity-100">
                {canEdit && (
                  <button onClick={() => { setEditing(p); setBody(p.body ?? ""); }}
                    className="rounded p-1 text-muted-foreground hover:text-foreground" title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {canDelete && (
                  <button onClick={() => del(p)}
                    className="rounded p-1 text-muted-foreground hover:text-destructive" title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Composer */}
      <div className="border-t border-border/60 bg-card/30 p-3">
        {!canPost ? (
          <div className="flex items-center justify-center gap-2 rounded-md border border-border/50 bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5" />
            {channel === "reviews"
              ? "Only members with an active plan can post a review."
              : "Only admins can post here."}
          </div>
        ) : channel === "reviews" && myReview && !editing ? (
          <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Check className="h-3.5 w-3.5" /> You already posted a review (one per member).
            </span>
            <button onClick={() => { setEditing(myReview); setBody(myReview.body ?? ""); }}
              className="rounded-md bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground">
              Edit it
            </button>
          </div>
        ) : (
          <>
            {imagePreview && (
              <div className="relative mb-2 inline-block">
                <img src={imagePreview} className="h-20 w-20 rounded-md object-cover border border-border" alt="" />
                <button onClick={() => setImageFile(null)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            {editing && (
              <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Editing your review</span>
                <button onClick={() => { setEditing(null); setBody(""); }} className="hover:text-foreground">cancel</button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <label className="cursor-pointer rounded-md border border-border bg-secondary p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
                <ImageIcon className="h-4 w-4" />
              </label>
              <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 2000))}
                rows={1}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={`Message #${channel}`}
                className="max-h-32 flex-1 resize-none rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary" />
              <button onClick={send} disabled={sending || (!body.trim() && !imageFile)}
                className="rounded-md bg-primary p-2 text-primary-foreground hover:opacity-90 disabled:opacity-40">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Leaderboard ─── */
type LbEntry = { id: string; username: string | null; avatar_url: string | null; count: number };

function LeaderboardPanel() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LbEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const _search = useServerFn(searchUsers);
  const _listFriends = useServerFn(listFriends);

  const loadFriends = async () => {
    try {
      const r = await _listFriends();
      setFriendIds(new Set((r.friends as any[]).map((f) => f.other_id)));
    } catch {}
  };

  const loadBoard = async () => {
    const { data: devices } = await supabase.from("devices").select("owner_user_id");
    const counts = new Map<string, number>();
    (devices ?? []).forEach((d) => {
      if (d.owner_user_id) counts.set(d.owner_user_id, (counts.get(d.owner_user_id) ?? 0) + 1);
    });
    if (counts.size === 0) { setEntries([]); setLoading(false); return; }
    const { data: profiles } = await supabase
      .from("profiles").select("id,username,avatar_url").in("id", [...counts.keys()]);
    const result: LbEntry[] = (profiles ?? []).map((p) => ({
      id: p.id, username: p.username, avatar_url: p.avatar_url, count: counts.get(p.id) ?? 0,
    })).sort((a, b) => b.count - a.count);
    setEntries(result);
    setLoading(false);
  };

  useEffect(() => {
    loadBoard(); loadFriends();
    const ch = supabase.channel("leaderboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, () => loadBoard())
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => loadFriends())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const runSearch = async () => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try { const r = await _search({ data: { query: q.trim() } }); setSearchResults(r.users); }
    catch (e: any) { toast.error(e.message); }
    finally { setSearching(false); }
  };

  const addFriend = async (id: string) => {
    try { await sendFriendRequest({ data: { user_id: id } }); toast.success("Friend request sent"); loadFriends(); }
    catch (e: any) { toast.error(e.message); }
  };

  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  const medals = [
    { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-400", icon: Trophy, label: "1st" },
    { bg: "bg-gray-400/10",   border: "border-gray-400/30",   text: "text-gray-300",   icon: Medal,   label: "2nd" },
    { bg: "bg-amber-700/10",  border: "border-amber-700/30",  text: "text-amber-600",  icon: Medal,   label: "3rd" },
  ];

  return (
    <div className="h-full overflow-y-auto px-5 py-5 space-y-5">
      {/* User search / add friend */}
      <div className="rounded-xl border border-border bg-card/60 p-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
              placeholder="Search users by username, name, email…"
              className="w-full rounded-md border border-border bg-input pl-8 pr-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
          <button onClick={runSearch} disabled={searching}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
            Search
          </button>
        </div>
        {searchResults.length > 0 && (
          <div className="mt-3 space-y-1">
            {searchResults.map((u) => {
              const already = friendIds.has(u.id);
              const isMe = u.id === user?.id;
              return (
                <div key={u.id} className="flex items-center gap-3 rounded-md border border-border/60 bg-background/40 p-2">
                  {u.avatar_url
                    ? <img src={u.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                    : <div className="h-8 w-8 rounded-full bg-muted" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{u.username ?? u.full_name ?? "user"}</div>
                    {u.full_name && u.username && (
                      <div className="truncate text-[11px] text-muted-foreground">{u.full_name}</div>
                    )}
                  </div>
                  {isMe ? (
                    <span className="text-[11px] text-muted-foreground">you</span>
                  ) : already ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400"><Check className="h-3 w-3" /> friends</span>
                  ) : (
                    <button onClick={() => addFriend(u.id)}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground">
                      <UserPlus className="h-3 w-3" /> Add
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Loading leaderboard…</div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <Trophy className="h-7 w-7 opacity-40" />
          <p className="mt-3 text-sm">No operators ranked yet.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {podium.map((e, i) => {
              const m = medals[i]; const Icon = m.icon;
              const isMe = e.id === user?.id;
              const already = friendIds.has(e.id);
              return (
                <div key={e.id} className={`relative overflow-hidden rounded-2xl border ${m.border} ${m.bg} p-5 text-center`}>
                  <div className={`absolute right-3 top-3 text-[11px] font-bold uppercase tracking-wider ${m.text}`}>{m.label}</div>
                  <Icon className={`mx-auto h-6 w-6 ${m.text}`} />
                  {e.avatar_url
                    ? <img src={e.avatar_url} alt="" className="mx-auto mt-3 h-14 w-14 rounded-full object-cover ring-2 ring-border" />
                    : <div className="mx-auto mt-3 flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
                        {(e.username ?? "?")[0].toUpperCase()}
                      </div>}
                  <div className="mt-2 truncate text-sm font-semibold">{e.username ?? "anonymous"}</div>
                  <div className="mt-1 text-2xl font-bold text-primary">{e.count}</div>
                  <div className="text-[11px] text-muted-foreground">clients</div>
                  {!isMe && !already && (
                    <button onClick={() => addFriend(e.id)}
                      className="mt-3 inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-3 py-1 text-[11px] font-medium hover:bg-accent">
                      <UserPlus className="h-3 w-3" /> Add friend
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {rest.length > 0 && (
            <div className="rounded-2xl border border-border bg-card/60 backdrop-blur">
              {rest.map((e, i) => {
                const isMe = e.id === user?.id;
                const already = friendIds.has(e.id);
                return (
                  <div key={e.id}
                    className={`flex items-center gap-4 px-5 py-3 ${i < rest.length - 1 ? "border-b border-border/50" : ""}`}>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-bold text-muted-foreground">{i + 4}</div>
                    {e.avatar_url
                      ? <img src={e.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-border" />
                      : <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs">{(e.username ?? "?")[0].toUpperCase()}</div>}
                    <div className="min-w-0 flex-1 truncate text-sm font-semibold">{e.username ?? "anonymous"}</div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-bold text-primary">{e.count}</span>
                      <span className="text-[11px] text-muted-foreground">clients</span>
                    </div>
                    {!isMe && !already && (
                      <button onClick={() => addFriend(e.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2.5 py-1 text-[11px] font-medium hover:bg-accent">
                        <UserPlus className="h-3 w-3" /> Add
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
