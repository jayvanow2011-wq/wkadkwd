import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import {
  Megaphone, X, Save, Plus, Edit3, ChevronLeft,
  ExternalLink, ImageIcon, ShoppingBag, Eye, Sparkles, Tag,
  Trash2, ToggleLeft, ToggleRight, UserPlus, Power, Link2,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/ads")({
  component: AdsPage,
});

type Spot = {
  id: string;
  slot_number: number;
  title: string;
  short_description: string;
  long_description: string;
  front_image: string | null;
  images: string[];
  buttons: { label: string; url: string }[];
  owner_user_id: string | null;
  is_for_sale: boolean;
  is_active: boolean;
};

function AdsPage() {
  const { user } = useAuth();
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Spot | null>(null);
  const [editing, setEditing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminAssign, setAdminAssign] = useState(false);
  const [searchUser, setSearchUser] = useState("");
  const [foundUsers, setFoundUsers] = useState<{ id: string; username: string }[]>([]);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("ad_spots").select("*").order("slot_number");
    setSpots((data ?? []) as any);
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (user) {
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle()
        .then(({ data }) => setIsAdmin(!!data));
    }
  }, [user]);

  const searchUsers = async (q: string) => {
    setSearchUser(q);
    if (q.length < 2) { setFoundUsers([]); return; }
    const { data } = await supabase
      .from("profiles")
      .select("id, username")
      .ilike("username", `%${q}%`)
      .limit(10);
    setFoundUsers((data ?? []).filter((u: any) => u.username) as any);
  };

  const assignSpot = async (spotId: string, userId: string) => {
    await supabase.from("ad_spots").update({ owner_user_id: userId, is_for_sale: false } as any).eq("id", spotId);
    toast.success("Spot assigned!");
    setAdminAssign(false);
    setSearchUser("");
    setFoundUsers([]);
    const updated = spots.find(s => s.id === spotId);
    if (updated && selected?.id === spotId) {
      setSelected({ ...selected, owner_user_id: userId, is_for_sale: false });
    }
    load();
  };

  const unassignSpot = async (spotId: string) => {
    await supabase.from("ad_spots").update({ owner_user_id: null } as any).eq("id", spotId);
    toast.success("Owner removed");
    if (selected?.id === spotId) {
      setSelected({ ...selected, owner_user_id: null });
    }
    load();
  };

  const saveSpot = async (spot: Spot) => {
    const { error } = await supabase
      .from("ad_spots")
      .update({
        title: spot.title,
        short_description: spot.short_description,
        long_description: spot.long_description,
        front_image: spot.front_image,
        images: spot.images,
        buttons: spot.buttons,
        is_for_sale: spot.is_for_sale,
        is_active: spot.is_active,
      } as any)
      .eq("id", spot.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Saved!");
      setSelected(spot);
      setEditing(false);
      load();
    }
  };

  const createSpot = async () => {
    const nextSlot = spots.length > 0 ? Math.max(...spots.map(s => s.slot_number)) + 1 : 1;
    const { data, error } = await supabase
      .from("ad_spots")
      .insert({ slot_number: nextSlot, title: `Spot #${nextSlot}`, is_for_sale: true, is_active: true } as any)
      .select()
      .single();
    if (error) toast.error(error.message);
    else {
      toast.success("Spot created!");
      setCreating(false);
      load();
    }
  };

  const deleteSpot = async (spotId: string) => {
    const { error } = await supabase.from("ad_spots").delete().eq("id", spotId);
    if (error) toast.error(error.message);
    else {
      toast.success("Spot deleted");
      if (selected?.id === spotId) { setSelected(null); setEditing(false); }
      load();
    }
  };

  const toggleActive = async (spot: Spot) => {
    await supabase.from("ad_spots").update({ is_active: !spot.is_active } as any).eq("id", spot.id);
    toast.success(spot.is_active ? "Deactivated" : "Activated");
    if (selected?.id === spot.id) setSelected({ ...spot, is_active: !spot.is_active });
    load();
  };

  const toggleForSale = async (spot: Spot) => {
    await supabase.from("ad_spots").update({ is_for_sale: !spot.is_for_sale } as any).eq("id", spot.id);
    toast.success(spot.is_for_sale ? "Marked unavailable" : "Marked for sale");
    if (selected?.id === spot.id) setSelected({ ...spot, is_for_sale: !spot.is_for_sale });
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        Loading ad spots…
      </div>
    );
  }

  /* ── Detail view ── */
  if (selected) {
    const isOwner = user?.id === selected.owner_user_id;
    const canEdit = isOwner || isAdmin;

    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <button
          onClick={() => { setSelected(null); setEditing(false); }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Back to spots
        </button>

        {editing ? (
          <SpotEditor spot={selected} onSave={saveSpot} onCancel={() => setEditing(false)} isAdmin={isAdmin} />
        ) : (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">{selected.title || `Spot #${selected.slot_number}`}</h1>
                  {!selected.is_active && (
                    <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-destructive">Inactive</span>
                  )}
                  {selected.is_for_sale && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">For Sale</span>
                  )}
                </div>
                {selected.short_description && (
                  <p className="mt-1.5 text-sm text-muted-foreground">{selected.short_description}</p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {canEdit && (
                  <button
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-accent"
                  >
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </button>
                )}
                {isAdmin && (
                  <>
                    <button
                      onClick={() => setAdminAssign(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                    >
                      <UserPlus className="h-3.5 w-3.5" /> Assign
                    </button>
                    {selected.owner_user_id && (
                      <button
                        onClick={() => unassignSpot(selected.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" /> Unassign
                      </button>
                    )}
                    <button
                      onClick={() => toggleActive(selected)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-accent"
                    >
                      <Power className="h-3.5 w-3.5" /> {selected.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => toggleForSale(selected)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-accent"
                    >
                      <ShoppingBag className="h-3.5 w-3.5" /> {selected.is_for_sale ? "Mark Sold" : "Mark For Sale"}
                    </button>
                    <button
                      onClick={() => { if (confirm("Delete this spot permanently?")) deleteSpot(selected.id); }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 text-sm text-destructive transition hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </>
                )}
              </div>
            </div>

            {selected.front_image && (
              <div className="overflow-hidden rounded-2xl border border-border">
                <img src={selected.front_image} alt="" className="w-full object-cover max-h-80" />
              </div>
            )}

            {selected.long_description && (
              <div className="rounded-2xl border border-border bg-card/60 p-5 text-sm leading-relaxed whitespace-pre-wrap backdrop-blur-xl">
                {selected.long_description}
              </div>
            )}

            {selected.images.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {selected.images.map((img, i) => (
                  <img key={i} src={img} alt="" className="rounded-xl border border-border object-cover aspect-video" />
                ))}
              </div>
            )}

            {selected.buttons.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selected.buttons.map((btn, i) => (
                  <a
                    key={i}
                    href={btn.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                  >
                    {btn.label} <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            )}

            {selected.is_for_sale && !isAdmin && (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                  <ShoppingBag className="h-6 w-6 text-primary" />
                </div>
                <p className="mt-3 text-sm font-semibold">This spot is available</p>
                <p className="mt-1 text-xs text-muted-foreground">Contact admin to purchase this advertising slot.</p>
              </div>
            )}

            {/* Owner info for admin */}
            {isAdmin && (
              <div className="rounded-2xl border border-border bg-card/60 p-4 backdrop-blur-xl">
                <p className="text-xs font-medium text-muted-foreground mb-1">Admin Info</p>
                <p className="text-sm">
                  Owner: {selected.owner_user_id ? (
                    <OwnerName userId={selected.owner_user_id} />
                  ) : (
                    <span className="text-muted-foreground italic">Unassigned</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Slot #{selected.slot_number} · ID: {selected.id.slice(0, 8)}…</p>
              </div>
            )}
          </div>
        )}

        {/* Assign modal */}
        {adminAssign && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setAdminAssign(false)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95">
              <h3 className="text-base font-semibold">Assign spot to user</h3>
              <input
                value={searchUser}
                onChange={(e) => searchUsers(e.target.value)}
                placeholder="Search username…"
                className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
              />
              <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                {foundUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => assignSpot(selected.id, u.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition hover:bg-accent text-left"
                  >
                    {u.username}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Grid view ── */
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Megaphone className="h-6 w-6" /> Ad Spots
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Premium advertising slots — contact admin to purchase.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={createSpot}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Create Spot
            </button>
          )}
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
            <Tag className="h-3 w-3" />
            <span className="font-medium text-foreground">{spots.length}</span> spots
          </div>
        </div>
      </div>

      {spots.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/20 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/60">
            <Sparkles className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <p className="mt-4 text-sm font-medium text-muted-foreground">No ad spots yet</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {isAdmin ? "Click \"Create Spot\" to get started." : "Spots will appear here once created by an admin."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {spots.map((spot, i) => (
            <div
              key={spot.id}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-card/60 text-left backdrop-blur-xl transition-all hover:shadow-lg hover:scale-[1.01] animate-in fade-in slide-in-from-bottom-3 duration-500 ${
                !spot.is_active ? "border-border/50 opacity-60" : "border-border hover:border-primary/30 hover:shadow-primary/5"
              }`}
              style={{ animationDelay: `${i * 80}ms`, animationFillMode: "both" }}
            >
              <button onClick={() => setSelected(spot)} className="flex flex-col flex-1 text-left">
                {spot.front_image ? (
                  <div className="relative h-40 overflow-hidden">
                    <img src={spot.front_image} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent" />
                    {!spot.is_active && (
                      <div className="absolute top-2 right-2 rounded-full bg-destructive/80 px-2 py-0.5 text-[9px] font-bold uppercase text-destructive-foreground">
                        Inactive
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="relative flex h-40 items-center justify-center bg-secondary/30">
                    <ImageIcon className="h-10 w-10 text-muted-foreground/20" />
                    {!spot.is_active && (
                      <div className="absolute top-2 right-2 rounded-full bg-destructive/80 px-2 py-0.5 text-[9px] font-bold uppercase text-destructive-foreground">
                        Inactive
                      </div>
                    )}
                  </div>
                )}
                <div className="flex-1 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{spot.title || `Spot #${spot.slot_number}`}</span>
                    <div className="flex shrink-0 gap-1">
                      {spot.is_for_sale && (
                        <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                          Available
                        </span>
                      )}
                    </div>
                  </div>
                  {spot.short_description && (
                    <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground leading-relaxed">{spot.short_description}</p>
                  )}
                  {isAdmin && (
                    <p className="mt-2 text-[10px] text-muted-foreground/60">
                      Owner: {spot.owner_user_id ? spot.owner_user_id.slice(0, 8) + "…" : "none"}
                    </p>
                  )}
                </div>
              </button>
              <div className="border-t border-border/50 px-4 py-2.5 flex items-center justify-between">
                <button onClick={() => setSelected(spot)} className="flex items-center gap-1 text-[11px] text-muted-foreground transition hover:text-primary">
                  <Eye className="h-3 w-3" /> View details
                </button>
                {isAdmin && (
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleActive(spot); }}
                      className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition"
                      title={spot.is_active ? "Deactivate" : "Activate"}
                    >
                      {spot.is_active ? <ToggleRight className="h-3.5 w-3.5 text-green-500" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); if (confirm("Delete this spot?")) deleteSpot(spot.id); }}
                      className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Owner Name Display ── */
function OwnerName({ userId }: { userId: string }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    supabase.from("profiles").select("username, email").eq("id", userId).maybeSingle()
      .then(({ data }) => setName(data?.username || data?.email || userId.slice(0, 8)));
  }, [userId]);
  return <span className="font-medium">{name ?? "Loading…"}</span>;
}

/* ── Spot Editor ── */
function SpotEditor({ spot, onSave, onCancel, isAdmin }: { spot: Spot; onSave: (s: Spot) => void; onCancel: () => void; isAdmin: boolean }) {
  const [s, setS] = useState({ ...spot });
  const [newImg, setNewImg] = useState("");
  const [newBtnLabel, setNewBtnLabel] = useState("");
  const [newBtnUrl, setNewBtnUrl] = useState("");

  const update = (key: keyof Spot, value: any) => setS((p) => ({ ...p, [key]: value }));

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-xl">
      <h2 className="text-lg font-semibold">Edit Spot #{s.slot_number}</h2>

      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Title</span>
        <input
          value={s.title}
          onChange={(e) => update("title", e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Short description</span>
        <input
          value={s.short_description}
          onChange={(e) => update("short_description", e.target.value)}
          placeholder="Brief tagline shown in the grid card…"
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Full description</span>
        <textarea
          value={s.long_description}
          onChange={(e) => update("long_description", e.target.value)}
          rows={5}
          placeholder="Detailed description shown on the detail page…"
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-none"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Front image URL</span>
        <input
          value={s.front_image ?? ""}
          onChange={(e) => update("front_image", e.target.value || null)}
          placeholder="https://example.com/banner.jpg"
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
        />
      </label>
      {s.front_image && (
        <img src={s.front_image} alt="Preview" className="h-32 w-full rounded-xl border border-border object-cover" />
      )}

      {/* Gallery images */}
      <div>
        <span className="text-xs font-medium text-muted-foreground">Gallery images</span>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {s.images.map((img, i) => (
            <div key={i} className="group relative">
              <img src={img} alt="" className="h-16 w-16 rounded-lg border border-border object-cover" />
              <button
                onClick={() => update("images", s.images.filter((_, j) => j !== i))}
                className="absolute -right-1 -top-1 hidden rounded-full bg-destructive p-0.5 text-destructive-foreground group-hover:block"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={newImg}
            onChange={(e) => setNewImg(e.target.value)}
            placeholder="Image URL"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary/50"
          />
          <button
            onClick={() => { if (newImg) { update("images", [...s.images, newImg]); setNewImg(""); } }}
            className="rounded-lg bg-secondary px-3 py-2 text-sm transition hover:bg-accent"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Buttons / Links */}
      <div>
        <span className="text-xs font-medium text-muted-foreground">Buttons / Links (Discord, URL, etc.)</span>
        <div className="mt-1.5 space-y-1.5">
          {s.buttons.map((btn, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs">
              <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" />
              <input
                value={btn.label}
                onChange={(e) => {
                  const btns = [...s.buttons];
                  btns[i] = { ...btns[i], label: e.target.value };
                  update("buttons", btns);
                }}
                className="flex-1 bg-transparent text-sm outline-none font-medium"
                placeholder="Label"
              />
              <input
                value={btn.url}
                onChange={(e) => {
                  const btns = [...s.buttons];
                  btns[i] = { ...btns[i], url: e.target.value };
                  update("buttons", btns);
                }}
                className="flex-[2] bg-transparent text-sm outline-none text-muted-foreground"
                placeholder="https://discord.gg/..."
              />
              <button onClick={() => update("buttons", s.buttons.filter((_, j) => j !== i))} className="text-destructive hover:underline text-xs shrink-0">
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={newBtnLabel}
            onChange={(e) => setNewBtnLabel(e.target.value)}
            placeholder="Label (e.g. Discord, Website)"
            className="w-36 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          />
          <input
            value={newBtnUrl}
            onChange={(e) => setNewBtnUrl(e.target.value)}
            placeholder="URL (e.g. https://discord.gg/invite)"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          />
          <button
            onClick={() => {
              if (newBtnLabel && newBtnUrl) {
                update("buttons", [...s.buttons, { label: newBtnLabel, url: newBtnUrl }]);
                setNewBtnLabel("");
                setNewBtnUrl("");
              }
            }}
            className="rounded-lg bg-secondary px-3 py-2 text-sm transition hover:bg-accent"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Admin toggles */}
      {isAdmin && (
        <div className="flex flex-wrap gap-4 pt-2 border-t border-border">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={s.is_active}
              onChange={() => update("is_active", !s.is_active)}
              className="rounded"
            />
            Active
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={s.is_for_sale}
              onChange={() => update("is_for_sale", !s.is_for_sale)}
              className="rounded"
            />
            For Sale
          </label>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm transition hover:bg-accent"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(s)}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          <Save className="h-4 w-4" /> Save
        </button>
      </div>
    </div>
  );
}
