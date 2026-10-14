import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Generate a new TOTP secret for the current user, persist (not enabled yet),
// return the secret + otpauth URL + QR data URL.
export const generateTotp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { generateSecret, generateURI } = await import("otplib");
    const QRCode = (await import("qrcode")).default;
    const secret = generateSecret();
    const { data: prof } = await context.supabase
      .from("profiles").select("username,email").eq("id", context.userId).maybeSingle();
    const label = prof?.username || prof?.email || "user";
    const otpauth = generateURI({ issuer: "zip-prep-pal.xyz", label, secret });
    const qr = await QRCode.toDataURL(otpauth, { margin: 1, scale: 6 });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("profiles")
      .update({ totp_secret: secret, totp_enabled: false })
      .eq("id", context.userId);
    return { secret, otpauth, qr };
  });

export const verifyTotpAndEnable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => d)
  .handler(async ({ data, context }) => {
    const { verify } = await import("otplib");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("totp_secret").eq("id", context.userId).maybeSingle();
    if (!prof?.totp_secret) return { ok: false, error: "No secret found — restart 2FA setup" };
    const result = await verify({ secret: prof.totp_secret, token: String(data.code).trim(), epochTolerance: 30 });
    if (!result.valid) return { ok: false, error: "Wrong code — check your authenticator" };
    await supabaseAdmin.from("profiles").update({ totp_enabled: true }).eq("id", context.userId);
    return { ok: true };
  });

// Verify a TOTP code against another user (e.g. during login challenge)
export const verifyTotpForUser = createServerFn({ method: "POST" })
  .inputValidator((d: { userId: string; code: string }) => d)
  .handler(async ({ data }) => {
    const { verify } = await import("otplib");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("totp_secret,totp_enabled").eq("id", data.userId).maybeSingle();
    if (!prof?.totp_secret || !prof.totp_enabled) return { ok: true, skipped: true };
    const code = String(data.code).replace(/\s/g, "");
    const r = await verify({ secret: prof.totp_secret, token: code, epochTolerance: 30 });
    if (r.valid) return { ok: true };
    // recovery code fallback (hash + consume)
    const crypto = await import("crypto");
    const hash = crypto.createHash("sha256").update(code.toUpperCase()).digest("hex");
    const { data: consumed } = await supabaseAdmin.rpc("consume_recovery_code", {
      _user_id: data.userId, _code_hash: hash,
    });
    return consumed ? { ok: true, usedRecovery: true } : { ok: false, error: "Invalid code" };
  });

// Returns whether the given username has 2FA enabled (used before password)
export const totpStatusForUsername = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("id,totp_enabled")
      .ilike("username", data.username.trim()).maybeSingle();
    return { userId: prof?.id ?? null, totpEnabled: !!prof?.totp_enabled };
  });

export const issueRecoveryCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const crypto = await import("crypto");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // wipe old unused codes for this user
    await supabaseAdmin.from("recovery_codes").delete()
      .eq("user_id", context.userId).is("used_at", null);
    const codes: string[] = [];
    const rows: { user_id: string; code_hash: string }[] = [];
    for (let i = 0; i < 8; i++) {
      const raw = Array.from({ length: 2 }, () =>
        crypto.randomBytes(3).toString("hex").toUpperCase()
      ).join("-"); // e.g. A1B2C3-D4E5F6
      codes.push(raw);
      rows.push({
        user_id: context.userId,
        code_hash: crypto.createHash("sha256").update(raw).digest("hex"),
      });
    }
    await supabaseAdmin.from("recovery_codes").insert(rows);
    return { codes };
  });

export const finalizeProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
    socials?: Record<string, string>;
    plan?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    await context.supabase.from("profiles").update({
      profile_completed: true,
      full_name: data.displayName?.slice(0, 60),
      bio: data.bio?.slice(0, 280),
      avatar_url: data.avatarUrl,
      socials: data.socials ?? {},
    } as never).eq("id", context.userId);
    return { ok: true };
  });