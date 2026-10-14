import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/auth/discord/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const redirectUri = `${origin}/api/public/auth/discord/callback`;
        const clientId = process.env.DISCORD_CLIENT_ID!;
        const state = crypto.randomUUID();
        const next = url.searchParams.get("next") || "/dashboard";

        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: "identify email",
          state,
          prompt: "consent",
        });

        const headers = new Headers({
          Location: `https://discord.com/oauth2/authorize?${params}`,
        });
        // Store state + next in cookie for CSRF check
        const payload = encodeURIComponent(JSON.stringify({ state, next }));
        headers.append(
          "Set-Cookie",
          `dc_oauth=${payload}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax; Secure`,
        );
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
