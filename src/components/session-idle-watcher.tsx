"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useBootstrap } from "@/lib/bootstrap";
import { useAuthStore } from "@/lib/auth-store";
import { toast } from "sonner";

/**
 * Logs out after N minutes of no mouse/keyboard (tenant security setting).
 * 0 / missing = disabled.
 */
export function SessionIdleWatcher() {
  const router = useRouter();
  const { data: boot } = useBootstrap();
  const accessToken = useAuthStore((s) => s.accessToken);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const minutes = (() => {
    const sec = boot?.tenant?.settings?.security as
      | { idleTimeoutMinutes?: number }
      | undefined;
    const n = Number(sec?.idleTimeoutMinutes);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();

  useEffect(() => {
    if (!accessToken || minutes <= 0) return;

    const logout = () => {
      useAuthStore.getState().clear();
      toast.message("Signed out due to inactivity");
      router.replace("/login?reason=session_expired");
    };

    const bump = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(logout, minutes * 60_000);
    };

    bump();
    const evts = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    evts.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    return () => {
      if (timer.current) clearTimeout(timer.current);
      evts.forEach((e) => window.removeEventListener(e, bump));
    };
  }, [accessToken, minutes, router]);

  return null;
}
