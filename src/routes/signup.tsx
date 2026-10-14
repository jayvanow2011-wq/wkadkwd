import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { useServerFn } from "@tanstack/react-start";
import { generateTotp, verifyTotpAndEnable, issueRecoveryCodes, finalizeProfile } from "@/lib/totp.functions";
import { supabase } from "@/integrations/supabase/client";
import { LANGUAGES } from "@/lib/i18n";
import { useCustomization } from "@/lib/customization-context";
import { ArrowRight, Check, Copy, Download, Loader2, ShieldCheck, SkipForward, Globe } from "lucide-react";


export const Route = createFileRoute("/signup")({
  component: SignupPage,
  head: () => ({ meta: [{ title: "Create account — VeltrixRAT" }, { property: "og:title", content: "Sign up — VeltrixRAT" }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
});

type Step = "acc" | "creating" | "lang" | "twofa" | "recovery" | "profile" | "done";

const STEP_ORDER: Step[] = ["acc", "lang", "twofa", "recovery", "profile", "done"];
const STEP_LABEL: Record<Step, string> = {
  acc: "Account", creating: "Account", lang: "Language", twofa: "Two-factor", recovery: "Recovery", profile: "Profile", done: "Done",
};


function SignupPage() {
  const navigate = useNavigate();
  const { signUpWithUsername, user } = useAuth();
  const { update: updateCustomization } = useCustomization();
  const [selectedLang, setSelectedLang] = useState("en");
  const genFn = useServerFn(generateTotp);
  const verFn = useServerFn(verifyTotpAndEnable);
  const recFn = useServerFn(issueRecoveryCodes);
  const finFn = useServerFn(finalizeProfile);

  const [step, setStep] = useState<Step>("acc");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [refCode, setRefCode] = useState("");
  const [recoveryTok, setRecoveryTok] = useState<string | null>(null);

  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [twofaEnabled, setTwofaEnabled] = useState(false);

  const [codes, setCodes] = useState<string[]>([]);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [socials, setSocials] = useState({ discord: "", telegram: "", twitter: "", website: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("ref");
    if (r) setRefCode(r.toUpperCase());
  }, []);

  const visibleIdx = STEP_ORDER.indexOf(step === "creating" ? "acc" : step);

  const createAcc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return toast.error("3–20 chars, letters/numbers/_");
    if (password.length < 6) return toast.error("Password too short");
    setStep("creating");
    setBusy(true);
    try {
      const { error, recoveryToken } = await signUpWithUsername(username, password, refCode || undefined);
      if (error) { toast.error(error); setStep("acc"); return; }
      setRecoveryTok(recoveryToken ?? null);
      await new Promise((r) => setTimeout(r, 750));
      setStep("lang");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setStep("acc");
    } finally { setBusy(false); }
  };

  const startTwofaSetup = async () => {
    setBusy(true);
    try {
      const t = await genFn({});
      setQr(t.qr); setSecret(t.secret);
    } finally { setBusy(false); }
  };

  const verify2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await verFn({ data: { code: otp.replace(/\s/g, "") } });
      if (!r.ok) { toast.error(r.error || "Wrong code"); return; }
      setTwofaEnabled(true);
      const c = await recFn({});
      setCodes(c.codes);
      setStep("recovery");
    } finally { setBusy(false); }
  };

  const skip2fa = () => {
    setStep("profile");
  };

  const handleAvatar = async (f: File) => {
    if (!user) return;
    const path = `${user.id}/${Date.now()}-${f.name}`;
    const { error } = await supabase.storage.from("avatars").upload(path, f, { upsert: true });
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    toast.success("Avatar uploaded");
  };

  const finishProfile = async () => {
    setBusy(true);
    try {
      await finFn({ data: {
        displayName: displayName || username,
        bio, avatarUrl: avatarUrl ?? undefined,
        socials,
      }});
      setStep("done");
      setTimeout(() => navigate({ to: "/dashboard/subs" }), 900);
    } finally { setBusy(false); }
  };

  return (
    <main className="relative flex min-h-screen items-start justify-center px-4 py-10">
      

      <div className="w-full max-w-[460px]">
        <div className="mb-8 flex justify-center">
          <Link to="/" className="flex items-center gap-2 text-foreground">
            <span className="text-lg font-semibold tracking-tight font-mono">VeltrixRAT</span>
          </Link>
        </div>

        {/* Stepper */}
        <div className="mb-5 flex items-center gap-2">
          {STEP_ORDER.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-2">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-medium transition
                ${i < visibleIdx ? "border-foreground bg-foreground text-background" :
                  i === visibleIdx ? "border-foreground text-foreground" :
                  "border-border text-muted-foreground"}`}>
                {i < visibleIdx ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              {i < STEP_ORDER.length - 1 && (
                <div className={`h-px flex-1 transition ${i < visibleIdx ? "bg-foreground" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-2xl shadow-black/20">
          <h1 className="text-lg font-semibold tracking-tight">{STEP_LABEL[step]}</h1>

          {step === "acc" && (
            <>
              <p className="mt-1 text-sm text-muted-foreground">Pick a username and a strong password.</p>
              <form onSubmit={createAcc} className="mt-5 space-y-3.5">
                <Field label="Username">
                  <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus
                    className="input" placeholder="jayjay" />
                </Field>
                <Field label="Password">
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
                    className="input" placeholder="At least 6 characters" />
                </Field>
                <Field label="Referral code (optional)">
                  <input value={refCode} onChange={(e) => setRefCode(e.target.value.toUpperCase())}
                    className="input font-mono text-xs" placeholder="A1B2C3D4" />
                </Field>
                <button type="submit" disabled={busy} className="btn-primary mt-1">
                  Create account <ArrowRight className="h-4 w-4" />
                </button>
                <div className="pt-1 text-center text-xs text-muted-foreground">
                  Already have one? <Link to="/" className="text-foreground hover:underline">Sign in</Link>
                </div>
              </form>
            </>
          )}

          {step === "creating" && (
            <div className="py-10 text-center">
              <Loader2 className="mx-auto h-6 w-6 text-foreground spin-soft" />
              <p className="mt-4 text-sm text-muted-foreground">Spinning up your account<span className="dots"><span>.</span><span>.</span><span>.</span></span></p>
              <div className="mx-auto mt-5 h-1 w-44 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-1/2 shimmer rounded-full" style={{ background: "var(--color-foreground)" }} />
              </div>
            </div>
          )}

          {step === "twofa" && (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                Two-factor auth is <b>optional but recommended</b>. You can always enable it later in Settings.
              </p>
              {!qr ? (
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <button onClick={startTwofaSetup} disabled={busy} className="btn-primary">
                    <ShieldCheck className="h-4 w-4" /> Set up 2FA now
                  </button>
                  <button onClick={skip2fa} className="btn-secondary">
                    <SkipForward className="h-4 w-4" /> Skip for now
                  </button>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Scan with Microsoft Authenticator, Google Authenticator, Authy, 1Password — anything TOTP.
                  </p>
                  <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                    {qr && <img src={qr} alt="QR code" className="h-40 w-40 rounded-md border border-border bg-white p-1" />}
                    <div className="flex-1 space-y-2">
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Or enter manually</div>
                      <code className="block break-all rounded-md border border-border bg-secondary p-2 font-mono text-[11px]">{secret}</code>
                      <button type="button" onClick={() => { if (secret) { navigator.clipboard.writeText(secret); toast.success("Copied"); } }}
                        className="btn-secondary !w-auto text-xs"><Copy className="h-3 w-3" /> Copy secret</button>
                    </div>
                  </div>
                  <form onSubmit={verify2fa} className="space-y-3">
                    <Field label="6-digit code">
                      <input value={otp} onChange={(e) => setOtp(e.target.value)} required autoFocus
                        className="input text-center text-lg font-mono tracking-[0.4em]" placeholder="123 456" />
                    </Field>
                    <button type="submit" disabled={busy} className="btn-primary">
                      {busy ? <Loader2 className="h-4 w-4 spin-soft" /> : <>Verify & continue <ArrowRight className="h-4 w-4" /></>}
                    </button>
                    <button type="button" onClick={skip2fa} className="btn-secondary">
                      <SkipForward className="h-4 w-4" /> Skip — I'll do this later
                    </button>
                  </form>
                </div>
              )}
            </>
          )}

          {step === "recovery" && (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                Save these <b>backup codes</b> somewhere safe. Each one works <i>once</i> if you lose your phone.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-1.5 rounded-md border border-foreground/30 bg-secondary p-3 font-mono text-[13px]">
                {codes.map((c) => <code key={c} className="select-all px-1">{c}</code>)}
              </div>
              {recoveryTok && (
                <details className="mt-2 rounded-md border border-border p-2 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">+ Legacy recovery token (also save)</summary>
                  <code className="mt-2 block break-all font-mono text-[11px]">{recoveryTok}</code>
                </details>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button"
                  onClick={() => { navigator.clipboard.writeText(codes.join("\n")); toast.success("Copied all"); }}
                  className="btn-secondary"><Copy className="h-3.5 w-3.5" /> Copy all</button>
                <button type="button"
                  onClick={() => {
                    const blob = new Blob([`zip-prep-pal.xyz recovery codes\n\n${codes.join("\n")}\n\nLegacy: ${recoveryTok ?? ""}\n`], { type: "text/plain" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = "zip-prep-pal-recovery.txt";
                    a.click();
                  }}
                  className="btn-secondary"><Download className="h-3.5 w-3.5" /> Download .txt</button>
              </div>
              <button onClick={() => setStep("profile")} className="btn-primary mt-4">
                I've saved them <ArrowRight className="h-4 w-4" />
              </button>
            </>
          )}

          {step === "profile" && (
            <>
              <p className="mt-1 text-sm text-muted-foreground">A few details and you're in.</p>
              <div className="mt-5 space-y-4">
                <div className="flex items-center gap-3">
                  <label className="relative cursor-pointer">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover border border-border" />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-secondary text-xs text-muted-foreground">
                        +pfp
                      </div>
                    )}
                    <input type="file" accept="image/*" className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleAvatar(e.target.files[0])} />
                  </label>
                  <div className="flex-1">
                    <Field label="Display name">
                      <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                        placeholder={username} className="input" />
                    </Field>
                  </div>
                </div>
                <Field label="Bio">
                  <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} rows={2}
                    placeholder="A short tagline" className="input resize-none" />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  {(["discord","telegram","twitter","website"] as const).map((k) => (
                    <Field key={k} label={k.charAt(0).toUpperCase() + k.slice(1)}>
                      <input value={socials[k]} onChange={(e) => setSocials({ ...socials, [k]: e.target.value })}
                        className="input text-xs" placeholder={k === "website" ? "https://…" : "@handle"} />
                    </Field>
                  ))}
                </div>
                {!twofaEnabled && (
                  <div className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-[11px] text-muted-foreground">
                    Tip: enable 2FA later from Settings → Security.
                  </div>
                )}
                <button onClick={finishProfile} disabled={busy} className="btn-primary">
                  {busy ? <Loader2 className="h-4 w-4 spin-soft" /> : <>Finish & continue <ArrowRight className="h-4 w-4" /></>}
                </button>
              </div>
            </>
          )}

          {step === "done" && (
            <div className="py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background">
                <Check className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">You're in. Redirecting<span className="dots"><span>.</span><span>.</span><span>.</span></span></p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .input { width: 100%; padding: 0.55rem 0.75rem; font-size: 0.875rem; border-radius: 0.5rem;
          border: 1px solid var(--color-border); background: color-mix(in oklab, var(--color-background) 60%, transparent);
          color: var(--color-foreground); }
        .input::placeholder { color: color-mix(in oklab, var(--color-muted-foreground) 80%, transparent); }
        .btn-primary { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
          padding: 0.55rem 0.9rem; font-size: 0.875rem; font-weight: 500; border-radius: 0.5rem;
          background: var(--color-primary); color: var(--color-primary-foreground); border: 1px solid transparent; }
        .btn-primary:hover:not(:disabled) { opacity: 0.9; }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-secondary { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
          padding: 0.5rem 0.9rem; font-size: 0.8125rem; font-weight: 500; border-radius: 0.5rem;
          background: var(--color-secondary); color: var(--color-foreground); border: 1px solid var(--color-border); }
        .btn-secondary:hover { background: var(--color-accent); }
      `}</style>
    </main>
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
