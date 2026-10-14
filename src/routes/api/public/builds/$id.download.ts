import { createFileRoute, redirect } from "@tanstack/react-router";

const BUCKET = "builds";

function storagePathFromUrl(downloadUrl: string | null): string | null {
  if (!downloadUrl) return null;
  try {
    const url = new URL(downloadUrl);
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const idx = url.pathname.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(url.pathname.slice(idx + marker.length));
  } catch {
    return null;
  }
}

type StorageAdmin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function findBuildArtifact(supabaseAdmin: StorageAdmin, buildId: string, downloadUrl: string | null) {
  const pathFromUrl = storagePathFromUrl(downloadUrl);
  if (pathFromUrl) return pathFromUrl;

  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(buildId, { limit: 10 });
  if (error) throw error;
  const file = data?.find((item: { id: string | null; name: string }) => item.name && item.id !== null);
  return file ? `${buildId}/${file.name}` : null;
}

// Keep a stable app URL for downloads while the actual file stays in private storage.
export const Route = createFileRoute("/api/public/builds/$id/download")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("builds")
          .select("status,download_url")
          .eq("id", params.id)
          .single();
        if (error || !data) return new Response("Build not found", { status: 404 });
        if (data.status !== "success") {
          return new Response(`Build is ${data.status}. Try again when ready.`, { status: 409 });
        }
        const artifactPath = await findBuildArtifact(supabaseAdmin, params.id, data.download_url);
        if (!artifactPath) return new Response("Build file not found", { status: 404 });

        const { data: signed, error: signedError } = await supabaseAdmin.storage
          .from(BUCKET)
          .createSignedUrl(artifactPath, 60);
        if (signedError || !signed?.signedUrl) {
          return new Response(signedError?.message ?? "Could not create download link", { status: 500 });
        }

        throw redirect({ href: signed.signedUrl });
      },
    },
  },
});
