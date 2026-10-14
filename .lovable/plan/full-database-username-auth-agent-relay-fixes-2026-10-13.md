# Full database, username auth, agent + relay fixes

## What you'll get

1. **The full database.** All 29 tables the app expects (`profiles`, `devices`, `commands`, `community_posts`, `tickets`, `subscriptions`, `friendships`, `notifications`, `builds`, `turn_servers`, `server_endpoints`, etc.) plus the functions and triggers that make signup, referrals, tickets and realtime work.
2. **Username + password sign-in only.** The sign-in page takes a username and a password. No email, no email confirmation. Your `jayjay` account is created as admin with a strong password you'll see once in chat.
3. **All pages wired up.** The pages that are currently silenced (dashboard, chat, community, tickets, admin, clients, builder, ads, referrals, settings, notifications, subs, profile) start reading real data again.
4. **Agent + relay.** The Go/Rust agent endpoints get fixed so a connected client registers, heartbeats, and shows as **online** instead of "offline/busy", so Screen View, Camera and remote control actually open.

## How we'll do it

- Apply one big migration that creates every table with proper columns, grants, RLS and the signup/referral/ticket triggers from the original project. Any adjustments needed because we're on Lovable Cloud (`auth.users` instead of `neon_auth.user`) are made in that same migration.
- Turn on email sign-in at the backend only so the password flow works, then switch the UI to a username field that signs in with a synthetic `<username>@app.local` address — so you literally only type a username and password. Password reset by email is not possible in this mode.
- Re-enable type checking on the pages I silenced last turn, now that the tables exist.
- Fix the agent presence logic (heartbeat timestamp + "online" threshold) and the relay signaling so the dashboard sees the client as available and the WebRTC/relay session actually starts.

## What I need from you

Nothing — I'll proceed once you approve. The published site stays unchanged; everything happens in the preview backend.

## Not included

- Importing your old production data. Tables will be empty except for `jayjay` (admin) and a trial subscription row the trigger creates.
- Payments (NowPayments/Stripe), Discord OAuth, email delivery — infrastructure for those stays as-is; the code paths won't error but won't be live until you give credentials.

## Technical notes

- Migration source: `scripts/migrate-full-schema.sql` + the four `drizzle/migrations/*.sql` files from the original upload, merged and rewritten to target `auth.users` and include GRANTs + RLS per Lovable Cloud rules.
- Auth: `supabase--enable_email_auth` + `configure_auth(auto_confirm_email: true)`; `signUp`/`signInWithPassword` get `${username}@app.local`.
- Admin seed: insert into `auth.users` via admin API in a one-off server step, then the signup trigger populates `profiles` and grants `admin` role.
- Agent presence: `devices.last_seen` updated by `/api/public/agent/heartbeat`; a device is "online" if `last_seen > now() - 30s`. Relay routes return the current ICE/signal state instead of a stale "busy".
