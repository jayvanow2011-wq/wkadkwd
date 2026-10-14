import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Admin only");
}

export const getBuildServerConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase
      .from("build_server_config")
      .select("id,key,label,buildserver_url,created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { config: data ?? null };
  });

// Public version (no role check, only returns the URL) used by the keep-alive ping.
export const getBuildServerUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase
      .from("build_server_config")
      .select("buildserver_url")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { url: data?.buildserver_url ?? null };
  });

const UpdateInput = z.object({
  buildserver_url: z.string().url().max(255).nullable(),
  label: z.string().min(1).max(40).optional(),
});

export const updateBuildServerConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: existing } = await supabase
      .from("build_server_config")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("build_server_config")
        .update({
          buildserver_url: data.buildserver_url,
          ...(data.label ? { label: data.label } : {}),
        } as any)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // No row yet — create one with a random key so it can be rotated later.
    const key =
      "bsk_" +
      Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    const { error } = await supabase
      .from("build_server_config")
      .insert({
        key,
        label: data.label ?? "default",
        buildserver_url: data.buildserver_url,
      } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rotateBuildServerKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const key =
      "bsk_" +
      Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    const { data: existing } = await supabase
      .from("build_server_config")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      await supabase.from("build_server_config").update({ key } as any).eq("id", existing.id);
    } else {
      await supabase.from("build_server_config").insert({ key, label: "default" } as any);
    }
    return { ok: true, key };
  });
