import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";

const SESSION_KEY = "larping-tab-id";

function getOrCreateTabId() {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function useSingleSession(userId: string | undefined) {
  const [conflict, setConflict] = useState<{ session_id: string; user_agent?: string } | null>(null);
  const { signOut } = useAuth();
  const myId = useRef<string>("");

  useEffect(() => {
    if (!userId) return;
    myId.current = getOrCreateTabId();

    // For now, just track tab session locally without database queries
    // TODO: Implement multi-tab session management with Neon
  }, [userId]);

  const takeOver = async () => {
    if (!userId) return;
    setConflict(null);
  };

  const cancel = async () => {
    await signOut();
    window.location.href = "/";
  };

  return { conflict, takeOver, cancel };
}
