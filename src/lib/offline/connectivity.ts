/**
 * Server reachability — not just navigator.onLine.
 */
import { syncApi } from "@/lib/api";

export type ConnectivityState = "online" | "offline" | "checking";

type Listener = (state: ConnectivityState) => void;

let state: ConnectivityState =
  typeof navigator !== "undefined" && navigator.onLine ? "online" : "offline";
let lastOkAt: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<Listener>();

function setState(next: ConnectivityState) {
  if (state === next) return;
  state = next;
  listeners.forEach((l) => l(state));
}

export function getConnectivityState() {
  return state;
}

export function getLastReachableAt() {
  return lastOkAt;
}

export function subscribeConnectivity(fn: Listener): () => void {
  listeners.add(fn);
  fn(state);
  return () => {
    listeners.delete(fn);
  };
}

export async function probeServerReachability(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    setState("offline");
    return false;
  }
  setState("checking");
  try {
    const res = await syncApi.ping();
    if (res?.ok) {
      lastOkAt = res.ts ?? new Date().toISOString();
      setState("online");
      return true;
    }
    setState("offline");
    return false;
  } catch {
    setState("offline");
    return false;
  }
}

/** Start periodic pings (call once from app shell while authenticated). */
export function startConnectivityMonitor(intervalMs = 30_000) {
  if (typeof window === "undefined") return () => undefined;
  void probeServerReachability();
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    void probeServerReachability();
  }, intervalMs);

  const onOnline = () => void probeServerReachability();
  const onOffline = () => setState("offline");
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  return () => {
    if (timer) clearInterval(timer);
    timer = null;
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}

export function isServerReachable() {
  return state === "online";
}
