// Server-only helper: push an ephemeral message to a Supabase Realtime
// broadcast topic via the REST API. This is much faster and far higher
// throughput than UPDATE-on-table + postgres_changes, and is the right
// transport for streaming JPEG frames to the browser viewer.

export async function broadcast(
  topic: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [{ topic, event, payload, private: false }],
      }),
    });
  } catch {
    // best-effort — never block the agent on a broadcast hiccup
  }
}
