import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createHash } from "crypto";

function hashToken(t: string) {
  return createHash("sha256").update(t.trim().toUpperCase()).digest("hex");
}

/** Lookup email by username (server-side, bypasses RLS). */
export const lookupEmailByUsername = createServerFn({ method: "POST" })
  .inputValidator((input: { username: string }) =>
    z.object({ username: z.string().min(1).max(64) }).parse(input)
  )
  .handler(async ({ data }) => {
    const u = data.username.trim().toLowerCase();
    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .ilike("username", u)
      .limit(1);
    if (error) throw new Error(error.message);
    return { email: rows?.[0]?.email ?? null };
  });

/** Store recovery token hash on the calling user's profile. */
export const setRecoveryToken = createServerFn({ method: "POST" })
  .inputValidator((input: { userId: string; token: string }) =>
    z.object({ userId: z.string().uuid(), token: z.string().min(16).max(64) }).parse(input)
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        recovery_token_hash: hashToken(data.token),
        recovery_token_set_at: new Date().toISOString(),
      })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Recover account: verify token, set new password, return email so client can sign in. */
export const recoverWithToken = createServerFn({ method: "POST" })
  .inputValidator((input: { username: string; token: string; newPassword: string }) =>
    z.object({
      username: z.string().min(1).max(64),
      token: z.string().min(16).max(64),
      newPassword: z.string().min(6).max(128),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const u = data.username.trim().toLowerCase();
    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, recovery_token_hash")
      .ilike("username", u)
      .limit(1);
    if (error) throw new Error(error.message);
    const row = rows?.[0];
    if (!row || !row.recovery_token_hash) {
      throw new Error("No recovery token on file for this account");
    }
    if (row.recovery_token_hash !== hashToken(data.token)) {
      throw new Error("Invalid recovery token");
    }
    const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(row.id, {
      password: data.newPassword,
    });
    if (upErr) throw new Error(upErr.message);
    return { email: row.email };
  });
