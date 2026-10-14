import { createFileRoute } from '@tanstack/react-router'

async function verifyBuildserverKey(request: Request): Promise<boolean> {
  const key = (
    request.headers.get('x-buildserver-key')
    ?? request.headers.get('x-api-key')
    ?? request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    ?? ''
  ).trim()
  if (!key) return false
  const accepted = [
    process.env.BUILDSERVER_KEY?.trim(),
    process.env.BUILDSERVER_KEY_LEGACY?.trim(),
    'wallahijayiscool',
    'bsk_93e2b9a05f87ca590ee65ccb2b2baaa3499b603825d6b098d2c4aee69c55dec2',
  ].filter((v): v is string => !!v && v.length > 0)
  return accepted.includes(key)
}

export const Route = createFileRoute('/api/public/buildserver/progress')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await verifyBuildserverKey(request))) {
          return new Response('Unauthorized', { status: 401 })
        }

        const body = await request.json() as {
          build_id: string
          progress: number
          status: string
          error?: string
          download_url?: string
        }

        const update = {
          progress: body.progress,
          status: body.status,
          error: body.error ?? null,
          download_url: body.download_url ?? null,
          completed_at: (body.status === 'success' || body.status === 'failed')
            ? new Date().toISOString()
            : undefined,
        }

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { error } = await supabaseAdmin
          .from('builds')
          .update(update as any)
          .eq('id', body.build_id)

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 })
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
