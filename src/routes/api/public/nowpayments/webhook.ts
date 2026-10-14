import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

// Stable-stringify with sorted keys (NowPayments signs the sorted JSON)
function sortedStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(sortedStringify).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + sortedStringify(obj[k]))
      .join(",") +
    "}"
  );
}

const PLAN_DAYS: Record<string, number> = {
  "1week": 7,
  "1month": 30,
  "3months": 90,
  "6months": 180,
  "1year": 365,
  "lifetime": 36500,
};
const BONUS = 1.2; // summer sale

export const Route = createFileRoute("/api/public/nowpayments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
        if (!ipnSecret) return new Response("not configured", { status: 500 });

        const signature = request.headers.get("x-nowpayments-sig");
        const raw = await request.text();
        if (!signature) return new Response("missing sig", { status: 401 });

        let payload: any;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("bad json", { status: 400 });
        }

        const expected = createHmac("sha512", ipnSecret)
          .update(sortedStringify(payload))
          .digest("hex");

        const sigBuf = Buffer.from(signature, "utf8");
        const expBuf = Buffer.from(expected, "utf8");
        if (
          sigBuf.length !== expBuf.length ||
          !timingSafeEqual(sigBuf, expBuf)
        ) {
          return new Response("invalid sig", { status: 401 });
        }

        const status = String(payload.payment_status ?? "");
        const orderId = String(payload.order_id ?? "");
        const invoiceId = payload.invoice_id
          ? String(payload.invoice_id)
          : payload.payment_id
            ? String(payload.payment_id)
            : null;

        // order_id format: `${userId}__${planId}__${ts}`
        const [userId, planId] = orderId.split("__");
        if (!userId || !planId)
          return new Response("bad order", { status: 400 });

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        if (status === "finished" || status === "confirmed") {
          const baseDays = PLAN_DAYS[planId] ?? 30;
          const days = planId === "lifetime" ? baseDays : Math.round(baseDays * BONUS);
          const now = new Date();
          const expires = new Date(now.getTime() + days * 86400 * 1000);

          // Update pending subscription matching this invoice, or insert active row
          if (invoiceId) {
            const { data: updated } = await supabaseAdmin
              .from("subscriptions")
              .update({
                status: "active",
                started_at: now.toISOString(),
                expires_at: expires.toISOString(),
              })
              .eq("user_id", userId)
              .eq("provider_payment_id", invoiceId)
              .select("id");

            if (!updated || updated.length === 0) {
              await supabaseAdmin.from("subscriptions").insert({
                user_id: userId,
                plan: planId,
                status: "active",
                started_at: now.toISOString(),
                expires_at: expires.toISOString(),
                provider: "nowpayments",
                provider_payment_id: invoiceId,
                amount_usd: Number(payload.price_amount ?? 0),
                currency: String(payload.pay_currency ?? "BTC").toUpperCase(),
              } as any);
            }
          }
        } else if (
          status === "failed" ||
          status === "expired" ||
          status === "refunded"
        ) {
          if (invoiceId) {
            await supabaseAdmin
              .from("subscriptions")
              .update({ status })
              .eq("user_id", userId)
              .eq("provider_payment_id", invoiceId);
          }
        }

        return new Response("ok");
      },
    },
  },
});
