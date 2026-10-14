import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { useServerFn } from "@tanstack/react-start";
import { totpStatusForUsername, verifyTotpForUser } from "@/lib/totp.functions";
import { Loader2 } from "lucide-react";


export const Route = createFileRoute("/")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Log in — VeltrixRAT" },
      { name: "description", content: "VeltrixRAT — veltrixrat.xyz" },
      { property: "og:title", content: "Log in — VeltrixRAT" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function makeCaptcha() {
  const a = Math.floor(Math.random() * 20) + 1;
  const b = Math.floor(Math.random() * 20) + 1;
  const ops = [
    { sym: "+", fn: (x: number, y: number) => x + y },
    { sym: "−", fn: (x: number, y: number) => x - y },
    { sym: "×", fn: (x: number, y: number) => x * y },
  ];
  const op = ops[Math.floor(Math.random() * ops.length)];
  return { q: `${a} ${op.sym} ${b}`, answer: op.fn(a, b) };
}

function LoginPage() {
  const navigate = useNavigate();
  const { authed, loading, signInWithUsername, recoverAccount } = useAuth();
  const statusFn = useServerFn(totpStatusForUsername);
  const verifyFn = useServerFn(verifyTotpForUser);

  const [mode, setMode] = useState<"login" | "recover">("login");
  const [stage, setStage] = useState<"creds" | "2fa">("creds");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [recoveryToken, setRecoveryToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [captcha, setCaptcha] = useState(() => makeCaptcha());
  const [captchaInput, setCaptchaInput] = useState("");
  const [done, setDone] = useState(false);

  const refreshCaptcha = useCallback(() => {
    setCaptcha(makeCaptcha());
    setCaptchaInput("");
  }, []);

  useEffect(() => {
    if (!loading && authed && done) navigate({ to: "/dashboard" });
  }, [authed, loading, navigate, done]);

  const handleCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await signInWithUsername(username, password);
      if (error) { toast.error(error); return; }
      
      // For now, skip 2FA check and go directly to dashboard
      // TODO: Implement proper TOTP integration with Neon
      toast.success(`Welcome back, ${username}`);
      setDone(true);
    } finally { setSubmitting(false); }
  };

  const handle2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUserId) return;
    setSubmitting(true);
    try {
      const r = await verifyFn({ data: { userId: pendingUserId, code: otp } });
      if (!r.ok) { toast.error(r.error || "Wrong code"); return; }
      if (r.usedRecovery) toast.message("Recovery code used — generate new ones in Settings");
      else toast.success("Signed in");
      setDone(true);
    } finally { setSubmitting(false); }
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parseInt(captchaInput, 10) !== captcha.answer) {
      toast.error("Wrong captcha"); refreshCaptcha(); return;
    }
    setSubmitting(true);
    try {
      const { error } = await recoverAccount(username, recoveryToken, newPassword);
      if (error) { toast.error(error); return; }
      toast.success("Password reset");
      setDone(true);
    } finally { setSubmitting(false); }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-10">
      
      {/* soft top glow behind card */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-[18%] h-[360px] w-[520px] -translate-x-1/2 rounded-full opacity-[0.22] blur-3xl"
          style={{ background: "radial-gradient(closest-side, rgba(255,255,255,0.55), transparent)" }} />
      </div>

      <div className="relative z-10 w-full max-w-[380px]">
        <div className="rounded-xl border border-white/[0.08] bg-black/60 p-7 backdrop-blur-xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
          <div className="mb-6 text-center">
            <h1 className="text-[19px] font-semibold tracking-tight text-white">
              {mode === "recover" ? "Reset password" : stage === "2fa" ? "Two-factor code" : "VeltrixRAT"}
            </h1>
            {mode === "recover" ? (
              <p className="mt-1.5 text-[13px] text-white/55">
                <button type="button" onClick={() => setMode("login")} className="font-medium text-white hover:underline">Sign in</button>
              </p>
            ) : stage === "creds" ? (
              <p className="mt-1.5 text-[13px] text-white/55">
                <Link to="/signup" className="font-medium text-white hover:underline">Sign up</Link>
              </p>
            ) : null}
          </div>

          {mode === "login" && stage === "creds" && (
            <form onSubmit={handleCreds} className="space-y-4">
              <Field label="USERNAME">
                <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus autoComplete="username"
                  className="input" placeholder="jayjay" />
              </Field>
              <Field label="PASSWORD" right={<button type="button" onClick={() => setMode("recover")} className="text-[11px] text-white/70 hover:text-white">Forgot?</button>}>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
                  className="input" placeholder="••••••••" />
              </Field>
              <button type="submit" disabled={submitting} className="btn-primary mt-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Log in</>}
              </button>

              <div className="relative my-1">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/[0.08]" /></div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-[0.18em] text-white/40">
                  <span className="bg-black px-2">or</span>
                </div>
              </div>

              <a href="/api/public/auth/discord/start?next=/dashboard"
                className="flex w-full items-center justify-center gap-2 rounded-md border border-white/[0.08] bg-[#5865F2] px-3 py-2.5 text-sm font-medium text-white transition hover:bg-[#4752c4]">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3a14.4 14.4 0 0 0-.617 1.27 18.27 18.27 0 0 0-5.487 0A14 14 0 0 0 9.834 3a19.74 19.74 0 0 0-3.76 1.369C2.679 9.43 1.78 14.36 2.23 19.22a19.93 19.93 0 0 0 6.034 3.05c.486-.66.92-1.36 1.292-2.094a12.9 12.9 0 0 1-2.036-.97c.171-.125.339-.255.5-.388a14.22 14.22 0 0 0 12.078 0c.163.133.331.263.5.388-.65.385-1.331.71-2.039.972.374.732.807 1.432 1.292 2.092a19.9 19.9 0 0 0 6.038-3.05c.53-5.62-.9-10.508-3.572-14.85ZM9.516 16.413c-1.183 0-2.157-1.084-2.157-2.418 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.334-.955 2.418-2.157 2.418Zm4.968 0c-1.183 0-2.157-1.084-2.157-2.418 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.334-.946 2.418-2.157 2.418Z"/>
                </svg>
                Continue with Discord
              </a>
            </form>
          )}

          {mode === "login" && stage === "2fa" && (
            <form onSubmit={handle2fa} className="space-y-4">
              <Field label="CODE">
                <input value={otp} onChange={(e) => setOtp(e.target.value)} required autoFocus
                  placeholder="123 456"
                  className="input text-center text-lg tracking-[0.4em] font-mono" />
              </Field>
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Verify</>}
              </button>
              <button type="button" onClick={() => { setStage("creds"); setOtp(""); }}
                className="w-full pt-1 text-center text-[11px] text-white/55 hover:text-white transition">
                ← Back to sign in
              </button>
            </form>
          )}

          {mode === "recover" && (
            <form onSubmit={handleRecover} className="space-y-4">
              <Field label="USERNAME">
                <input value={username} onChange={(e) => setUsername(e.target.value)} required className="input" />
              </Field>
              <Field label="RECOVERY TOKEN">
                <input value={recoveryToken} onChange={(e) => setRecoveryToken(e.target.value.toUpperCase())} required
                  className="input font-mono text-xs" placeholder="XXXX-XXXX-XXXX-…" />
              </Field>
              <Field label="NEW PASSWORD">
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6}
                  className="input" />
              </Field>
              <div className="flex items-end gap-2">
                <Field label={<>SOLVE <span className="font-mono text-white">{captcha.q}</span></>}>
                  <input type="number" value={captchaInput} onChange={(e) => setCaptchaInput(e.target.value)} required className="input" />
                </Field>
                <button type="button" onClick={refreshCaptcha}
                  className="h-[38px] rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs text-white/70 hover:bg-white/[0.08] transition">↻</button>
              </div>
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset & sign in"}
              </button>
            </form>
          )}

          <div className="mt-7 flex justify-center gap-5 text-[11px] text-white/35">
            <a href="#" className="hover:text-white/70 transition">Terms of Service</a>
            <a href="#" className="hover:text-white/70 transition">Privacy Policy</a>
          </div>
        </div>
      </div>

      {/* utility classes (Tailwind @apply not available outside main css) */}
      <style>{`
        .input { width: 100%; padding: 0.6rem 0.8rem; font-size: 0.875rem; border-radius: 0.5rem;
          border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03);
          color: #fff; transition: border-color .15s, background .15s; }
        .input:focus { outline: none; border-color: rgba(255,255,255,0.25); background: rgba(255,255,255,0.05); }
        .input::placeholder { color: rgba(255,255,255,0.32); }
        .btn-primary { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
          padding: 0.65rem 0.9rem; font-size: 0.875rem; font-weight: 500; border-radius: 0.5rem;
          background: #fff; color: #000; border: 1px solid transparent;
          transition: transform .12s ease, box-shadow .15s ease, background .15s; }
        .btn-primary:hover:not(:disabled) { background: #f0f0f0; transform: translateY(-1px); box-shadow: 0 8px 20px -10px rgba(255,255,255,0.4); }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </main>
  );
}

function Field({ label, children, right }: { label: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="block text-[11px] font-semibold tracking-[0.12em] text-white/70 font-mono">{label}</label>
        {right}
      </div>
      {children}
    </div>
  );
}
