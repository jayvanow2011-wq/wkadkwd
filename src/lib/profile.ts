import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  discord_id: string | null;
  discord_username: string | null;
  theme: string;
  profile_completed: boolean;
  discord_rpc_enabled: boolean;
  discord_status_enabled: boolean;
};

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return (data ?? null) as Profile | null;
}

export async function usernameAvailable(username: string, excludeId?: string) {
  const q = supabase.from("profiles").select("id").ilike("username", username);
  const { data } = await q;
  if (!data) return true;
  return data.filter((r) => r.id !== excludeId).length === 0;
}
