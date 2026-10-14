import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UuidSchema = z.string().uuid();

export const searchUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ query: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const q = data.query.trim();
    const { data: rows } = await supabase
      .from("profiles")
      .select("id,username,full_name,avatar_url")
      .or(`username.ilike.%${q}%,full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .neq("id", userId)
      .limit(15);
    return { users: rows ?? [] };
  });

export const sendFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: UuidSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.user_id === userId) throw new Error("Can't befriend yourself");

    // Already friends or pending in either direction?
    const { data: existing } = await supabase
      .from("friendships")
      .select("id,status,requester_id,addressee_id")
      .or(
        `and(requester_id.eq.${userId},addressee_id.eq.${data.user_id}),and(requester_id.eq.${data.user_id},addressee_id.eq.${userId})`,
      )
      .maybeSingle();

    if (existing) {
      if (existing.status === "accepted") return { ok: true, status: "accepted" as const };
      // If THEY had requested US, accept it.
      if (existing.addressee_id === userId && existing.status === "pending") {
        await supabase.from("friendships").update({ status: "accepted" }).eq("id", existing.id);
        return { ok: true, status: "accepted" as const };
      }
      return { ok: true, status: existing.status as any };
    }

    const { error } = await supabase
      .from("friendships")
      .insert({ requester_id: userId, addressee_id: data.user_id, status: "pending" });
    if (error) throw new Error(error.message);

    // Notify recipient
    await supabase.from("notifications").insert({
      user_id: data.user_id,
      title: "Friend request",
      body: "Someone wants to add you.",
      kind: "friend_request",
      payload: { requester_id: userId },
    } as any);

    return { ok: true, status: "pending" as const };
  });

export const respondFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ requester_id: UuidSchema, accept: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("friendships")
      .select("id,status")
      .eq("requester_id", data.requester_id)
      .eq("addressee_id", userId)
      .maybeSingle();
    if (!row) throw new Error("No pending request");
    if (row.status !== "pending") return { ok: true };

    if (data.accept) {
      await supabase.from("friendships").update({ status: "accepted" }).eq("id", row.id);
      await supabase.from("notifications").insert({
        user_id: data.requester_id,
        title: "Friend request accepted",
        body: null,
        kind: "system",
        payload: { friend_id: userId },
      } as any);
    } else {
      await supabase.from("friendships").delete().eq("id", row.id);
    }
    return { ok: true };
  });

export const removeFriend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ friend_id: UuidSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("friendships")
      .delete()
      .or(
        `and(requester_id.eq.${userId},addressee_id.eq.${data.friend_id}),and(requester_id.eq.${data.friend_id},addressee_id.eq.${userId})`,
      );
    return { ok: true };
  });

export const listFriends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows } = await supabase
      .from("friendships")
      .select("id,status,requester_id,addressee_id,created_at,updated_at")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .order("updated_at", { ascending: false });
    const others = (rows ?? []).map((r) =>
      r.requester_id === userId ? r.addressee_id : r.requester_id,
    );
    const { data: profiles } = others.length
      ? await supabase
          .from("profiles")
          .select("id,username,full_name,avatar_url")
          .in("id", others)
      : { data: [] as any[] };
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
    return {
      friends: (rows ?? []).map((r) => {
        const otherId = r.requester_id === userId ? r.addressee_id : r.requester_id;
        const p = pmap.get(otherId);
        return {
          friendship_id: r.id,
          status: r.status,
          other_id: otherId,
          incoming: r.addressee_id === userId && r.status === "pending",
          outgoing: r.requester_id === userId && r.status === "pending",
          username: p?.username ?? null,
          full_name: p?.full_name ?? null,
          avatar_url: p?.avatar_url ?? null,
          updated_at: r.updated_at,
        };
      }),
    };
  });
