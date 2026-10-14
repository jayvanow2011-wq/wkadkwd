import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";
import { z } from "zod";

const Schema = z.object({
  device_id: z.string().uuid(),
  device_token: z.string().min(32).max(128).regex(/^[a-f0-9]+$/),
});

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/public/agent/poll")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
        }
        const parsed = Schema.safeParse(body);
        if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400, headers: CORS });
        const { device_id, device_token } = parsed.data;

        const { data: device } = await supabaseAdmin
          .from("devices")
          .select("id, device_token_hash")
          .eq("id", device_id)
          .maybeSingle();
        if (!device?.device_token_hash || sha256(device_token) !== device.device_token_hash) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
        }

        await supabaseAdmin
          .from("devices")
          .update({ is_online: true, last_seen: new Date().toISOString() })
          .eq("id", device_id);

        const { data: pending } = await supabaseAdmin
          .from("commands")
          .select("id, action, payload")
          .eq("device_id", device_id)
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(20);

        const ids = (pending ?? []).map((c) => c.id);
        if (ids.length) {
          await supabaseAdmin
            .from("commands")
            .update({ status: "running" } as any)
            .in("id", ids as any);
        }

        return Response.json({ commands: pending ?? [] }, { headers: CORS });
      },
    },
  },
});
