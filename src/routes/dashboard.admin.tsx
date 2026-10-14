import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  ShieldCheck, Users as UsersIcon, Monitor, FileText, Megaphone,
  CreditCard, Trash2, Loader2, Plus, Minus, Ban, UserX, Undo2, Radio, Globe,
} from "lucide-react";
import { adminAdjustDays, adminBanUser, adminUnbanUser, adminRemoveUser } from "@/lib/admin.functions";

export const Route = createFileRoute("/dashboard/admin")({
  component: AdminPanel,
});

type Tab = "users" | "devices" | "audit" | "subs" | "news" | "payments" | "endpoints";

type UserRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  email: string | null;
  created_at: string;
  roles: string[];
  is_banned: boolean;
  ban_reason: string | null;
  is_removed: boolean;
};

function AdminPanel() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("users");

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/" }); return; }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user, loading, navigate]);

  if (loading || isAdmin === null) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking permissions…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-destructive/40 bg-destructive/5 p-8 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-destructive" />
        <h1 className="mt-3 text-lg font-semibold">Admin only</h1>
        <p className="mt-1 text-sm text-muted-foreground">You don't have access to this panel.</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "users", label: "Users & Roles", icon: UsersIcon },
    { id: "devices", label: "Devices", icon: Monitor },
    { id: "audit", label: "Audit Logs", icon: FileText },
    { id: "subs", label: "Subscriptions", icon: CreditCard },
    { id: "payments", label: "Payments", icon: CreditCard },
    { id: "news", label: "Post News", icon: Megaphone },
    { id: "endpoints", label: "Endpoints", icon: Globe },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/20">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Admin Panel</h1>
          <p className="text-xs text-muted-foreground">Full control over the platform.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-border/60 bg-card/40 p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "users" && <UsersTab />}
      {tab === "devices" && <DevicesTab />}
      {tab === "audit" && <AuditTab />}
      {tab === "subs" && <SubsTab />}
      {tab === "payments" && <PaymentsTab />}
      {tab === "news" && <NewsTab />}
      {tab === "endpoints" && <EndpointsTab />}
    </div>
  );
}

