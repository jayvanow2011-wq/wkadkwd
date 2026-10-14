import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Gift, Loader2, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/FREE")({
  component: FreePage,
});

const MAX_CLAIMS = 5;

function FreePage() {
  const { user, authed, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [claimCount, setClaimCount] = useState<number | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!authed) {
      navigate({ to: "/" });
      return;
    }

    (async () => {
      const { count } = await supabase
        .from("free_claims")
        .select("id", { count: "exact", head: true });
      setClaimCount(count ?? 0);

      if (user) {
        const { data } = await supabase
          .from("free_claims")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data) setAlreadyClaimed(true);
      }
      setLoading(false);
    })();
  }, [authed, authLoading, user, navigate]);

  const claim = async () => {
    if (!user || busy) return;
    setBusy(true);

    // Double-check count
    const { count } = await supabase
      .from("free_claims")
      .select("id", { count: "exact", head: true });

    if ((count ?? 0) >= MAX_CLAIMS) {
      toast.error("All free spots have been claimed!");
      setBusy(false);
      return;
    }

    const { error } = await supabase
      .from("free_claims")
      .insert({ user_id: user.id } as any);

    if (error) {
      if (error.code === "23505") {
        setAlreadyClaimed(true);
        toast.error("You already claimed your free access!");
      } else {
        toast.error(error.message);
      }
      setBusy(false);
      return;
    }

    // Grant lifetime subscription
    await supabase.from("subscriptions").insert({
      user_id: user.id,
      plan: "lifetime_free",
      status: "active",
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString(),
      provider: "free_claim",
      amount_usd: 0,
      currency: "FREE",
    } as any);

    setClaimed(true);
    setClaimCount((c) => (c ?? 0) + 1);
    toast.success("You got lifetime free access!");
    setBusy(false);
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const spotsLeft = Math.max(0, MAX_CLAIMS - (claimCount ?? 0));
  const full = spotsLeft === 0 && !alreadyClaimed && !claimed;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-2xl animate-in fade-in zoom-in-95">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Gift className="h-8 w-8 text-primary" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight">Secret Free Access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The first {MAX_CLAIMS} users to find this page get <span className="font-semibold text-foreground">lifetime free access</span>.
        </p>

        <div className="mt-6 rounded-lg border border-border bg-secondary/40 p-4">
          <div className="text-3xl font-bold font-mono">{spotsLeft}</div>
          <div className="text-xs text-muted-foreground">spots remaining</div>
        </div>

        <div className="mt-6">
          {claimed ? (
            <div className="flex items-center justify-center gap-2 text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold">Claimed! You have lifetime access.</span>
            </div>
          ) : alreadyClaimed ? (
            <div className="flex items-center justify-center gap-2 text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold">You already claimed your free access!</span>
            </div>
          ) : full ? (
            <div className="flex items-center justify-center gap-2 text-red-400">
              <XCircle className="h-5 w-5" />
              <span className="font-semibold">All spots have been claimed. Sorry!</span>
            </div>
          ) : (
            <button
              onClick={claim}
              disabled={busy}
              className="w-full rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Claiming…" : "Claim Free Lifetime Access"}
            </button>
          )}
        </div>

        <p className="mt-4 text-[11px] text-muted-foreground">
          Shhh… don't share this page. 🤫
        </p>
      </div>
    </div>
  );
}
