import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Upload, Sparkles, Sun, Moon, Palette } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { getProfile, usernameAvailable, type Profile } from "@/lib/profile";
import { useTheme, type ThemeName } from "@/lib/theme-context";

export const Route = createFileRoute("/profile-setup")({
  component: ProfileSetupPage,
  head: () => ({
    meta: [{ title: "Setup profile — zip-prep-pal.xyz" }],
  }),
});

function ProfileSetupPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { theme, setTheme } = useTheme();
  const [step, setStep] = useState<1 | 2>(1);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fromDiscord, setFromDiscord] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/" }); return; }
    getProfile(user.id).then((p) => {
      if (!p) return;
      setProfile(p);
      setUsername(p.username ?? p.discord_username ?? "");
      setBio(p.bio ?? "");
      setAvatarUrl(p.avatar_url);
      setFromDiscord(!!p.discord_id);
      if (p.profile_completed) navigate({ to: "/dashboard" });
    });
  }, [user, loading, navigate]);

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
  };

  const next1 = async () => {
    if (!user) return;
    const u = username.trim();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(u)) { toast.error("3-20 chars, letters/numbers/_"); return; }
    setBusy(true);
    const free = await usernameAvailable(u, user.id);
    if (!free) { setBusy(false); toast.error("Username taken"); return; }
    setBusy(false);
    setStep(2);
  };

  const finish = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").update({
      username: username.trim(),
      bio: bio.trim() || null,
      avatar_url: avatarUrl,
      theme,
      profile_completed: true,
    }).eq("id", user.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile ready");
    navigate({ to: "/dashboard" });
  };

  if (loading || !profile) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,oklch(0.78_0.16_155/0.18),transparent_55%),radial-gradient(circle_at_70%_80%,oklch(0.6_0.18_280/0.15),transparent_55%)]" />
      <div className="relative w-full max-w-lg rounded-2xl border border-border/60 bg-card/70 p-8 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-500">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-2 w-16 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: step === 1 ? "50%" : "100%" }} />
          </div>
          <span className="text-xs text-muted-foreground">Step {step} of 2</span>
        </div>

        {step === 1 ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Setup your profile</h1>
            <p className="mt-1 text-sm text-muted-foreground">Pick a username, photo and a short bio.</p>

            <div className="mt-6 flex items-center gap-4">
              <div className="relative">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover ring-2 ring-primary/40" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Sparkles className="h-8 w-8" />
                  </div>
                )}
              </div>
              <label className="cursor-pointer rounded-md border border-border bg-secondary px-3 py-2 text-sm transition hover:bg-accent">
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
                <span className="inline-flex items-center gap-2"><Upload className="h-4 w-4" /> Upload photo</span>
              </label>
            </div>

            <div className="mt-6 space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Username {fromDiscord && <span className="text-[10px]">(from Discord)</span>}</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={fromDiscord}
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none disabled:opacity-60 focus:border-primary focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <div className="mt-4 space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 280))}
                rows={3}
                className="w-full resize-none rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/40"
                placeholder="Tell people about you..."
              />
              <div className="text-right text-[10px] text-muted-foreground">{bio.length}/280</div>
            </div>

            <button onClick={next1} disabled={busy} className="mt-6 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
              {busy ? "Checking…" : "Next"}
            </button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Pick a theme</h1>
            <p className="mt-1 text-sm text-muted-foreground">You can change this later in settings.</p>

            <div className="mt-6 grid grid-cols-3 gap-3">
              {([
                { id: "dark" as ThemeName, label: "Dark", icon: Moon, swatch: "bg-[oklch(0.16_0.015_270)] text-[oklch(0.78_0.16_155)]" },
                { id: "light" as ThemeName, label: "Light", icon: Sun, swatch: "bg-[oklch(0.99_0.003_270)] text-[oklch(0.55_0.18_155)] border" },
                { id: "summer" as ThemeName, label: "Summer", icon: Palette, swatch: "bg-[oklch(0.98_0.04_85)] text-[oklch(0.7_0.2_45)]" },
              ] as const).map(({ id, label, icon: Icon, swatch }) => (
                <button
                  key={id}
                  onClick={() => setTheme(id)}
                  className={`group flex flex-col items-center gap-2 rounded-xl border p-4 text-sm transition ${
                    theme === id ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/60"
                  }`}
                >
                  <div className={`flex h-16 w-16 items-center justify-center rounded-full transition group-hover:scale-105 ${swatch}`}>
                    <Icon className="h-7 w-7" />
                  </div>
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-6 flex gap-2">
              <button onClick={() => setStep(1)} className="flex-1 rounded-md border border-border bg-secondary px-4 py-2 text-sm transition hover:bg-accent">
                Back
              </button>
              <button onClick={finish} disabled={busy} className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                {busy ? "Saving…" : "Finish"}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
