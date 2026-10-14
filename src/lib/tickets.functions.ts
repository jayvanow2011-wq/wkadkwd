import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Check if helper or admin
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isStaff = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "helper");

    let query = supabase.from("tickets").select("*").order("created_at", { ascending: false });
    if (!isStaff) {
      query = query.eq("user_id", userId);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { tickets: data ?? [], isStaff };
  });

export const createTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { subject: string; body: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Check if user already has open ticket
    const { data: existing } = await supabase
      .from("tickets")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "open")
      .maybeSingle();
    if (existing) throw new Error("You already have an open ticket");

    const { data: ticket, error } = await supabase
      .from("tickets")
      .insert({ user_id: userId, subject: data.subject })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Insert initial message
    if (data.body.trim()) {
      await supabase.from("ticket_messages").insert({
        ticket_id: ticket.id,
        sender_id: userId,
        body: data.body.trim(),
      });
    }
    return { ticket };
  });

export const claimTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ticket_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("tickets")
      .update({ claimed_by: userId })
      .eq("id", data.ticket_id)
      .is("claimed_by", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const closeTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ticket_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("tickets")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", data.ticket_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTicketMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ticket_id: string; body?: string; image_url?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("ticket_messages").insert({
      ticket_id: data.ticket_id,
      sender_id: userId,
      body: data.body ?? null,
      image_url: data.image_url ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listTicketMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ticket_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: msgs, error } = await supabase
      .from("ticket_messages")
      .select("*")
      .eq("ticket_id", data.ticket_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { messages: msgs ?? [] };
  });
