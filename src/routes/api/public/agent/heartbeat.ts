import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";
import { z } from "zod";

const HeartbeatSchema = z.object({
  device_id: z.string().uuid(),
  device_token: z.string().min(32).max(128).regex(/^[a-f0-9]+$/),
  metrics: z
    .object({
      cpu_percent: z.number().min(0).max(100).optional(),
      ram_percent: z.number().min(0).max(100).optional(),
      ram_used_mb: z.number().int().min(0).max(2_000_000).optional(),
      ram_total_mb: z.number().int().min(0).max(2_000_000).optional(),
      gpu_percent: z.number().min(0).max(100).optional(),
      gpu_info: z.string().max(255).optional(),
      network_rx_kbps: z.number().min(0).max(10_000_000).optional(),
      network_tx_kbps: z.number().min(0).max(10_000_000).optional(),
      uptime_seconds: z.number().int().min(0).max(31_536_000).optional(),
    })
    .optional(),
  username: z.string().min(1).max(255).optional(),
});

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

function clientIp(req: Request) {
  const h = req.headers;
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null
  );
}

export const Route = createFileRoute("/api/public/agent/heartbeat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const parsed = HeartbeatSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "Invalid input" }, { status: 400 });
        }
        const { device_id, device_token, metrics, username } = parsed.data;
        const ip = clientIp(request);

        const { data: device } = await supabaseAdmin
          .from("devices")
          .select("id, device_token_hash")
          .eq("id", device_id)
          .maybeSingle();

        if (!device || !device.device_token_hash) {
          console.warn(`[agent] heartbeat unauthorized missing device=${device_id} ip=${ip ?? "unknown"}`);
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (sha256(device_token) !== device.device_token_hash) {
          console.warn(`[agent] heartbeat unauthorized bad token device=${device_id} ip=${ip ?? "unknown"}`);
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        await supabaseAdmin
          .from("devices")
          .update({
            is_online: true,
            last_seen: new Date().toISOString(),
            last_seen_ip: ip,
            ...(username ? { username } : {}),
          })
          .eq("id", device_id);

        console.log(`[agent] heartbeat ✓ ${device_id} ip=${ip ?? "unknown"}`);

        if (metrics) {
          await supabaseAdmin.from("device_metrics").insert({
            device_id,
            cpu_percent: metrics.cpu_percent ?? null,
            ram_percent: metrics.ram_percent ?? null,
            ram_used_mb: metrics.ram_used_mb ?? null,
            ram_total_mb: metrics.ram_total_mb ?? null,
            gpu_percent: metrics.gpu_percent ?? null,
            gpu_info: metrics.gpu_info ?? null,
            network_rx_kbps: metrics.network_rx_kbps ?? null,
            network_tx_kbps: metrics.network_tx_kbps ?? null,
            uptime_seconds: metrics.uptime_seconds ?? null,
          });
        }

        return Response.json({ ok: true, next_interval_seconds: 10 });
      },
    },
  },
});
