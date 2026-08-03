"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { isAccessTokenExpired } from "@/lib/jwt";
import { authApi } from "@/lib/api";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const setTokens = useAuthStore((s) => s.setTokens);
  const clear = useAuthStore((s) => s.clear);
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const access = useAuthStore.getState().accessToken;
      const refresh = useAuthStore.getState().refreshToken;

      if (!access && !refresh) {
        if (!cancelled) {
          setReady(true);
          setOk(false);
          router.replace("/login");
        }
        return;
      }

      if (access && !isAccessTokenExpired(access)) {
        if (!cancelled) {
          setOk(true);
          setReady(true);
        }
        return;
      }

      if (!refresh) {
        clear();
        if (!cancelled) {
          setReady(true);
          setOk(false);
          router.replace("/login?reason=session_expired");
        }
        return;
      }

      try {
        const tokens = await authApi.refresh(refresh);
        if (cancelled) return;
        setTokens(tokens.accessToken, tokens.refreshToken);
        setOk(true);
        setReady(true);
      } catch {
        clear();
        if (!cancelled) {
          setReady(true);
          setOk(false);
          router.replace("/login?reason=session_expired");
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [clear, router, setTokens]);

  /** Quietly rotate access token ~60s before expiry while the app is open */
  useEffect(() => {
    if (!ok) return;

    const tick = async () => {
      const access = useAuthStore.getState().accessToken;
      const refresh = useAuthStore.getState().refreshToken;
      if (!refresh) return;
      if (access && !isAccessTokenExpired(access, 60_000)) return;

      try {
        const tokens = await authApi.refresh(refresh);
        setTokens(tokens.accessToken, tokens.refreshToken);
      } catch {
        clear();
        setOk(false);
        router.replace("/login?reason=session_expired");
      }
    };

    const id = window.setInterval(() => void tick(), 30_000);
    return () => window.clearInterval(id);
  }, [ok, clear, router, setTokens]);

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center text-[var(--muted)]">
        Checking session…
      </div>
    );
  }

  if (!ok) return null;
  return <>{children}</>;
}
