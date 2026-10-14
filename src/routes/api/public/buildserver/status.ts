import { createFileRoute } from '@tanstack/react-router'

// Public, no-auth status endpoint for the Builder tab's green/red dot.
// Online = at least one buildserver row has last_seen_at within the last 20s.
export const Route = createFileRoute('/api/public/buildserver/status')({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data } = await supabaseAdmin
          .from('build_server_config')
          .select('last_seen_at')
          .order('last_seen_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle()

        const lastSeen = data?.last_seen_at ? new Date(data.last_seen_at).getTime() : 0
        const online = Date.now() - lastSeen < 20_000

        return new Response(JSON.stringify({ online, last_seen_at: data?.last_seen_at ?? null }), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*',
          },
        })
      },
    },
  },
})