import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Gift, Copy, Users, Sparkles, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/dashboard/refer")({
  component: ReferPage,
});

type Referral = {
  id: string;
  referee_id: string;
  bonus_days_awarded: number;
  activated_at: string | null;
  created_at: string;
};

function ReferPage() {
  const { user } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: prof }, { data: refs }] = await Promise.all([
        supabase.from("profiles").select("referral_code").eq("id", user.id).maybeSingle(),
        supabase.from("referrals").select("*").eq("referrer_id", user.id).order("created_at", { ascending: false }),
      ]);
      setCode(prof?.referral_code ?? null);
      setReferrals((refs ?? []) as Referral[]);
      const ids = (refs ?? []).map((r) => r.referee_id);
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id,username,email").in("id", ids);
        const map: Record<string, string> = {};
        (profs ?? []).forEach((p) => (map[p.id] = p.username ?? p.email ?? "user"));
        setNames(map);
      }
      setLoading(false);
    })();
  }, [user]);

  const link = code ? `${window.location.origin}/signup?ref=${code}` : "";
  const activated = referrals.filter((r) => r.activated_at).length;
  const totalDays = referrals.reduce((acc, r) => acc + r.bonus_days_awarded, 0);
  const milestoneBonus = Math.floor(activated / 5) * 30;
  const grandTotal = totalDays + milestoneBonus;
  const nextMilestone = (Math.floor(activated / 5) + 1) * 5;
  const toNext = nextMilestone - activated;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-2">
        <Gift className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Refer & Earn</h1>
      </div>

      <section className="rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card p-6 shadow-xl">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Your referral link</p>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-sm break-all">
            {loading ? "…" : link || "—"}
          </div>
          <button
            disabled={!link}
            onClick={() => { navigator.clipboard.writeText(link); toast.success("Copied"); }}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          <b className="text-foreground">+30 days</b> per activated referral. Every 5 active = bonus <b className="text-foreground">+30 days</b>.
        </p>
      </section>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat icon={Users} label="Total signups" value={referrals.length} />
        <Stat icon={Sparkles} label="Activated" value={activated} accent />
        <Stat icon={TrendingUp} label="Days earned" value={grandTotal} suffix="d" />
        <Stat icon={Gift} label="To next bonus" value={toNext} suffix=" refs" />
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Your referrals</h2>
        {loading ? <p className="text-sm text-muted-foreground">Loading…</p> :
          referrals.length === 0 ? <p className="text-sm text-muted-foreground">—</p> :
          <ul className="divide-y divide-border/40">
            {referrals.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium">{names[r.referee_id] ?? r.referee_id.slice(0,8)}</span>
                <span className={`text-xs ${r.activated_at ? "text-primary" : "text-muted-foreground"}`}>
                  {r.activated_at ? `+${r.bonus_days_awarded}d • activated` : "pending"}
                </span>
              </li>
            ))}
          </ul>}
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value, suffix, accent }: { icon: any; label: string; value: number; suffix?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
      <Icon className={`h-4 w-4 ${accent ? "text-primary" : "text-muted-foreground"}`} />
      <div className="mt-2 text-2xl font-bold tracking-tight">{value}{suffix ?? ""}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
