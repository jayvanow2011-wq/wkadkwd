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

export const adminAdjustDays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid(), days: z.number().int().min(-3650).max(3650) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await (supabase.rpc as any)("admin_adjust_subscription", {
      _target_user: data.user_id,
      _days: data.days,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminBanUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid(), reason: z.string().min(1).max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    // Ban the user: cancel sub + mark profile as banned
    const { error } = await (supabase.rpc as any)("admin_ban_user", { _target_user: data.user_id });
    if (error) throw new Error(error.message);
    const { error: e2 } = await supabase
      .from("profiles")
      .update({ is_banned: true, ban_reason: data.reason ?? "Banned by admin" })
      .eq("id", data.user_id);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });

export const adminUnbanUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("profiles")
      .update({ is_banned: false, ban_reason: null })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminRemoveUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    // Mark as removed (soft-delete), cancel sub
    const { error } = await (supabase.rpc as any)("admin_ban_user", { _target_user: data.user_id });
    if (error) throw new Error(error.message);
    const { error: e2 } = await supabase
      .from("profiles")
      .update({ is_removed: true })
      .eq("id", data.user_id);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });
