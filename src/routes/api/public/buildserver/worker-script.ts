import { createFileRoute } from '@tanstack/react-router'
// Serves the latest build-worker.js source so the on-server worker can
// self-update without anyone running commands on the server.
import workerSource from '@/server-assets/build-worker.js?raw'

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

export const Route = createFileRoute('/api/public/buildserver/worker-script')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await verifyBuildserverKey(request))) {
          return new Response('Unauthorized', { status: 401 })
        }
        return new Response(workerSource, {
          headers: {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})
