import { useState } from "react";
import { GripVertical, Eye, EyeOff } from "lucide-react";
import { useCustomization } from "@/lib/customization-context";

const ALL_NAV: { to: string; label: string }[] = [
  { to: "/dashboard", label: "Overview" },
  { to: "/dashboard/clients", label: "Clients" },
  { to: "/dashboard/builder", label: "Builder" },
  { to: "/dashboard/chat", label: "Chat" },
  { to: "/dashboard/leaderboard", label: "Leaderboard" },
  { to: "/dashboard/community", label: "Community" },
  { to: "/dashboard/refer", label: "Refer" },
  { to: "/dashboard/notifications", label: "Notifications" },
  { to: "/dashboard/subs", label: "Subscriptions" },
  { to: "/dashboard/settings", label: "Settings" },
  { to: "/dashboard/admin", label: "Admin" },
];

export function NavCustomizer() {
  const { customization, update } = useCustomization();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  // Build ordered list: custom order first (intersected with ALL_NAV), then anything not in order
  const orderMap = new Map(customization.navOrder.map((p, i) => [p, i]));
  const items = [...ALL_NAV].sort((a, b) => {
    const ai = orderMap.has(a.to) ? orderMap.get(a.to)! : 999;
    const bi = orderMap.has(b.to) ? orderMap.get(b.to)! : 999;
    return ai - bi;
  });

  const hidden = new Set(customization.navHidden);

  const commitOrder = (next: string[]) => update("navOrder", next);

  const onDrop = (target: string) => {
    if (!dragging || dragging === target) return;
    const current = items.map((i) => i.to);
    const from = current.indexOf(dragging);
    const to = current.indexOf(target);
    if (from === -1 || to === -1) return;
    current.splice(to, 0, current.splice(from, 1)[0]);
    commitOrder(current);
    setDragging(null);
    setOver(null);
  };

  const toggleHidden = (to: string) => {
    if (to === "/dashboard/settings") return; // can't hide settings
    const next = hidden.has(to)
      ? customization.navHidden.filter((p) => p !== to)
      : [...customization.navHidden, to];
    update("navHidden", next);
  };

  return (
    <div className="space-y-1.5">
      {items.map((item) => {
        const isHidden = hidden.has(item.to);
        const isOver = over === item.to;
        const isDragging = dragging === item.to;
        return (
          <div
            key={item.to}
            draggable
            onDragStart={() => setDragging(item.to)}
            onDragEnd={() => { setDragging(null); setOver(null); }}
            onDragOver={(e) => { e.preventDefault(); setOver(item.to); }}
            onDragLeave={() => setOver((cur) => (cur === item.to ? null : cur))}
            onDrop={(e) => { e.preventDefault(); onDrop(item.to); }}
            className={`flex items-center gap-2 rounded-md border bg-secondary/40 px-3 py-2 text-sm transition ${
              isOver && !isDragging ? "border-primary ring-2 ring-primary/40" : "border-border"
            } ${isDragging ? "opacity-40" : ""} ${isHidden ? "opacity-50" : ""}`}
          >
            <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground active:cursor-grabbing" />
            <span className="flex-1">{item.label}</span>
            <button
              onClick={() => toggleHidden(item.to)}
              disabled={item.to === "/dashboard/settings"}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
              title={isHidden ? "Show" : "Hide"}
            >
              {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        );
      })}
      <p className="pt-1 text-[11px] text-muted-foreground">Drag to reorder. Click the eye to hide a page from the nav.</p>
    </div>
  );
}