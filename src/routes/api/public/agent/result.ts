import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";
import { z } from "zod";

const Schema = z.object({
  device_id: z.string().uuid(),
  device_token: z.string().min(32).max(128).regex(/^[a-f0-9]+$/),
  // Accept any string; we no-op on non-UUID so older agents don't 400-spam.
  command_id: z.string().min(0).max(128),
  ok: z.boolean(),
  result: z.any().nullable().optional(),
  error: z.string().max(4000).nullable().optional(),
});
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

export const Route = createFileRoute("/api/public/agent/result")({
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
        const parsed = Schema.safeParse(body);
        if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });
        const { device_id, device_token, command_id, ok, result, error } = parsed.data;

        const { data: device } = await supabaseAdmin
          .from("devices")
          .select("id, device_token_hash")
          .eq("id", device_id)
          .maybeSingle();
        if (!device?.device_token_hash || sha256(device_token) !== device.device_token_hash) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (UUID_RE.test(command_id)) {
          await supabaseAdmin
            .from("commands")
            .update({
              status: ok ? "done" : "error",
              result: result ?? null,
              error: error ?? null,
              completed_at: new Date().toISOString(),
            })
            .eq("id", command_id)
            .eq("device_id", device_id);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
