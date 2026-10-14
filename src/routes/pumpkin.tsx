import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/pumpkin")({
  head: () => ({
    meta: [
      { title: "??? — VeltrixRAT" },
      { name: "description", content: "A secret autumn page. If you found it, you earned it." },
      { property: "og:title", content: "???" },
      { name: "twitter:title", content: "???" },
      { property: "og:description", content: "A secret autumn page." },
      { name: "twitter:description", content: "A secret autumn page." },
      { name: "twitter:card", content: "summary" },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PumpkinPage,
});

function PumpkinPage() {
  const { authed } = useAuth();
  const [claimingPumpkin, setClaimingPumpkin] = useState(false);
  const [pumpkinClaimed, setPumpkinClaimed] = useState(false);
  const [code, setCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  const claimPumpkin = async () => {
    if (!authed) { toast.error("Sign in first to claim."); return; }
    if (claimingPumpkin || pumpkinClaimed) return;
    setClaimingPumpkin(true);
    const { data, error } = await supabase.rpc("claim_secret_pumpkin");
    setClaimingPumpkin(false);
    if (error) { toast.error("The pumpkin slipped away."); return; }
    const res = data as { ok?: boolean; message?: string } | null;
    if (res?.ok) {
      toast.success(res.message ?? "+3 days of access!");
      setPumpkinClaimed(true);
    } else {
      toast.info(res?.message ?? "Nothing happened.");
    }
  };

  const submitCode = async () => {
    if (!authed) { toast.error("Sign in first to redeem."); return; }
    const c = code.trim().toLowerCase();
    if (!c) return;
    setCodeBusy(true);
    const { data, error } = await (supabase.rpc as any)("claim_veltrix_code", { _code: c });
    setCodeBusy(false);
    if (error) { toast.error("Could not redeem that code."); return; }
    const res = data as unknown as { ok?: boolean; message?: string; days?: number } | null;
    if (res?.ok) {
      setCode("");
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 6000);
    } else {
      toast.error(res?.message ?? "Invalid code.");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* ambient autumn gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-orange-950/40 via-background to-amber-950/30" />

      <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16">
        <Link to="/" className="absolute left-4 top-4 text-xs text-muted-foreground hover:text-foreground">← home</Link>

        <div className="text-center">
          <div className="text-7xl drop-shadow-[0_0_30px_rgba(234,88,12,0.5)] select-none">🎃</div>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">You found it.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A hidden pumpkin, grown deep in the autumn code.
          </p>
        </div>

        <button
          onClick={claimPumpkin}
          disabled={!authed || claimingPumpkin || pumpkinClaimed}
          className="mt-8 rounded-xl bg-orange-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-900/40 transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pumpkinClaimed ? "+3 days claimed 🎃" : claimingPumpkin ? "Claiming…" : "Click the pumpkin — +3 days"}
        </button>
        {!authed && (
          <p className="mt-3 text-xs text-muted-foreground">Sign in to claim.</p>
        )}

        <div className="mt-12 w-full max-w-sm rounded-2xl border border-orange-900/40 bg-black/40 p-5 backdrop-blur">
          <div className="text-xs uppercase tracking-widest text-orange-400/80">Secret code</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Whisper the right word and the harvest answers back.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitCode()}
              placeholder="enter secret code"
              className="flex-1 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm outline-none transition focus:border-orange-500/60"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              onClick={submitCode}
              disabled={codeBusy || !code.trim()}
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-500 disabled:opacity-50"
            >
              {codeBusy ? "…" : "Redeem"}
            </button>
          </div>
        </div>
      </div>

      {celebrate && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setCelebrate(false)}>
          <div
            className="relative w-full max-w-md rounded-3xl bg-orange-500 p-8 text-center shadow-2xl shadow-orange-900/60 ring-4 ring-orange-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-6xl">🎃</div>
            <div className="mt-4 text-3xl font-black uppercase tracking-tight text-black">
              3 Months Free
            </div>
            <div className="mt-2 text-lg font-semibold text-black">
              Veltrix — enjoy
            </div>
            <button
              onClick={() => setCelebrate(false)}
              className="mt-6 rounded-xl bg-black px-6 py-2 text-sm font-semibold text-orange-400 transition hover:bg-neutral-900"
            >
              Thanks!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
