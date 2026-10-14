// Command dispatch over the persistent HidenHost WebSocket relay.
//
// Every panel calls `useDeviceCommands(deviceId).send(action, payload)` and
// gets a matching `{ status, result, error }` back. Under the hood we send
// `{ type:"cmd", payload:{ id, action, ...payload } }` to the relay and
// resolve on the matching `{ type:"result", payload:{ id, ok, result, error } }`.
//
// No `commands` DB round-trip. No polling. Pure TCP hop through the
// already-open agent socket.

import { useCallback, useEffect, useRef } from "react";
import { useRelaySocket } from "@/lib/relay";

export type CommandRow = {
  id: string;
  status: "done" | "error";
  result: any;
  error: string | null;
};

type Waiter = {
  resolve: (r: CommandRow) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

function newId(): string {
  const g: any = globalThis;
  return g.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useDeviceCommands(deviceId: string) {
  const { connected, send: relaySend, onMessage } = useRelaySocket(deviceId);
  const waiters = useRef<Map<string, Waiter>>(new Map());

  useEffect(() => {
    const off = onMessage((msg) => {
      if (msg.type !== "result") return;
      const p = msg.payload ?? {};
      const id: string | undefined = p.id;
      if (!id) return;
      const w = waiters.current.get(id);
      if (!w) return;
      clearTimeout(w.timer);
      waiters.current.delete(id);
      if (p.ok === false) {
        w.reject(new Error(p.error || "Command failed on agent"));
      } else {
        w.resolve({ id, status: "done", result: p.result, error: null });
      }
    });
    return off;
  }, [onMessage]);

  const send = useCallback(
    (action: string, payload: any = {}, timeoutMs = 30000): Promise<CommandRow> => {
      const id = newId();
      return new Promise<CommandRow>((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.current.delete(id);
          reject(new Error("No response from device — it may be offline or busy"));
        }, timeoutMs);
        waiters.current.set(id, { resolve, reject, timer });
        relaySend({ type: "cmd", payload: { id, action, ...payload } });
      });
    },
    [relaySend],
  );

  return { send, connected };
}
