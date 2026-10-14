import { createFileRoute } from "@tanstack/react-router";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";

const RegisterSchema = z.object({
  enrollment_code: z.string().min(8).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  pc_name: z.string().min(1).max(255),
  device_name: z.string().min(1).max(255).optional(),
  os: z.string().min(1).max(255).optional(),
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

export const Route = createFileRoute("/api/public/agent/register")({
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
        const parsed = RegisterSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Invalid input", details: parsed.error.flatten() },
            { status: 400 },
          );
        }
        const input = parsed.data;
        const ip = clientIp(request);

        const { data: device, error } = await supabaseAdmin
          .from("devices")
          .select("id, enrollment_code, device_token_hash")
          .eq("enrollment_code", input.enrollment_code)
          .maybeSingle();

        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (!device) {
          return Response.json({ error: "Invalid enrollment code" }, { status: 401 });
        }
        if (device.device_token_hash) {
          return Response.json(
            { error: "Enrollment code already used" },
            { status: 409 },
          );
        }

        const token = randomBytes(32).toString("hex");
        const token_hash = sha256(token);

        const { error: updErr } = await supabaseAdmin
          .from("devices")
          .update({
            device_token_hash: token_hash,
            enrollment_code: null,
            pc_name: input.pc_name,
            device_name: input.device_name ?? input.pc_name,
            os: input.os ?? null,
            username: input.username ?? null,
            ip_address: ip ?? "",
            last_seen_ip: ip,
            is_online: true,
            last_seen: new Date().toISOString(),
          })
          .eq("id", device.id);

        if (updErr) return Response.json({ error: updErr.message }, { status: 500 });

        await supabaseAdmin.from("audit_logs").insert({
          action: "device.register",
          device_id: device.id,
          ip,
          metadata: { pc_name: input.pc_name, os: input.os ?? null },
        });

        return Response.json({ device_id: device.id, device_token: token });
      },
    },
  },
});