/* ─── Payments ─── */
function PaymentsTab() {
  const [enabled, setEnabled] = useState(true);
  const [mode, setMode] = useState<"live" | "sandbox">("live");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "payments")
      .maybeSingle()
      .then(({ data }) => {
        const v = (data?.value ?? {}) as { enabled?: boolean; mode?: "live" | "sandbox" };
        setEnabled(v.enabled !== false);
        setMode(v.mode === "sandbox" ? "sandbox" : "live");
        setLoading(false);
      });
  }, []);

  const save = async (next: { enabled: boolean; mode: "live" | "sandbox" }) => {
    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "payments", value: next, updated_at: new Date().toISOString() } as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Payment settings saved");
  };

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-card p-6">
      <div>
        <h2 className="text-lg font-semibold">Payments (NowPayments)</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Enable or disable checkout, and switch between live crypto payments and the NowPayments sandbox for testing.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-background/40 p-4">
        <div>
          <div className="text-sm font-medium">Payments enabled</div>
          <div className="text-xs text-muted-foreground">When off, users see a disabled state on the subscriptions page.</div>
        </div>
        <button
          disabled={saving}
          onClick={() => {
            const next = !enabled;
            setEnabled(next);
            save({ enabled: next, mode });
          }}
          className={`relative h-6 w-11 rounded-full transition ${enabled ? "bg-primary" : "bg-muted"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition ${enabled ? "left-5" : "left-0.5"}`} />
        </button>
      </div>

      <div className="rounded-lg border border-border bg-background/40 p-4">
        <div className="text-sm font-medium">Mode</div>
        <div className="mt-1 text-xs text-muted-foreground">
          Live charges real crypto. Test uses NowPayments sandbox — no real money moves.
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(["live", "sandbox"] as const).map((m) => (
            <button
              key={m}
              disabled={saving}
              onClick={() => {
                setMode(m);
                save({ enabled, mode: m });
              }}
              className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                mode === m
                  ? "border-foreground/60 bg-foreground/10"
                  : "border-border hover:border-foreground/30"
              }`}
            >
              {m === "live" ? "🟢 Live" : "🧪 Test (sandbox)"}
            </button>
          ))}
        </div>
        {mode === "sandbox" && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Sandbox uses <code className="font-mono">NOWPAYMENTS_API_KEY_SANDBOX</code> if set, otherwise falls back to the live key.
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Users ─── */
function UsersTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banReason, setBanReason] = useState("");
  const [banTarget, setBanTarget] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, full_name, email, created_at, is_banned, ban_reason, is_removed")
      .order("created_at", { ascending: false });
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const rolesByUser = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    });
    setUsers(
      (profiles ?? []).map((p: any) => ({
        ...p,
        roles: rolesByUser.get(p.id) ?? [],
      }))
    );
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Realtime updates
  useEffect(() => {
    const ch = supabase.channel("admin-users-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const toggleRole = async (userId: string, role: "admin" | "operator" | "viewer", has: boolean) => {
    if (has) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
      if (error) return toast.error(error.message);
      toast.success(`Removed ${role}`);
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) return toast.error(error.message);
      toast.success(`Granted ${role}`);
    }
    load();
  };

  const _adjust = useServerFn(adminAdjustDays);
  const _ban = useServerFn(adminBanUser);
  const _unban = useServerFn(adminUnbanUser);
  const _remove = useServerFn(adminRemoveUser);

  const adjustDays = async (uid: string, days: number) => {
    try { await _adjust({ data: { user_id: uid, days } }); toast.success(`${days > 0 ? "+" : ""}${days} days`); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const doBan = async () => {
    if (!banTarget) return;
    try { await _ban({ data: { user_id: banTarget, reason: banReason || "Banned by admin" } }); toast.success("User banned"); setBanTarget(null); setBanReason(""); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const unban = async (uid: string) => {
    try { await _unban({ data: { user_id: uid } }); toast.success("User unbanned"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const removeUser = async (uid: string) => {
    if (!confirm("Remove this user? They will be soft-deleted.")) return;
    try { await _remove({ data: { user_id: uid } }); toast.success("User removed"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading users…</div>;

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card/40">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">User</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Roles</th>
              <th className="px-4 py-2 text-left">Subscription</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={`border-t border-border/40 ${u.is_banned ? "bg-destructive/5" : u.is_removed ? "bg-muted/30 opacity-60" : ""}`}>
                <td className="px-4 py-3">
                  <div className="font-medium">{u.username ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{u.email ?? u.id.slice(0, 8)}</div>
                  <div className="text-[10px] text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</div>
                </td>
                <td className="px-4 py-3">
                  {u.is_banned ? (
                    <div>
                      <span className="rounded-md bg-destructive/20 px-2 py-0.5 text-xs font-bold text-destructive">BANNED</span>
                      {u.ban_reason && <p className="mt-1 text-[10px] text-destructive/80">Reason: {u.ban_reason}</p>}
                      <p className="mt-0.5 text-[10px] text-muted-foreground">Appeal: <a href="https://discord.gg/YVqhKtceSX" target="_blank" rel="noreferrer" className="text-primary underline">Discord</a> · <a href="https://t.me/veltrixlol" target="_blank" rel="noreferrer" className="text-primary underline">Telegram</a></p>
                    </div>
                  ) : u.is_removed ? (
                    <div>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">REMOVED</span>
                      <p className="mt-0.5 text-[10px] text-muted-foreground font-mono">code still exists but access revoked</p>
                    </div>
                  ) : (
                    <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-500">Active</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(["admin", "operator", "viewer"] as const).map((r) => {
                      const has = u.roles.includes(r);
                      return (
                        <button
                          key={r}
                          onClick={() => toggleRole(u.id, r, has)}
                          className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                            has ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-accent"
                          }`}
                        >
                          {r}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <button onClick={() => adjustDays(u.id, 30)} className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-500 hover:bg-emerald-500/25"><Plus className="h-3 w-3" />30d</button>
                    <button onClick={() => adjustDays(u.id, 7)} className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-500 hover:bg-emerald-500/20"><Plus className="h-3 w-3" />7d</button>
                    <button onClick={() => adjustDays(u.id, -7)} className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-500 hover:bg-amber-500/20"><Minus className="h-3 w-3" />7d</button>
                    <button onClick={() => adjustDays(u.id, -30)} className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-1 text-xs text-amber-500 hover:bg-amber-500/25"><Minus className="h-3 w-3" />30d</button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {u.is_banned ? (
                      <button onClick={() => unban(u.id)} className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-500 hover:bg-emerald-500/25"><Undo2 className="h-3 w-3" />Unban</button>
                    ) : (
                      <button onClick={() => setBanTarget(u.id)} className="inline-flex items-center gap-1 rounded-md bg-destructive/15 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/25"><Ban className="h-3 w-3" />Ban</button>
                    )}
                    {!u.is_removed && (
                      <button onClick={() => removeUser(u.id)} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"><UserX className="h-3 w-3" />Remove</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No users yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Ban dialog */}
      {banTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setBanTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-destructive/40 bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-destructive"><Ban className="h-5 w-5" /><h2 className="text-lg font-semibold">Ban User</h2></div>
            <p className="mt-2 text-xs text-muted-foreground">Their subscription will be cancelled and access locked. They can appeal via Discord or Telegram.</p>
            <textarea
              value={banReason}
              onChange={(e) => setBanReason(e.target.value.slice(0, 500))}
              rows={3}
              placeholder="Ban reason (shown to user)…"
              className="mt-3 w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-destructive"
            />
            <div className="mt-3 flex gap-2">
              <button onClick={() => setBanTarget(null)} className="flex-1 rounded-md border border-border bg-secondary px-4 py-2 text-sm hover:bg-accent">Cancel</button>
              <button onClick={doBan} className="flex-1 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90">Ban</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Devices ─── */
function DevicesTab() {
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("devices")
      .select("id, pc_name, device_name, ip_address, os, is_online, last_seen, owner_user_id")
      .order("created_at", { ascending: false });
    setDevices(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const ch = supabase.channel("admin-devices-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const remove = async (id: string) => {
    if (!confirm("Delete this device?")) return;
    const { error } = await supabase.from("devices").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Device deleted");
    load();
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading devices…</div>;

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card/40">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left">PC</th>
            <th className="px-4 py-2 text-left">IP / OS</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => (
            <tr key={d.id} className="border-t border-border/40">
              <td className="px-4 py-3">
                <div className="font-medium">{d.pc_name}</div>
                <div className="text-xs text-muted-foreground">{d.device_name}</div>
              </td>
              <td className="px-4 py-3 text-xs">
                <div>{d.ip_address}</div>
                <div className="text-muted-foreground">{d.os ?? "—"}</div>
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${d.is_online ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                  {d.is_online ? "Online" : "Offline"}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <button onClick={() => remove(d.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive" title="Delete">
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
          {devices.length === 0 && (
            <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">No devices.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Audit ─── */
function AuditTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("audit_logs")
      .select("id, action, ip, created_at, operator_id, device_id")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => { setLogs(data ?? []); setLoading(false); });
  }, []);

  if (loading) return <div className="text-sm text-muted-foreground">Loading audit logs…</div>;

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card/40">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left">When</th>
            <th className="px-4 py-2 text-left">Action</th>
            <th className="px-4 py-2 text-left">IP</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-t border-border/40">
              <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</td>
              <td className="px-4 py-3 font-mono text-xs">{l.action}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{l.ip ?? "—"}</td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">No audit entries.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Subs ─── */
function SubsTab() {
  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("subscriptions")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => { setSubs(data ?? []); setLoading(false); });
  }, []);

  useEffect(() => {
    const ch = supabase.channel("admin-subs-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions" }, () => {
        supabase.from("subscriptions").select("*").order("created_at", { ascending: false }).then(({ data }) => setSubs(data ?? []));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (loading) return <div className="text-sm text-muted-foreground">Loading subscriptions…</div>;

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card/40">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left">Plan</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-left">Amount</th>
            <th className="px-4 py-2 text-left">Created</th>
          </tr>
        </thead>
        <tbody>
          {subs.map((s) => (
            <tr key={s.id} className="border-t border-border/40">
              <td className="px-4 py-3 font-medium">{s.plan}</td>
              <td className="px-4 py-3 text-xs">{s.status}</td>
              <td className="px-4 py-3 text-xs">{s.amount_usd ? `$${s.amount_usd}` : "—"}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
          {subs.length === 0 && (
            <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">No subscriptions.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ─── News ─── */
function NewsTab() {
  const { user } = useAuth();
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [posts, setPosts] = useState<any[]>([]);

  const load = async () => {
    const { data } = await supabase.from("community_posts").select("*").eq("channel", "news").order("created_at", { ascending: false }).limit(20);
    setPosts(data ?? []);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const ch = supabase.channel("admin-news-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_posts" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const submit = async () => {
    if (!user || !body.trim()) return;
    setPosting(true);
    const { error } = await supabase.from("community_posts").insert({ author_id: user.id, channel: "news", body: body.trim() });
    setPosting(false);
    if (error) return toast.error(error.message);
    toast.success("News posted");
    setBody("");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/60 bg-card/40 p-4">
        <label className="text-xs font-medium text-muted-foreground">New announcement</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="What's new?"
          className="mt-2 w-full rounded-md border border-border/60 bg-input/60 p-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-ring/40"
        />
        <div className="mt-3 flex justify-end">
          <button onClick={submit} disabled={posting || !body.trim()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
            {posting ? "Posting…" : "Post news"}
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {posts.map((p) => (
          <div key={p.id} className="rounded-xl border border-border/60 bg-card/40 p-4">
            <div className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</div>
            <div className="mt-1 whitespace-pre-wrap text-sm">{p.body}</div>
          </div>
        ))}
        {posts.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">No news posts yet.</div>
        )}
      </div>
    </div>
  );
}

/* ─── TURN servers ─── */
type TurnRow = {
  id: string;
  label: string;
  url: string;
  username: string | null;
  credential: string | null;
  enabled: boolean;
  updated_at: string;
};

function TurnTab() {
  const [rows, setRows] = useState<TurnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    label: "self-hosted",
    url: "turn:1.2.3.4:3478?transport=tcp",
    username: "veltrix",
    credential: "",
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("turn_servers")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data ?? []) as TurnRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!form.url.trim()) return toast.error("URL is required");
    setSaving(true);
    const { error } = await supabase.from("turn_servers").insert({
      label: form.label.trim() || "custom",
      url: form.url.trim(),
      username: form.username.trim() || null,
      credential: form.credential || null,
      enabled: true,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("TURN server added");
    setForm({ label: "self-hosted", url: "", username: "", credential: "" });
    load();
  };

  const toggle = async (row: TurnRow) => {
    const { error } = await supabase
      .from("turn_servers")
      .update({ enabled: !row.enabled })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    load();
  };

  const remove = async (row: TurnRow) => {
    if (!confirm(`Remove ${row.url}?`)) return;
    const { error } = await supabase.from("turn_servers").delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/60 bg-card/40 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Add TURN / STUN server</h2>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Run <code className="rounded bg-muted px-1">turn/</code> on your VPS
          (<code className="rounded bg-muted px-1">cd turn && npm install && npm start</code>),
          then paste the URL + credentials it prints below. Custom servers are tried first.
        </p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <input
            placeholder="Label"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            className="rounded-md border border-border/60 bg-input/60 px-3 py-2 text-sm"
          />
          <input
            placeholder="turn:host:3478?transport=tcp"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            className="rounded-md border border-border/60 bg-input/60 px-3 py-2 text-sm md:col-span-3 font-mono"
          />
          <input
            placeholder="Username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            className="rounded-md border border-border/60 bg-input/60 px-3 py-2 text-sm md:col-span-2"
          />
          <input
            placeholder="Password / credential"
            value={form.credential}
            onChange={(e) => setForm({ ...form, credential: e.target.value })}
            type="password"
            className="rounded-md border border-border/60 bg-input/60 px-3 py-2 text-sm md:col-span-2"
          />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={add}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add server
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card/40">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Label</th>
              <th className="px-4 py-2 text-left">URL</th>
              <th className="px-4 py-2 text-left">User</th>
              <th className="px-4 py-2 text-left">Enabled</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No custom TURN servers configured. The built-in public STUN/TURN fallback is used.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/40">
                <td className="px-4 py-3 font-medium">{r.label}</td>
                <td className="px-4 py-3 font-mono text-xs break-all">{r.url}</td>
                <td className="px-4 py-3 text-xs">{r.username ?? "—"}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggle(r)}
                    className={`rounded-md border px-2 py-1 text-xs ${
                      r.enabled
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-border/60 text-muted-foreground"
                    }`}
                  >
                    {r.enabled ? "Enabled" : "Disabled"}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => remove(r)}
                    className="rounded-md border border-destructive/40 p-1.5 text-destructive hover:bg-destructive/10"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Endpoints (admin-managed server URLs) ─── */
type EndpointRow = { id: string; kind: string; label: string; url: string; is_active: boolean; is_default: boolean; updated_at: string };

function EndpointsTab() {
  const [rows, setRows] = useState<EndpointRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ kind: "ws_relay", label: "", url: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any).from("server_endpoints").select("*").order("kind").order("updated_at", { ascending: false });
    setRows((data ?? []) as EndpointRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!form.url.trim()) return toast.error("URL required");
    setSaving(true);
    const { error } = await (supabase as any).from("server_endpoints").insert({ kind: form.kind, label: form.label.trim() || form.kind, url: form.url.trim(), is_active: true, is_default: false });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Endpoint added");
    setForm({ kind: "ws_relay", label: "", url: "" });
    load();
  };

  const setDefault = async (row: EndpointRow) => {
    // Unset current default for this kind, then set this one
    await (supabase as any).from("server_endpoints").update({ is_default: false }).eq("kind", row.kind);
    await (supabase as any).from("server_endpoints").update({ is_default: true }).eq("id", row.id);
    toast.success(`${row.label || row.url} set as default`);
    load();
  };

  const toggle = async (row: EndpointRow) => {
    await (supabase as any).from("server_endpoints").update({ is_active: !row.is_active }).eq("id", row.id);
    load();
  };

  const remove = async (row: EndpointRow) => {
    if (!confirm(`Remove ${row.url}?`)) return;
    await (supabase as any).from("server_endpoints").delete().eq("id", row.id);
    toast.success("Removed");
    load();
  };

  const kinds = ["frontend", "ws_relay", "buildserver", "lunes_host"] as const;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/60 bg-card/40 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Add server endpoint</h2>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Add backend WS relay, build server, or frontend URLs here. The default for each kind is baked into new builds.
        </p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="rounded-md border border-border/60 bg-input/60 px-3 py-2 text-sm">
            {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <input placeholder="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="rounded-md border border-border/60 bg-input/60 px-3 py-2 text-sm" />
          <input placeholder="https://..." value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="rounded-md border border-border/60 bg-input/60 px-3 py-2 text-sm md:col-span-2 font-mono" />
        </div>
        <div className="mt-3 flex justify-end">
          <button onClick={add} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card/40">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Kind</th>
              <th className="px-4 py-2 text-left">Label</th>
              <th className="px-4 py-2 text-left">URL</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No endpoints configured.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/40">
                <td className="px-4 py-3"><span className="rounded bg-muted px-2 py-0.5 text-xs font-mono">{r.kind}</span></td>
                <td className="px-4 py-3 font-medium">{r.label}</td>
                <td className="px-4 py-3 font-mono text-xs break-all">{r.url}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggle(r)} className={`rounded-md border px-2 py-1 text-xs ${r.is_active ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-border/60 text-muted-foreground"}`}>
                      {r.is_active ? "Active" : "Off"}
                    </button>
                    {r.is_default ? (
                      <span className="rounded-md bg-primary/15 px-2 py-1 text-xs font-medium text-primary">Default</span>
                    ) : (
                      <button onClick={() => setDefault(r)} className="rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground hover:text-foreground">Set default</button>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => remove(r)} className="rounded-md border border-destructive/40 p-1.5 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
