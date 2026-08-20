"use client";

/**
 * Floating in-app notification toasts (low stock, payment due, etc.).
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
import { AlertTriangle, Bell, Package, X } from "lucide-react";
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
    throw new Error(
      "useNotificationPopups must be used within NotificationPopupProvider",
    );
  }
  return ctx;
}

/** Safe hook — returns null when provider missing (SSR / tests). */
export function useNotificationPopupsOptional() {
  return useContext(NotificationPopupContext);
}

function popupKind(title: string, body: string) {
  const t = `${title} ${body}`.toLowerCase();
  if (t.includes("low stock") || t.includes("reorder")) return "stock" as const;
  if (t.includes("payment") || t.includes("due") || t.includes("overdue"))
    return "warn" as const;
  return "info" as const;
}

export function NotificationPopupProvider({
  children,
}: {
  children: ReactNode;
}) {
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
      const id =
        n.id ?? `np-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setItems((prev) => {
        if (prev.some((x) => x.id === id)) return prev;
        if (prev.some((x) => x.title === n.title && x.body === n.body)) {
          return prev;
        }
        return [...prev, { id, title: n.title, body: n.body, href: n.href }].slice(
          -5,
        );
      });
      window.setTimeout(() => dismiss(id), 14_000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ pushPopup }), [pushPopup]);

  const stack = (
    <div
      className="pointer-events-none fixed right-3 bottom-3 z-[9999] flex w-[min(100%-1.5rem,22.5rem)] flex-col gap-2.5 sm:right-5 sm:bottom-5"
      aria-live="assertive"
      data-upos-notify-stack
    >
      <AnimatePresence initial={false}>
        {items.map((n) => {
          const kind = popupKind(n.title, n.body);
          const Icon =
            kind === "stock" ? Package : kind === "warn" ? AlertTriangle : Bell;
          const accent =
            kind === "stock"
              ? "border-l-[#1a56db] bg-[#eef2ff] text-[#1a56db]"
              : kind === "warn"
                ? "border-l-[#d97706] bg-[#fff7ed] text-[#c2410c]"
                : "border-l-[#64748b] bg-[#f1f5f9] text-[#475569]";
          return (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto overflow-hidden rounded-lg border border-[#e2e8f0] border-l-4 bg-white shadow-[0_8px_28px_-10px_rgba(15,23,42,0.35)]"
              style={{
                borderLeftColor:
                  kind === "stock"
                    ? "#1a56db"
                    : kind === "warn"
                      ? "#d97706"
                      : "#94a3b8",
              }}
              role="alertdialog"
              aria-label={n.title}
            >
              <div className="flex gap-3 p-3.5">
                <span
                  className={cn(
                    "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md border border-transparent",
                    accent,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[0.65rem] font-semibold tracking-[0.08em] text-[#94a3b8] uppercase">
                        Alert
                      </p>
                      <p className="mt-0.5 text-[0.9rem] font-semibold leading-snug text-[#0b1f33]">
                        {n.title}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-md p-1 text-[#94a3b8] hover:bg-[#f8fafc] hover:text-[#0b1f33]"
                      aria-label="Close"
                      onClick={() => dismiss(n.id)}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {n.body ? (
                    <p className="mt-1 line-clamp-3 text-[0.8rem] leading-relaxed text-[#64748b]">
                      {n.body}
                    </p>
                  ) : null}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      className={cn(
                        "rounded-md bg-[#1a56db] px-3 py-1.5 text-[0.75rem] font-semibold text-white",
                        "hover:bg-[#1648c0]",
                      )}
                      onClick={() => {
                        dismiss(n.id);
                        router.push(n.href || "/notifications");
                      }}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      className="rounded-md px-2.5 py-1.5 text-[0.75rem] font-medium text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0b1f33]"
                      onClick={() => dismiss(n.id)}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
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
