"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getConnectivityState,
  subscribeConnectivity,
  type ConnectivityState,
} from "@/lib/offline";
import { pendingOfflineCountAsync } from "@/lib/offline-queue";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";

/**
 * Persistent, unmissable connectivity strip for local-first POS.
 */
export function OfflineStatusBanner() {
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const [conn, setConn] = useState<ConnectivityState>(getConnectivityState());
  const [pending, setPending] = useState(0);

  useEffect(() => subscribeConnectivity(setConn), []);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    const tick = () => {
      void pendingOfflineCountAsync().then((n) => {
        if (!cancelled) setPending(n);
      });
    };
    tick();
    const id = setInterval(tick, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tenantId, conn]);

  if (conn === "online" && pending === 0) return null;

  const offline = conn === "offline";
  const checking = conn === "checking";

  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-[0.75rem] font-semibold tracking-wide",
        offline
          ? "bg-[#b45309] text-white"
          : checking
            ? "bg-[#1e3a5f] text-[#c5d4e8]"
            : "bg-[#0f766e] text-white",
      )}
    >
      <span>
        {offline
          ? "OFFLINE MODE — billing uses local data; prices/stock may be stale"
          : checking
            ? "Checking server connection…"
            : `Online — syncing ${pending} pending item${pending === 1 ? "" : "s"}`}
      </span>
      <Link
        href="/settings/offline"
        className="underline underline-offset-2 opacity-90 hover:opacity-100"
      >
        Offline status
      </Link>
    </div>
  );
}
