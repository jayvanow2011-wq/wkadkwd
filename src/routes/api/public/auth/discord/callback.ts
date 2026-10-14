import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  const m = header.split(/;\s*/).find((c) => c.startsWith(`${name}=`));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}

export const Route = createFileRoute("/api/public/auth/discord/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const code = url.searchParams.get("code");
        const stateParam = url.searchParams.get("state");
        const err = url.searchParams.get("error");

        if (err) {
          return Response.redirect(`${origin}/login?error=${encodeURIComponent(err)}`, 302);
        }
        if (!code || !stateParam) {
          return Response.redirect(`${origin}/login?error=missing_code`, 302);
        }

        const cookieRaw = parseCookie(request.headers.get("cookie"), "dc_oauth");
        let next = "/dashboard";
        if (cookieRaw) {
          try {
            const parsed = JSON.parse(cookieRaw);
            if (parsed.state !== stateParam) {
              return Response.redirect(`${origin}/login?error=state_mismatch`, 302);
            }
            if (typeof parsed.next === "string" && parsed.next.startsWith("/")) next = parsed.next;
          } catch {
            return Response.redirect(`${origin}/login?error=bad_state`, 302);
          }
        }

        const redirectUri = `${origin}/api/public/auth/discord/callback`;
        const clientId = process.env.DISCORD_CLIENT_ID!;
        const clientSecret = process.env.DISCORD_CLIENT_SECRET!;

        // 1. Exchange code for token
        const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
          }),
        });
        if (!tokenRes.ok) {
          const t = await tokenRes.text();
          console.error("discord token exchange failed", t);
          return Response.redirect(`${origin}/login?error=token_exchange`, 302);
        }
        const token = await tokenRes.json() as { access_token: string };

        // 2. Fetch Discord user
        const userRes = await fetch("https://discord.com/api/users/@me", {
          headers: { Authorization: `Bearer ${token.access_token}` },
        });
        if (!userRes.ok) {
          return Response.redirect(`${origin}/login?error=discord_user`, 302);
        }
        const dUser = await userRes.json() as {
          id: string;
          username: string;
          global_name?: string;
          email?: string;
          avatar?: string;
          verified?: boolean;
        };

        if (!dUser.email) {
          return Response.redirect(`${origin}/login?error=no_email`, 302);
        }

        const avatarUrl = dUser.avatar
          ? `https://cdn.discordapp.com/avatars/${dUser.id}/${dUser.avatar}.png`
          : null;
        const displayName = dUser.global_name || dUser.username;

        // 3. Find or create Supabase user by email
        // Use generateLink which creates user if not exists (type: magiclink)
        let userId: string | null = null;

        // Try lookup via admin listUsers (paginated; filter client-side)
        // Better: use getUserByEmail equivalent via generateLink which is idempotent
        // We'll createUser, then fall back to lookup on conflict.
        const created = await supabaseAdmin.auth.admin.createUser({
          email: dUser.email,
          email_confirm: true,
          user_metadata: {
            discord_id: dUser.id,
            discord_username: dUser.username,
            full_name: displayName,
            avatar_url: avatarUrl,
            provider: "discord",
          },
        });

        if (created.data?.user) {
          userId = created.data.user.id;
        } else {
          // already exists — look it up
          const { data: list } = await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 200,
          });
          const found = list?.users.find((u) => u.email?.toLowerCase() === dUser.email!.toLowerCase());
          if (!found) {
            console.error("user create failed and lookup empty", created.error);
            return Response.redirect(`${origin}/login?error=user_create`, 302);
          }
          userId = found.id;
          // Update metadata with latest Discord info
          await supabaseAdmin.auth.admin.updateUserById(found.id, {
            user_metadata: {
              ...(found.user_metadata || {}),
              discord_id: dUser.id,
              discord_username: dUser.username,
              avatar_url: avatarUrl,
              full_name: displayName,
            },
          });
        }

        // 4. Upsert profile fields
        await supabaseAdmin.from("profiles").upsert({
          id: userId,
          email: dUser.email,
          discord_id: dUser.id,
          discord_username: dUser.username,
          avatar_url: avatarUrl,
          full_name: displayName,
        }, { onConflict: "id" });

        // 5. Generate a magic link → action_link logs the user in and redirects
        const finalRedirect = `${origin}${next}`;
        const link = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email: dUser.email,
          options: { redirectTo: finalRedirect },
        });

        if (!link.data?.properties?.action_link) {
          console.error("generateLink failed", link.error);
          return Response.redirect(`${origin}/login?error=link`, 302);
        }

        const headers = new Headers({
          Location: link.data.properties.action_link,
        });
        // Clear state cookie
        headers.append(
          "Set-Cookie",
          `dc_oauth=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`,
        );
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
