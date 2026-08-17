"use client";

/**
 * Floating notification popups (OS-style cards).
 * Portaled to document.body so overflow/transform on app shell cannot hide them.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Bell, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export type AppNotificationPopup = {
  id: string;
  title: string;
  body: string;
  href?: string | null;
};

type Ctx = {
  pushPopup: (n: Omit<AppNotificationPopup, "id"> & { id?: string }) => void;
};

const NotificationPopupContext = createContext<Ctx | null>(null);

export function useNotificationPopups() {
  const ctx = useContext(NotificationPopupContext);
  if (!ctx) {
    throw new Error("useNotificationPopups must be used within NotificationPopupProvider");
  }
  return ctx;
}

/** Safe hook — returns null when provider missing (SSR / tests). */
export function useNotificationPopupsOptional() {
  return useContext(NotificationPopupContext);
}

export function NotificationPopupProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [items, setItems] = useState<AppNotificationPopup[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const pushPopup = useCallback(
    (n: Omit<AppNotificationPopup, "id"> & { id?: string }) => {
      const id = n.id ?? `np-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setItems((prev) => {
        if (prev.some((x) => x.id === id)) return prev;
        if (prev.some((x) => x.title === n.title && x.body === n.body)) {
          return prev;
        }
        return [...prev, { id, title: n.title, body: n.body, href: n.href }].slice(-5);
      });
      window.setTimeout(() => dismiss(id), 14_000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ pushPopup }), [pushPopup]);

  const stack = (
    <div
      className="pointer-events-none fixed right-3 bottom-3 z-[9999] flex w-[min(100%-1.5rem,22rem)] flex-col gap-2 sm:right-5 sm:bottom-5"
      aria-live="assertive"
      data-upos-notify-stack
    >
      <AnimatePresence initial={false}>
        {items.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22 }}
            className="pointer-events-auto overflow-hidden rounded-xl border border-[#d9e0ea] bg-white shadow-[0_12px_40px_-12px_rgba(11,31,51,0.45)]"
            role="alertdialog"
            aria-label={n.title}
          >
            <div className="flex gap-3 p-3.5">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#e8eefb] text-[#1a56db]">
                <Bell className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.65rem] font-bold tracking-[0.1em] text-[#1a56db] uppercase">
                  Universal POS
                </p>
                <p className="mt-0.5 text-sm font-semibold text-[#0b1f33]">{n.title}</p>
                {n.body ? (
                  <p className="mt-0.5 line-clamp-3 text-[0.8rem] leading-snug text-[#5a6b7d]">
                    {n.body}
                  </p>
                ) : null}
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={cn(
                      "rounded-md bg-[#1a56db] px-2.5 py-1 text-[0.72rem] font-semibold text-white",
                      "hover:bg-[#1648c0]",
                    )}
                    onClick={() => {
                      dismiss(n.id);
                      router.push(n.href || "/notifications");
                    }}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="rounded-md px-2.5 py-1 text-[0.72rem] font-medium text-[#5a6b7d] hover:bg-[#f4f6fa]"
                    onClick={() => dismiss(n.id)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-md p-1 text-[#8b9bb0] hover:bg-[#f4f6fa] hover:text-[#0b1f33]"
                aria-label="Close"
                onClick={() => dismiss(n.id)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );

  return (
    <NotificationPopupContext.Provider value={value}>
      {children}
      {mounted ? createPortal(stack, document.body) : null}
    </NotificationPopupContext.Provider>
  );
}
