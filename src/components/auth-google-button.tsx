"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string;
            callback: (res: { credential: string }) => void;
          }) => void;
          prompt: () => void;
          renderButton?: (
            el: HTMLElement,
            cfg: Record<string, unknown>,
          ) => void;
        };
      };
    };
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || "";

function loadGis(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${GIS_SRC}"]`,
  );
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Google script failed")),
      );
    });
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Google script failed"));
    document.head.appendChild(s);
  });
}

export function AuthDivider({ label = "or continue with email" }: { label?: string }) {
  return (
    <div className="relative my-5 text-center">
      <div className="absolute inset-x-0 top-1/2 border-t border-[#e2e8f0]" />
      <span className="relative bg-white px-3 text-[0.75rem] font-medium text-[#8b9bb0]">
        {label}
      </span>
    </div>
  );
}

type Props = {
  mode: "login" | "register";
  /** Called with Google ID token when GIS succeeds */
  onCredential: (idToken: string) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
};

/**
 * Google sign-in button (Conversly-style).
 * Requires NEXT_PUBLIC_GOOGLE_CLIENT_ID + backend /auth/google.
 */
export function AuthGoogleButton({
  mode,
  onCredential,
  disabled,
  className,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadGis()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        /* button still shown; click will toast */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClick = useCallback(async () => {
    if (disabled || busy) return;
    if (!CLIENT_ID) {
      toast.message("Google sign-in not configured", {
        description:
          "Add NEXT_PUBLIC_GOOGLE_CLIENT_ID (and GOOGLE_CLIENT_ID on API) to enable.",
      });
      return;
    }
    try {
      setBusy(true);
      await loadGis();
      if (!window.google?.accounts?.id) {
        throw new Error("Google Sign-In unavailable");
      }
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: async (res) => {
          try {
            await onCredential(res.credential);
          } catch {
            /* parent handles toast */
          } finally {
            setBusy(false);
          }
        },
      });
      // One-tap / prompt — if blocked, fall back to message
      window.google.accounts.id.prompt();
      // Reset busy if prompt dismissed without credential
      window.setTimeout(() => setBusy(false), 4000);
    } catch (e) {
      setBusy(false);
      toast.error(
        e instanceof Error ? e.message : "Could not start Google sign-in",
      );
    }
  }, [busy, disabled, onCredential]);

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={handleClick}
      className={cn(
        "inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-[10px] border border-[#d9e0ea] bg-white text-[0.875rem] font-semibold text-[#0b1f33] transition hover:bg-[#f8fafc] disabled:opacity-50",
        className,
      )}
    >
      <GoogleGlyph />
      {busy
        ? "Connecting…"
        : mode === "register"
          ? "Sign up with Google"
          : "Sign in with Google"}
      {CLIENT_ID && !ready ? null : null}
    </button>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
