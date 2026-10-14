import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UuidSchema = z.string().uuid();

function convKey(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Get friends
    const { data: f } = await supabase
      .from("friendships")
      .select("requester_id,addressee_id,status")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .eq("status", "accepted");

    const friendIds = (f ?? []).map((r) =>
      r.requester_id === userId ? r.addressee_id : r.requester_id,
    );
    if (friendIds.length === 0) return { conversations: [] };

    const [{ data: profiles }, { data: msgs }] = await Promise.all([
      supabase.from("profiles").select("id,username,full_name,avatar_url").in("id", friendIds),
      supabase
        .from("direct_messages")
        .select("id,sender_id,recipient_id,kind,body,image_url,created_at,read_at")
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const lastByOther = new Map<string, any>();
    const unreadByOther = new Map<string, number>();
    for (const m of msgs ?? []) {
      const other = m.sender_id === userId ? m.recipient_id : m.sender_id;
      if (!friendIds.includes(other)) continue;
      if (!lastByOther.has(other)) lastByOther.set(other, m);
      if (m.recipient_id === userId && !m.read_at) {
        unreadByOther.set(other, (unreadByOther.get(other) ?? 0) + 1);
      }
    }

    const conversations = friendIds
      .map((id) => {
        const p = pmap.get(id);
        const last = lastByOther.get(id);
        return {
          other_id: id,
          username: p?.username ?? null,
          full_name: p?.full_name ?? null,
          avatar_url: p?.avatar_url ?? null,
          last_message:
            last?.kind === "image"
              ? "📷 Image"
              : last?.kind === "share_client"
                ? "🖥 Shared a client"
                : last?.kind === "request_client"
                  ? "📥 Requested a client"
                  : (last?.body ?? null),
          last_at: last?.created_at ?? null,
          unread: unreadByOther.get(id) ?? 0,
        };
      })
      .sort((a, b) => {
        const at = a.last_at ? Date.parse(a.last_at) : 0;
        const bt = b.last_at ? Date.parse(b.last_at) : 0;
        return bt - at;
      });

    return { conversations };
  });

export const listMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ other_id: UuidSchema, limit: z.number().min(1).max(200).default(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const key = convKey(userId, data.other_id);
    const { data: rows } = await supabase
      .from("direct_messages")
      .select("*")
      .eq("conversation_key", key)
      .order("created_at", { ascending: true })
      .limit(data.limit);
    return { messages: rows ?? [] };
  });

const SendInput = z.object({
  to: UuidSchema,
  kind: z.enum(["text", "image"]),
  body: z.string().max(2000).optional().nullable(),
  image_url: z.string().url().max(500).optional().nullable(),
});

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SendInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.kind === "text" && !data.body?.trim()) throw new Error("Empty message");
    if (data.kind === "image" && !data.image_url) throw new Error("Missing image");
    const key = convKey(userId, data.to);
    const { error } = await supabase.from("direct_messages").insert({
      conversation_key: key,
      sender_id: userId,
      recipient_id: data.to,
      kind: data.kind,
      body: data.body ?? null,
      image_url: data.image_url ?? null,
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ other_id: UuidSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const key = convKey(userId, data.other_id);
    await supabase
      .from("direct_messages")
      .update({ read_at: new Date().toISOString() } as any)
      .eq("conversation_key", key)
      .eq("recipient_id", userId)
      .is("read_at", null);
    return { ok: true };
  });
