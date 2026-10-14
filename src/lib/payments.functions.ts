import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PLANS: Record<string, { label: string; eur: number; days: number }> = {
  "3days": { label: "3 Days", eur: 10, days: 3 },
  "30days": { label: "30 Days", eur: 20, days: 30 },
  "3months": { label: "3 Months", eur: 35, days: 90 },
  "6months": { label: "6 Months", eur: 45, days: 180 },
  "lifetime": { label: "Lifetime", eur: 70, days: 36500 },
};

const ETH_RECEIVE_ADDRESS = "0x6D752df8df10b3A2c7D4492b8e298fC1E1F34b8a";
const BONUS = 1.2;

/** Get current ETH price in USD from CoinGecko (free, no key) */
async function getEthPrice(): Promise<number> {
  const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error("Failed to fetch ETH price");
  const data = await res.json();
  return data.ethereum.usd as number;
}

/** Get ETH price for a plan */
export const getEthQuote = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ planId: z.string().min(1).max(20) }).parse(input),
  )
  .handler(async ({ data }) => {
    const plan = PLANS[data.planId];
    if (!plan) throw new Error("Invalid plan");
    const ethPrice = await getEthPrice();
    // Round to 6 decimals
    const ethAmount = Math.ceil((plan.eur / ethPrice) * 1e6) / 1e6;
    return { ethAmount, ethPrice, eur: plan.eur, address: ETH_RECEIVE_ADDRESS };
  });

/** Create a pending ETH order */
export const createEthOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      planId: z.string().min(1).max(20),
      senderAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      ethAmount: z.number().positive(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const plan = PLANS[data.planId];
    if (!plan) throw new Error("Invalid plan");

    // Check settings
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settingsRow } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "payments")
      .maybeSingle();
    const settings = (settingsRow?.value ?? {}) as { enabled?: boolean; mode?: "live" | "sandbox" };
    if (settings.enabled === false) throw new Error("Payments are currently disabled");
    const mode = settings.mode === "sandbox" ? "sandbox" : "live";

    // Sandbox: auto-confirm
    if (mode === "sandbox") {
      const days = Math.round(plan.days * BONUS);
      const now = new Date();
      const { data: existing } = await supabaseAdmin
        .from("subscriptions")
        .select("expires_at")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const base = existing?.expires_at && new Date(existing.expires_at) > now
        ? new Date(existing.expires_at) : now;
      const expires = new Date(base.getTime() + days * 86400000);

      await supabaseAdmin.from("subscriptions").insert({
        user_id: userId,
        plan: data.planId,
        status: "active",
        started_at: now.toISOString(),
        expires_at: expires.toISOString(),
        provider: "eth_test",
        provider_payment_id: `test_${Date.now()}`,
        amount_usd: plan.eur,
        currency: "ETH",
        sender_address: data.senderAddress,
        eth_amount: data.ethAmount,
      });
      return { ok: true as const, test: true as const };
    }

    // Live: insert pending order
    const orderId = `eth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { error } = await supabaseAdmin.from("subscriptions").insert({
      user_id: userId,
      plan: data.planId,
      status: "pending",
      provider: "eth",
      provider_payment_id: orderId,
      amount_usd: plan.eur,
      currency: "ETH",
      sender_address: data.senderAddress,
      eth_amount: data.ethAmount,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, orderId };
  });

/** Check pending ETH orders for confirmed transactions */
export const checkEthPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ orderId: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("provider_payment_id", data.orderId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();

    if (!order) return { status: "not_found" as const };

    const senderAddr = (order as any).sender_address as string;
    const expectedEth = Number((order as any).eth_amount);
    if (!senderAddr || !expectedEth) return { status: "pending" as const };

    // Check Etherscan for transactions from sender to our address
    try {
      const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${ETH_RECEIVE_ADDRESS}&startblock=0&endblock=99999999&sort=desc&page=1&offset=50`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const json = await res.json();

      if (json.status !== "1" || !Array.isArray(json.result)) {
        return { status: "pending" as const };
      }

      // Find a tx from sender with matching amount (within 1% tolerance for gas)
      const expectedWei = BigInt(Math.round(expectedEth * 1e18));
      const tolerance = expectedWei / 100n; // 1%

      for (const tx of json.result) {
        if (tx.from?.toLowerCase() !== senderAddr.toLowerCase()) continue;
        if (tx.to?.toLowerCase() !== ETH_RECEIVE_ADDRESS.toLowerCase()) continue;
        if (tx.isError === "1") continue;

        const txValue = BigInt(tx.value);
        const diff = txValue > expectedWei ? txValue - expectedWei : expectedWei - txValue;
        if (diff <= tolerance) {
          // Found matching tx — activate subscription
          const plan = PLANS[order.plan ?? ""] ?? { days: 30 };
          const days = Math.round(plan.days * BONUS);
          const now = new Date();
          const { data: existing } = await supabaseAdmin
            .from("subscriptions")
            .select("expires_at")
            .eq("user_id", userId)
            .eq("status", "active")
            .order("expires_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const base = existing?.expires_at && new Date(existing.expires_at) > now
            ? new Date(existing.expires_at) : now;
          const expires = new Date(base.getTime() + days * 86400000);

          await supabaseAdmin
            .from("subscriptions")
            .update({
              status: "active",
              started_at: now.toISOString(),
              expires_at: expires.toISOString(),
              tx_hash: tx.hash,
            })
            .eq("id", order.id);

          return { status: "confirmed" as const, txHash: tx.hash };
        }
      }

      return { status: "pending" as const };
    } catch {
      return { status: "pending" as const };
    }
  });

/** Check if sender wallet has enough ETH balance */
export const checkWalletBalance = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      requiredEth: z.number().positive(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const url = `https://api.etherscan.io/api?module=account&action=balance&address=${data.address}&tag=latest`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const json = await res.json();
      if (json.status !== "1") return { sufficient: true }; // fail open
      const balanceWei = BigInt(json.result);
      const balanceEth = Number(balanceWei) / 1e18;
      return { sufficient: balanceEth >= data.requiredEth, balance: balanceEth };
    } catch {
      return { sufficient: true }; // fail open
    }
  });
