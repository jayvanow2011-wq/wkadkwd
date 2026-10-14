import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useTheme, type ThemeName } from "@/lib/theme-context";
import { getProfile, usernameAvailable, type Profile } from "@/lib/profile";
import { Settings as SettingsIcon, Palette, Upload, Save, User,
  ShieldCheck, Copy, Download, Check, Loader2, KeyRound } from "lucide-react";
import { useCustomization } from "@/lib/customization-context";
import { useT, LANGUAGES } from "@/lib/i18n";
import { generateTotp, verifyTotpAndEnable, issueRecoveryCodes } from "@/lib/totp.functions";

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsPage,
});

type Tab = "profile" | "appearance" | "security" | "misc";

function SettingsPage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const { customization, update } = useCustomization();
  const t = useT();
  const [tab, setTab] = useState<Tab>("profile");

  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fromDiscord, setFromDiscord] = useState(false);
  const [loading, setLoading] = useState(true);
  const [totpEnabled, setTotpEnabled] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      let p = await getProfile(user.id);
      if (!p) {
        await supabase.from("profiles").insert({
          id: user.id,
          email: user.email ?? null,
          full_name: user.email ?? null,
        } as never);
        p = await getProfile(user.id);
      }
      if (cancelled) return;
      if (p) {
        setProfile(p);
        setUsername(p.username ?? "");
        setBio(p.bio ?? "");
        setAvatarUrl(p.avatar_url);
        setFromDiscord(!!p.discord_id);
      }
      const { data: t2 } = await supabase.from("profiles").select("totp_enabled").eq("id", user.id).maybeSingle();
      if (!cancelled) setTotpEnabled(!!t2?.totp_enabled);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const upload = async (f: File) => {
    if (!user) return;
    if (!f.type.startsWith("image/")) { toast.error("Pick an image file"); return; }
    if (f.size > 5 * 1024 * 1024) { toast.error("Max 5 MB"); return; }
    const ext = (f.name.split(".").pop() || "png").toLowerCase();
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const tid = toast.loading("Uploading…");
    const { error } = await supabase.storage.from("avatars").upload(path, f, { upsert: true, contentType: f.type });
    if (error) { toast.error(error.message, { id: tid }); return; }
    const { data: signed, error: sErr } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
    if (sErr || !signed) { toast.error(sErr?.message || "Could not sign URL", { id: tid }); return; }
    setAvatarUrl(signed.signedUrl);
    const { error: e2 } = await supabase.from("profiles").update({ avatar_url: signed.signedUrl } as never).eq("id", user.id);
    if (e2) { toast.error(e2.message, { id: tid }); return; }
    toast.success("Avatar updated", { id: tid });
  };

  const save = async () => {
    if (!user) return;
    const u = username.trim();
    if (!fromDiscord && !/^[a-zA-Z0-9_]{3,20}$/.test(u)) { toast.error("Username 3–20 chars"); return; }
    if (!fromDiscord) {
      const free = await usernameAvailable(u, user.id);
      if (!free) { toast.error("Username taken"); return; }
    }
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      username: u,
      bio: bio.trim() || null,
      avatar_url: avatarUrl,
      theme,
    }).eq("id", user.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!profile) return <p className="text-sm text-destructive">Could not load profile.</p>;

  const TABS: { id: Tab; label: string; icon: typeof User }[] = [
    { id: "profile", label: "Profile", icon: User },
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "security", label: "Security", icon: ShieldCheck },
    { id: "misc", label: "More", icon: SettingsIcon },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${tab === id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <Section title="Profile">
          <AvatarDrop avatarUrl={avatarUrl} onFile={upload} />
          <Field label={`Username${fromDiscord ? " (Discord-linked)" : ""}`}>
            <input value={username} onChange={(e) => setUsername(e.target.value)} disabled={fromDiscord} className="input disabled:opacity-60" />
          </Field>
          <Field label="Bio">
            <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 280))} rows={3} className="input resize-none" />
          </Field>
          <button onClick={save} disabled={saving} className="btn-primary !w-auto">
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save changes"}
          </button>
        </Section>
      )}


      {tab === "appearance" && (
        <Section title="Theme">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ThemeCard name="dark" label="Dark" desc="" active={theme === "dark"} onClick={() => setTheme("dark")}
              swatches={["#000000", "#0a0a0a", "#262626", "#ededed"]} />
            <ThemeCard name="light" label="Light" desc="" active={theme === "light"} onClick={() => setTheme("light")}
              swatches={["#ffffff", "#f5f5f5", "#e5e5e5", "#171717"]} />
            <ThemeCard name="summer" label="Summer" desc="" active={theme === "summer"} onClick={() => setTheme("summer")}
              swatches={["#fef9e7", "#fde2c4", "#f3a26b", "#c14a30"]} />
          </div>

          <div className="pt-3 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={customization.animationsEnabled}
                onChange={(e) => update("animationsEnabled", e.target.checked)}
                className="h-4 w-4 accent-foreground" />
              <div>
                <div className="text-sm font-medium">Enable animations</div>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={customization.fallingLeaves}
                onChange={(e) => update("fallingLeaves", e.target.checked)}
                className="h-4 w-4 accent-foreground" />
              <div>
                <div className="text-sm font-medium">Falling autumn leaves</div>
                <div className="text-xs text-muted-foreground">
                  Seasonal orange &amp; brown leaves drifting over the page. Never shown while controlling a client.
                </div>
              </div>
            </label>
          </div>
        </Section>
      )}

      {tab === "security" && (
        <SecurityPanel totpEnabled={totpEnabled} onChange={setTotpEnabled} />
      )}

      {tab === "misc" && (
        <>
          <Section title="Language">
            <div className="grid grid-cols-3 gap-2">
              {LANGUAGES.map((l) => (
                <button key={l.id} onClick={() => update("language", l.id)}
                  className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition ${customization.language === l.id ? "border-foreground bg-secondary" : "border-border hover:border-foreground/40"}`}>
                  <span className="text-base">{l.flag}</span> {l.label}
                </button>
              ))}
            </div>
          </Section>

        </>
      )}

      <style>{`
        .input { width: 100%; padding: 0.55rem 0.75rem; font-size: 0.875rem; border-radius: 0.5rem;
          border: 1px solid var(--color-border); background: color-mix(in oklab, var(--color-background) 60%, transparent);
          color: var(--color-foreground); transition: border-color .15s, box-shadow .15s; }
        .input:focus { outline: none; border-color: color-mix(in oklab, var(--color-foreground) 50%, transparent);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-foreground) 12%, transparent); }
        .btn-primary { display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem;
          padding: 0.6rem 1rem; font-size: 0.875rem; font-weight: 600; border-radius: 0.6rem; letter-spacing: -0.01em;
          background: var(--color-primary); color: var(--color-primary-foreground); border: 1px solid transparent;
          box-shadow: 0 1px 0 rgba(255,255,255,.06) inset, 0 6px 18px -10px color-mix(in oklab, var(--color-primary) 80%, transparent);
          transition: transform .12s, opacity .12s, box-shadow .15s; }
        .btn-primary:hover:not(:disabled) { transform: translateY(-1px); opacity: 0.95; }
        .btn-primary:active:not(:disabled) { transform: translateY(0); }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-secondary { display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
          padding: 0.55rem 0.9rem; font-size: 0.8125rem; font-weight: 500; border-radius: 0.6rem;
          background: var(--color-secondary); color: var(--color-foreground); border: 1px solid var(--color-border);
          transition: background .12s, border-color .12s, transform .12s; }
        .btn-secondary:hover { background: var(--color-accent); border-color: color-mix(in oklab, var(--color-foreground) 30%, transparent); }
        .btn-secondary:active { transform: translateY(1px); }
      `}</style>
    </div>
  );
}

function Section({ title, desc, icon: Icon, children }: { title: string; desc?: string; icon?: any; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-6">
      <header>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          {Icon && <Icon className="h-4 w-4" />} {title}
        </h2>
        {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
      </header>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[12px] font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function AvatarDrop({ avatarUrl, onFile }: { avatarUrl: string | null; onFile: (f: File) => void }) {
  const [drag, setDrag] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault(); setDrag(false);
        const f = e.dataTransfer.files?.[0]; if (f) onFile(f);
      }}
      className={`flex items-center gap-4 rounded-xl border-2 border-dashed p-4 transition ${drag ? "border-foreground bg-accent/40" : "border-border bg-background/40"}`}
    >
      <div className="relative">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-20 w-20 rounded-full border border-border object-cover shadow-md" />
        ) : <div className="h-20 w-20 rounded-full border border-border bg-muted" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">Profile picture</div>
        <div className="mt-2 flex gap-2">
          <label className="btn-secondary cursor-pointer !w-auto">
            <Upload className="h-3.5 w-3.5" /> Choose file
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        </div>
      </div>
    </div>
  );
}

function ThemeCard({ name, label, desc, swatches, active, onClick }: {
  name: ThemeName; label: string; desc: string; swatches: string[]; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} type="button"
      className={`group relative flex flex-col gap-3 rounded-xl border bg-card p-3 text-left transition
        hover:-translate-y-0.5 hover:shadow-lg
        ${active
          ? "border-foreground shadow-[0_0_0_2px_var(--color-foreground)_inset,0_10px_30px_-15px_rgba(0,0,0,.5)]"
          : "border-border hover:border-foreground/40"}`}>
      <div className="flex h-16 w-full overflow-hidden rounded-md border border-border">
        {swatches.map((c) => <div key={c} className="flex-1 transition group-hover:scale-y-110" style={{ background: c }} />)}
      </div>
      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{label}</span>
          {active && <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background">
            <Check className="h-2.5 w-2.5" /> active
          </span>}
        </div>
        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/60">theme:{name}</div>
      </div>
    </button>
  );
}

function Toggle({ label, desc, value, set }: { label: string; desc: string; value: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <div>
        <div className="text-sm font-medium">{label}</div>
      </div>
      <div className={`relative h-6 w-11 rounded-full transition ${value ? "bg-foreground" : "bg-muted border border-border"}`} onClick={() => set(!value)}>
        <div className={`absolute top-0.5 h-5 w-5 rounded-full shadow transition-transform ${value ? "translate-x-5 bg-background" : "translate-x-0.5 bg-foreground"}`} />
      </div>
    </label>
  );
}

function SecurityPanel({ totpEnabled, onChange }: { totpEnabled: boolean; onChange: (v: boolean) => void }) {
  const genFn = useServerFn(generateTotp);
  const verFn = useServerFn(verifyTotpAndEnable);
  const recFn = useServerFn(issueRecoveryCodes);
  const [phase, setPhase] = useState<"idle" | "qr" | "verified">("idle");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);

  const start = async () => {
    setBusy(true);
    try {
      const t = await genFn({});
      setQr(t.qr); setSecret(t.secret);
      setPhase("qr");
    } finally { setBusy(false); }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await verFn({ data: { code: code.replace(/\s/g, "") } });
      if (!r.ok) { toast.error(r.error || "Wrong code"); return; }
      const c = await recFn({});
      setCodes(c.codes);
      onChange(true);
      setPhase("verified");
      toast.success("2FA enabled");
    } finally { setBusy(false); }
  };

  const regenerateCodes = async () => {
    setBusy(true);
    try {
      const c = await recFn({});
      setCodes(c.codes);
      toast.success("Generated new backup codes");
    } finally { setBusy(false); }
  };

  return (
    <Section title="Two-factor authentication" icon={ShieldCheck}>
      {totpEnabled && phase !== "verified" ? (
        <>
          <div className="flex items-center gap-2 rounded-md border border-foreground/30 bg-secondary px-3 py-2 text-sm">
            <Check className="h-4 w-4" /> 2FA is enabled on this account.
          </div>
          <button onClick={regenerateCodes} disabled={busy} className="btn-secondary !w-auto">
            <KeyRound className="h-4 w-4" /> {busy ? "Generating…" : "Generate new backup codes"}
          </button>
          {codes.length > 0 && <CodesList codes={codes} />}
        </>
      ) : phase === "idle" ? (
        <button onClick={start} disabled={busy} className="btn-primary !w-auto">
          {busy ? <Loader2 className="h-4 w-4 spin-soft" /> : <ShieldCheck className="h-4 w-4" />} Set up 2FA
        </button>
      ) : phase === "qr" ? (
        <>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            {qr && <img src={qr} alt="QR" className="h-40 w-40 rounded-md border border-border bg-white p-1" />}
            <div className="flex-1 space-y-2">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Or enter manually</div>
              <code className="block break-all rounded-md border border-border bg-secondary p-2 font-mono text-[11px]">{secret}</code>
              <button type="button" onClick={() => { if (secret) { navigator.clipboard.writeText(secret); toast.success("Copied"); } }}
                className="btn-secondary !w-auto"><Copy className="h-3 w-3" /> Copy</button>
            </div>
          </div>
          <form onSubmit={verify} className="space-y-3">
            <Field label="6-digit code">
              <input value={code} onChange={(e) => setCode(e.target.value)} required autoFocus
                className="input text-center text-lg font-mono tracking-[0.4em]" placeholder="123 456" />
            </Field>
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? <Loader2 className="h-4 w-4 spin-soft" /> : "Verify & enable"}
            </button>
          </form>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-md border border-foreground/30 bg-secondary px-3 py-2 text-sm">
            <Check className="h-4 w-4" /> 2FA enabled. Save your backup codes:
          </div>
          <CodesList codes={codes} />
        </>
      )}
    </Section>
  );
}

function CodesList({ codes }: { codes: string[] }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5 rounded-md border border-border bg-secondary p-3 font-mono text-[13px]">
        {codes.map((c) => <code key={c} className="select-all px-1">{c}</code>)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => { navigator.clipboard.writeText(codes.join("\n")); toast.success("Copied"); }}
          className="btn-secondary"><Copy className="h-3.5 w-3.5" /> Copy all</button>
        <button onClick={() => {
          const blob = new Blob([`zip-prep-pal.xyz recovery codes\n\n${codes.join("\n")}\n`], { type: "text/plain" });
          const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
          a.download = "zip-prep-pal-recovery.txt"; a.click();
        }} className="btn-secondary"><Download className="h-3.5 w-3.5" /> Download</button>
      </div>
    </div>
  );
}
