import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { sendFriendRequest } from "@/lib/friends.functions";
import { toast } from "sonner";
import { UserPlus, MessageCircle, ExternalLink, Loader2 } from "lucide-react";

export const Route = createFileRoute("/profile/$username")({
  component: PublicProfilePage,
  head: ({ params }) => ({
    meta: [
      { title: `${params.username} — VeltrixRAT` },
      { name: "description", content: `View ${params.username}'s profile on VeltrixRAT.` },
      { property: "og:title", content: `${params.username} — VeltrixRAT` },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type ProfileData = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  socials: Record<string, string>;
  bio_public: boolean;
  bio_links: { id: string; title: string; url: string; icon: string | null }[];
};

function PublicProfilePage() {
  const { username } = Route.useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio, socials, bio_public")
        .eq("username", username)
        .maybeSingle();
      if (!prof) { setNotFound(true); setLoading(false); return; }

      const { data: links } = await supabase
        .from("bio_links")
        .select("id, title, url, icon")
        .eq("user_id", prof.id)
        .order("position", { ascending: true });

      setProfile({ ...prof, socials: (prof.socials ?? {}) as any, bio_links: links ?? [] });
      setLoading(false);
    })();
  }, [username]);

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (notFound || !profile) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <h1 className="text-2xl font-bold">User not found</h1>
      <Link to="/" className="text-sm text-primary hover:underline">Go home</Link>
    </div>
  );

  const isMe = user?.id === profile.id;

  return (
    <main className="flex min-h-screen items-start justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-24 w-24 rounded-full object-cover ring-2 ring-border" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-secondary text-2xl font-bold">
              {(profile.username ?? "?")[0].toUpperCase()}
            </div>
          )}
          <h1 className="mt-4 text-xl font-bold">{profile.display_name ?? profile.username}</h1>
          {profile.display_name && profile.username && (
            <p className="text-sm text-muted-foreground">@{profile.username}</p>
          )}
          {profile.bio && <p className="mt-2 max-w-sm text-sm text-muted-foreground">{profile.bio}</p>}
        </div>

        {/* Socials */}
        {Object.entries(profile.socials).filter(([, v]) => v).length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {Object.entries(profile.socials).filter(([, v]) => v).map(([k, v]) => (
              <span key={k} className="rounded-full border border-border bg-secondary px-3 py-1 text-xs">
                {k}: {v}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        {!isMe && user && (
          <div className="flex justify-center gap-2">
            <button
              onClick={async () => {
                try { await sendFriendRequest({ data: { user_id: profile.id } }); toast.success("Friend request sent"); }
                catch (e: any) { toast.error(e.message); }
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <UserPlus className="h-4 w-4" /> Add Friend
            </button>
            <Link
              to="/dashboard/chat"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              <MessageCircle className="h-4 w-4" /> Message
            </Link>
          </div>
        )}

        {/* Bio links */}
        {profile.bio_links.length > 0 && (
          <div className="space-y-2">
            {profile.bio_links.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="bio-link"
              >
                <span className="text-sm font-medium">{link.title}</span>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </a>
            ))}
          </div>
        )}

        <div className="text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
            VeltrixRAT
          </Link>
        </div>
      </div>
    </main>
  );
}
