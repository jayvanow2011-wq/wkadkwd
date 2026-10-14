import { Lock, CreditCard, Clock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { formatCountdown } from "@/lib/use-subscription";

export function SubscriptionLock({ expiresAt }: { expiresAt: Date | null }) {
  return (
    <div className="fixed inset-0 top-[6rem] z-40 flex items-start justify-center bg-background/85 backdrop-blur-md p-6">
      <div className="mt-12 max-w-md rounded-2xl border border-destructive/40 bg-card p-8 shadow-2xl text-center animate-in fade-in zoom-in-95">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <Lock className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-xl font-semibold">Access locked</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {expiresAt
            ? `Your subscription expired on ${expiresAt.toLocaleString()}.`
            : "You don't have an active subscription."}
        </p>
        <p className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1">
          <Clock className="h-3 w-3" /> Renew to unlock all features.
        </p>
        <Link
          to="/dashboard/subs"
          className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition"
        >
          <CreditCard className="h-4 w-4" /> Renew license
        </Link>
        <p className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">
          Tip: earn free days by referring friends.
        </p>
      </div>
    </div>
  );
}

export function CountdownBadge({ msLeft }: { msLeft: number }) {
  const low = msLeft < 1000 * 60 * 60 * 24; // < 24h
  const tone = !isFinite(msLeft)
    ? "border-primary/40 text-primary bg-primary/10"
    : low
      ? "border-destructive/50 text-destructive bg-destructive/10 animate-pulse"
      : "border-border/60 text-muted-foreground bg-muted/30";
  return (
    <span className={`hidden md:inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${tone}`}>
      <Clock className="h-3 w-3" /> {formatCountdown(msLeft)}
    </span>
  );
}
