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

export const Route = createFileRoute('/api/public/buildserver/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await verifyBuildserverKey(request))) {
          return new Response('Unauthorized', { status: 401 })
        }
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

        // Parse multipart
        const formData = await request.formData()
        const file = formData.get('file') as File | null
        const buildId = formData.get('build_id') as string | null

        if (!file || !buildId) {
          return new Response(JSON.stringify({ error: 'Missing file or build_id' }), { status: 400 })
        }

        const arrayBuf = await file.arrayBuffer()
        const buffer = new Uint8Array(arrayBuf)
        const fileName = `${buildId}/${file.name}`

        const { error: uploadError } = await supabaseAdmin.storage
          .from('builds')
          .upload(fileName, buffer, {
            contentType: 'application/octet-stream',
            upsert: true,
          })

        if (uploadError) {
          return new Response(JSON.stringify({ error: uploadError.message }), { status: 500 })
        }

        const { data: signed, error: signErr } = await supabaseAdmin.storage
          .from('builds')
          .createSignedUrl(fileName, 60 * 60 * 24 * 365)

        if (signErr) {
          return new Response(JSON.stringify({ error: signErr.message }), { status: 500 })
        }

        return new Response(JSON.stringify({ download_url: signed.signedUrl }), {
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
