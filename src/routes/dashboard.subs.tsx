import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useSubscription, formatCountdown } from "@/lib/use-subscription";
import { getEthQuote, createEthOrder, checkEthPayment, checkWalletBalance } from "@/lib/payments.functions";
import { Clock, Check, Loader2, Sparkles, ArrowUp, Snowflake, Copy, ExternalLink, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/dashboard/subs")({ component: SubsPage });

const WINTER_BONUS = 1.2; // 1.2x winter sale
const PLANS: { id: string; label: string; eur: number; days: number; popular?: boolean; best?: boolean }[] = [
  { id: "3days", label: "3 Days", eur: 10, days: 3 },
  { id: "30days", label: "30 Days", eur: 20, days: 30, popular: true },
  { id: "3months", label: "3 Months", eur: 35, days: 90 },
  { id: "6months", label: "6 Months", eur: 45, days: 180, best: true },
  { id: "lifetime", label: "Lifetime", eur: 70, days: 36500 },
];

type PendingOrder = {
  id: string;
  plan: string;
  provider_payment_id: string;
  eth_amount: number;
  sender_address: string;
  created_at: string;
};

type ModalStep = "confirm" | "send" | "address" | "waiting";

function SubsPage() {
  const { user } = useAuth();
  const sub = useSubscription(user?.id);
  const [payEnabled, setPayEnabled] = useState(true);
  const [winterSale, setWinterSale] = useState<{ enabled: boolean; multiplier: number }>({ enabled: true, multiplier: 1.2 });
  const [payMode, setPayMode] = useState<"live" | "sandbox">("live");

  // Modal state
  const [selectedPlan, setSelectedPlan] = useState<typeof PLANS[0] | null>(null);
  const [modalStep, setModalStep] = useState<ModalStep | null>(null);
  const [ethQuote, setEthQuote] = useState<{ ethAmount: number; address: string } | null>(null);
  const [senderAddress, setSenderAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [balanceWarning, setBalanceWarning] = useState<string | null>(null);

  // Pending orders
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [checkingOrder, setCheckingOrder] = useState<string | null>(null);

  const quote = useServerFn(getEthQuote);
  const order = useServerFn(createEthOrder);
  const checkPay = useServerFn(checkEthPayment);
  const checkBal = useServerFn(checkWalletBalance);

  useEffect(() => {
    supabase.from("app_settings").select("key,value").in("key", ["payments", "winter_sale"])
      .then(({ data }) => {
        for (const row of data ?? []) {
          if (row.key === "payments") {
            const v = (row.value ?? {}) as { enabled?: boolean; mode?: "live" | "sandbox" };
            setPayEnabled(v.enabled !== false);
            setPayMode(v.mode === "sandbox" ? "sandbox" : "live");
          }
          if (row.key === "winter_sale") {
            const v = (row.value ?? {}) as { enabled?: boolean; multiplier?: number };
            setWinterSale({ enabled: v.enabled !== false, multiplier: v.multiplier ?? 1.2 });
          }
        }
      });
  }, []);


  const loadPending = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("subscriptions")
      .select("id,plan,provider_payment_id,eth_amount,sender_address,created_at")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .in("provider", ["eth", "eth_test"])
      .order("created_at", { ascending: false });
    setPendingOrders((data ?? []) as unknown as PendingOrder[]);
  }, [user]);

  useEffect(() => { loadPending(); }, [loadPending]);

  // Auto-check pending orders every 30s
  useEffect(() => {
    if (pendingOrders.length === 0) return;
    const interval = setInterval(async () => {
      for (const o of pendingOrders) {
        try {
          const res = await checkPay({ data: { orderId: o.provider_payment_id } });
          if (res.status === "confirmed") {
            toast.success("Payment confirmed! Subscription activated.");
            loadPending();
            break;
          }
        } catch {}
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [pendingOrders]);

  const handlePlanClick = async (plan: typeof PLANS[0]) => {
    if (!payEnabled) { toast.error("Payments are temporarily disabled."); return; }
    setSelectedPlan(plan);
    setModalStep("confirm");
  };

  const handleConfirm = async () => {
    if (!selectedPlan) return;
    setBusy(true);
    try {
      const res = await quote({ data: { planId: selectedPlan.id } });
      setEthQuote({ ethAmount: res.ethAmount, address: res.address });
      setModalStep("send");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to get quote");
    }
    setBusy(false);
  };

  const handleSendNext = () => {
    setSenderAddress("");
    setBalanceWarning(null);
    setModalStep("address");
  };

  const handleSubmitAddress = async () => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(senderAddress)) {
      toast.error("Invalid ETH address");
      return;
    }
    if (!ethQuote || !selectedPlan || !user) return;
    setBusy(true);
    setBalanceWarning(null);

    // Check balance
    try {
      const bal = await checkBal({ data: { address: senderAddress, requiredEth: ethQuote.ethAmount } });
      if (!bal.sufficient) {
        setBalanceWarning(`Insufficient balance: ${bal.balance?.toFixed(6) ?? "?"} ETH. You need ${ethQuote.ethAmount} ETH.`);
        setBusy(false);
        return;
      }
    } catch {}

    // Create order
    try {
      const res = await order({ data: { planId: selectedPlan.id, senderAddress, ethAmount: ethQuote.ethAmount } });
      if ((res as any).test) {
        toast.success("Test payment — subscription activated!");
        closeModal();
      } else {
        setModalStep("waiting");
        loadPending();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create order");
    }
    setBusy(false);
  };

  const handleCheckOrder = async (orderId: string) => {
    setCheckingOrder(orderId);
    try {
      const res = await checkPay({ data: { orderId } });
      if (res.status === "confirmed") {
        toast.success("Payment confirmed! Subscription activated.");
        loadPending();
      } else {
        toast.info("Payment not yet received. Keep waiting…");
      }
    } catch {
      toast.error("Check failed");
    }
    setCheckingOrder(null);
  };

  const closeModal = () => {
    setSelectedPlan(null);
    setModalStep(null);
    setEthQuote(null);
    setSenderAddress("");
    setBalanceWarning(null);
  };

  const copyAddr = (addr: string) => {
    navigator.clipboard.writeText(addr);
    toast.success("Copied!");
  };

  const low = sub.active && isFinite(sub.msLeft) && sub.msLeft < 1000 * 60 * 60 * 24 * 3;
  const BONUS = winterSale.enabled ? winterSale.multiplier : 1.0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
          {payMode === "sandbox" && (
            <span className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-yellow-500">Test mode</span>
          )}
          {!payEnabled && (
            <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-destructive">Disabled</span>
          )}
        </div>
      </div>

      {/* Winter sale banner */}
      {winterSale.enabled && (
      <div className="relative overflow-hidden rounded-xl border border-sky-400/30 bg-gradient-to-br from-sky-950/40 via-card to-card p-5">
        <div className="absolute inset-0 -z-10 opacity-20" style={{ background: "radial-gradient(600px circle at 0% 0%, oklch(0.7 0.15 220 / 0.4), transparent 60%), radial-gradient(500px circle at 100% 100%, oklch(0.7 0.1 250 / 0.3), transparent 55%)" }} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-sky-400/30 bg-sky-950/40">
              <Snowflake className="h-5 w-5 text-sky-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                ❄️ Winter Sale
                <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-300">Limited</span>
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-mono text-sky-300">×{BONUS}</span> longer subscriptions, auto-applied.
              </div>
            </div>
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            <span className="text-sky-300">+{Math.round((BONUS - 1) * 100)}%</span> bonus days
          </div>
        </div>
      </div>
      )}

      {/* Status card */}
      {sub.loading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading…</div>
      ) : sub.active ? (
        <div className={`rounded-xl border bg-card p-5 ${low ? "border-destructive/60" : "border-border"}`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Check className={`h-4 w-4 ${low ? "text-destructive" : "text-foreground"}`} />
                <span className="text-base font-semibold capitalize">
                  {sub.isAdmin ? "Admin access" : (sub.plan ?? "active").replace("_", " ")}
                </span>
              </div>
              {sub.expiresAt && <p className="mt-1 text-xs text-muted-foreground">Expires {sub.expiresAt.toLocaleString()}</p>}
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1 justify-end">
                <Clock className="h-3 w-3" /> Remaining
              </p>
              <p className={`font-mono text-xl font-bold ${low ? "text-destructive" : "text-foreground"}`}>
                {formatCountdown(sub.msLeft)}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-destructive/40 bg-card p-5">
          <p className="text-sm font-medium text-destructive">No active subscription.</p>
        </div>
      )}

      {/* Pending ETH Orders */}
      {pendingOrders.length > 0 && (
        <div className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Loader2 className="h-4 w-4 animate-spin" /> Pending Orders
          </h2>
          {pendingOrders.map((o) => (
            <div key={o.id} className="rounded-xl border border-yellow-500/40 bg-yellow-500/5 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium capitalize">{(o.plan ?? "").replace("_", " ")}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{o.eth_amount} ETH</span>
                </div>
                <span className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-yellow-500">
                  Waiting
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>From: <span className="font-mono text-foreground">{o.sender_address?.slice(0, 8)}…{o.sender_address?.slice(-6)}</span></span>
              </div>
              <button
                onClick={() => handleCheckOrder(o.provider_payment_id)}
                disabled={checkingOrder === o.provider_payment_id}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
              >
                {checkingOrder === o.provider_payment_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
                Check payment
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Plans */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          {sub.active ? <><ArrowUp className="h-4 w-4" /> Extend or upgrade</> : <><Sparkles className="h-4 w-4" /> Choose a plan</>}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PLANS.map((plan) => {
            const bonusDays = Math.round(plan.days * (BONUS - 1));
            return (
              <button
                key={plan.id}
                onClick={() => handlePlanClick(plan)}
                className={`group relative flex flex-col items-start gap-1.5 rounded-xl border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-foreground/40 ${
                  plan.best ? "border-foreground/40" : "border-border"
                }`}
              >
                {plan.popular && <span className="absolute right-3 top-3 rounded-full border border-foreground/30 bg-foreground/10 px-1.5 py-0.5 text-[9px] font-bold uppercase">Popular</span>}
                {plan.best && <span className="absolute right-3 top-3 rounded-full bg-foreground px-1.5 py-0.5 text-[9px] font-bold uppercase text-background">Best</span>}
                <span className="text-xs text-muted-foreground">{plan.label}</span>
                <span className="text-2xl font-bold tracking-tight">€{plan.eur}</span>
                {plan.id !== "lifetime" && bonusDays > 0 && (
                  <span className="rounded-full border border-sky-400/30 px-1.5 py-0.5 text-[10px] font-mono text-sky-300">
                    +{bonusDays}d ❄️ winter bonus
                  </span>
                )}
                <span className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">ETH</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Payment Modal */}
      {modalStep && selectedPlan && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={closeModal}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 space-y-4">

            {/* Step 1: Confirm purchase */}
            {modalStep === "confirm" && (
              <>
                <h3 className="text-lg font-semibold">Purchase {selectedPlan.label}?</h3>
                <p className="text-sm text-muted-foreground">
                  €{selectedPlan.eur} — paid in ETH at current market rate.
                </p>
                <div className="flex gap-2">
                  <button onClick={closeModal} className="flex-1 rounded-md border border-border bg-secondary px-4 py-2 text-sm hover:bg-accent">Cancel</button>
                  <button onClick={handleConfirm} disabled={busy} className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                    {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Yes, continue"}
                  </button>
                </div>
              </>
            )}

            {/* Step 2: Show ETH amount + address */}
            {modalStep === "send" && ethQuote && (
              <>
                <h3 className="text-lg font-semibold">Send ETH</h3>
                <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-2">
                  <div className="text-xs text-muted-foreground">Amount</div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xl font-bold">{ethQuote.ethAmount} ETH</span>
                    <button onClick={() => copyAddr(String(ethQuote.ethAmount))} className="rounded p-1 hover:bg-accent"><Copy className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-2">
                  <div className="text-xs text-muted-foreground">Send to address</div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs break-all">{ethQuote.address}</span>
                    <button onClick={() => copyAddr(ethQuote.address)} className="shrink-0 rounded p-1 hover:bg-accent"><Copy className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">Send exactly this amount. The rate is locked for this order.</p>
                <div className="flex gap-2">
                  <button onClick={closeModal} className="flex-1 rounded-md border border-border bg-secondary px-4 py-2 text-sm hover:bg-accent">Cancel</button>
                  <button onClick={handleSendNext} className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                    I sent it →
                  </button>
                </div>
              </>
            )}

            {/* Step 3: Enter sender address */}
            {modalStep === "address" && (
              <>
                <h3 className="text-lg font-semibold">Your ETH address</h3>
                <p className="text-xs text-muted-foreground">Enter the wallet address you sent from so we can verify the payment.</p>
                <input
                  value={senderAddress}
                  onChange={(e) => setSenderAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm font-mono outline-none focus:border-primary"
                />
                {balanceWarning && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {balanceWarning}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={closeModal} className="flex-1 rounded-md border border-border bg-secondary px-4 py-2 text-sm hover:bg-accent">Cancel</button>
                  <button onClick={handleSubmitAddress} disabled={busy} className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                    {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Confirm"}
                  </button>
                </div>
              </>
            )}

            {/* Step 4: Waiting */}
            {modalStep === "waiting" && (
              <>
                <div className="flex flex-col items-center gap-3 py-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <h3 className="text-lg font-semibold">Waiting for payment</h3>
                  <p className="text-center text-xs text-muted-foreground">
                    Your order is saved. We're checking the blockchain for your transaction. This may take a few minutes.
                  </p>
                </div>
                <button onClick={closeModal} className="w-full rounded-md border border-border bg-secondary px-4 py-2 text-sm hover:bg-accent">
                  Close (order saved below)
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
