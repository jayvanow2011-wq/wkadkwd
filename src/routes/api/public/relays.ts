// Public relay discovery endpoint.
//
// Reads active ws_relay rows from `server_endpoints` (admin-managed in the
// dashboard). The default row is served first, then the rest by most-recent
// update. If the table is empty or unreachable, falls back to a baked-in URL
// so the native agent still has somewhere to connect.

import { createFileRoute } from '@tanstack/react-router'

type Relay = {
  ws: string
  http: string
  via: 'direct' | 'proxy'
  priority: number
}

const FALLBACK: Relay[] = [
  {
    ws: 'wss://umad.hidenmc.com',
    http: 'https://umad.hidenmc.com',
    via: 'direct',
    priority: 1,
  },
]

function toRelay(url: string, priority: number): Relay | null {
  const trimmed = url.trim().replace(/\/+$/, '')
  if (!trimmed) return null
  let ws: string
  let http: string
  if (trimmed.startsWith('wss://')) {
    ws = trimmed
    http = 'https://' + trimmed.slice('wss://'.length)
  } else if (trimmed.startsWith('ws://')) {
    ws = trimmed
    http = 'http://' + trimmed.slice('ws://'.length)
  } else if (trimmed.startsWith('https://')) {
    http = trimmed
    ws = 'wss://' + trimmed.slice('https://'.length)
  } else if (trimmed.startsWith('http://')) {
    http = trimmed
    ws = 'ws://' + trimmed.slice('http://'.length)
  } else {
    ws = 'wss://' + trimmed
    http = 'https://' + trimmed
  }
  const via: 'direct' | 'proxy' = /workers\.dev|cloudflare/i.test(ws) ? 'proxy' : 'direct'
  return { ws, http, via, priority }
}

export const Route = createFileRoute('/api/public/relays')({
  server: {
    handlers: {
      GET: async () => {
        let relays: Relay[] = []
        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
          const { data } = await supabaseAdmin
            .from('server_endpoints' as any)
            .select('url,is_default,is_active,updated_at')
            .eq('kind', 'ws_relay')
            .eq('is_active', true)
            .order('is_default', { ascending: false })
            .order('updated_at', { ascending: false })
          const rows = (data ?? []) as unknown as Array<{ url: string; is_default: boolean }>
          relays = rows
            .map((r, i) => toRelay(r.url, r.is_default ? 1 : 10 + i))
            .filter((r): r is Relay => !!r)
        } catch {
          /* fall through to fallback */
        }
        if (relays.length === 0) relays = FALLBACK
        return new Response(
          JSON.stringify({ relays, updated_at: Date.now() }),
          {
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'public, max-age=30',
              'Access-Control-Allow-Origin': '*',
            },
          },
        )
      },
    },
  },
})
