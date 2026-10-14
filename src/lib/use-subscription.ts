import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SubInfo = {
  loading: boolean;
  active: boolean;
  isAdmin: boolean;
  expiresAt: Date | null;
  msLeft: number; // ms left, Infinity if lifetime
  plan: string | null;
  refresh: () => void;
};

export function useSubscription(userId: string | undefined): SubInfo {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Fetch sub + role
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: sub }, { data: role }] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("plan, expires_at, status")
          .eq("user_id", userId)
          .eq("status", "active")
          .order("expires_at", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setIsAdmin(!!role);
      if (sub) {
        setPlan(sub.plan);
        setExpiresAt(sub.plan === "lifetime" ? null : sub.expires_at ? new Date(sub.expires_at) : null);
      } else {
        setPlan(null);
        setExpiresAt(null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, tick]);

  // Tick the clock every second so countdown updates live
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    const onFocus = () => { setNow(Date.now()); refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  const isLifetime = plan === "lifetime";
  const msLeft = isLifetime ? Infinity : expiresAt ? expiresAt.getTime() - now : 0;
  const active = isAdmin || isLifetime || msLeft > 0;

  return { loading, active, isAdmin, expiresAt, msLeft, plan, refresh };
}

export function formatCountdown(ms: number): string {
  if (!isFinite(ms)) return "Lifetime";
  if (ms <= 0) return "Expired";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m ${sec}s`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
