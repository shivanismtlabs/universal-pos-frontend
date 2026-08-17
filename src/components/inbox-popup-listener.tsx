"use client";

/**
 * New inbox / FCM alerts → floating popup cards + toast alert fallback.
 * On http://IP Firebase OS push is blocked; inbox poll still drives in-app UI.
 */
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { notifyApi } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import {
  canUseOsNotifications,
  listenForegroundPush,
  registerWebPush,
  showOsNotification,
} from "@/lib/firebase-messaging";
import { useNotificationPopupsOptional } from "@/components/notification-popup";

const SEEN_KEY = "upos_notif_seen_ids";

function loadSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveSeen(ids: Set<string>) {
  try {
    const arr = [...ids].slice(-200);
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch {
    /* ignore quota */
  }
}

function popupKey(title: string, body: string) {
  return `${title}\0${body}`.slice(0, 200);
}

export function InboxPopupListener() {
  const qc = useQueryClient();
  const popups = useNotificationPopupsOptional();
  const pushRef = useRef(popups?.pushPopup);
  pushRef.current = popups?.pushPopup;

  const accessToken = useAuthStore((s) => s.accessToken);
  const pinLocked = useAuthStore((s) => s.pinLocked);
  const primed = useRef(false);
  const recentKeys = useRef(new Map<string, number>());
  const lastUnread = useRef<number | null>(null);
  const httpsHintShown = useRef(false);

  const inbox = useQuery({
    queryKey: ["notify-inbox-popup"],
    queryFn: () => notifyApi.inbox({ status: "unread", limit: 20 }),
    enabled: Boolean(accessToken) && !pinLocked,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    staleTime: 2_000,
  });

  const unreadQ = useQuery({
    queryKey: ["notify-unread"],
    queryFn: () => notifyApi.unreadCount(),
    enabled: Boolean(accessToken) && !pinLocked,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    staleTime: 2_000,
  });

  function showPopup(opts: {
    id?: string;
    title: string;
    body: string;
    href?: string | null;
  }) {
    const key = popupKey(opts.title, opts.body);
    const now = Date.now();
    const prev = recentKeys.current.get(key);
    if (prev && now - prev < 15_000) return;
    recentKeys.current.set(key, now);

    const title = opts.title?.trim() || "Universal POS";
    const body = opts.body?.trim() || "";

    // 1) Floating card (always when provider present)
    if (pushRef.current) {
      pushRef.current({
        id: opts.id,
        title,
        body,
        href: opts.href,
      });
    }

    // 2) Toast “alert” fallback (visible even if card CSS/z-index fails)
    toast(title, {
      description: body || undefined,
      duration: 10_000,
      action: {
        label: "Open",
        onClick: () => {
          window.location.assign(opts.href || "/notifications");
        },
      },
    });

    // 3) OS system popup only on HTTPS + permission
    showOsNotification(title, body, opts.href ?? "/notifications");
    void qc.invalidateQueries({ queryKey: ["notify-unread"] });
  }

  // Expose for Notifications page “Test popup”
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ title?: string; body?: string; href?: string }>)
        .detail;
      showPopup({
        title: detail?.title || "Test notification",
        body: detail?.body || "In-app popup is working.",
        href: detail?.href || "/notifications",
      });
    };
    window.addEventListener("upos:notify-test", handler);
    return () => window.removeEventListener("upos:notify-test", handler);
  }, []);

  // One-time HTTPS tip on insecure live IP
  useEffect(() => {
    if (!accessToken || pinLocked || httpsHintShown.current) return;
    if (canUseOsNotifications()) return;
    httpsHintShown.current = true;
    // Soft info only — do not look like a real alert failure
    console.info(
      "[notify] Browser/Firebase OS push needs HTTPS. In-app popup + toast still work on this http://IP.",
    );
  }, [accessToken, pinLocked]);

  // FCM foreground (HTTPS only)
  useEffect(() => {
    if (!accessToken || pinLocked) return;
    let cancelled = false;
    void registerWebPush().then((r) => {
      if (cancelled || !r.ok) return;
      return listenForegroundPush((p) => {
        if (cancelled) return;
        showPopup({
          title: p.title,
          body: p.body,
          href: p.href,
        });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, pinLocked]);

  // Unread count jumped → refetch inbox immediately
  useEffect(() => {
    const count = unreadQ.data?.unreadCount;
    if (typeof count !== "number") return;
    if (lastUnread.current === null) {
      lastUnread.current = count;
      return;
    }
    if (count > lastUnread.current) {
      void qc.invalidateQueries({ queryKey: ["notify-inbox-popup"] });
    }
    lastUnread.current = count;
  }, [unreadQ.data?.unreadCount, qc]);

  // New inbox rows → popup
  useEffect(() => {
    const items = inbox.data?.items;
    if (!items) return;

    if (!primed.current) {
      primed.current = true;
      const seen = loadSeen();
      for (const n of items) seen.add(n.id);
      saveSeen(seen);
      return;
    }

    const seen = loadSeen();
    let changed = false;
    for (const n of [...items].reverse()) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      changed = true;
      showPopup({
        id: n.id,
        title: n.title,
        body: n.body,
        href: n.href,
      });
    }
    if (changed) saveSeen(seen);
  }, [inbox.data]);

  return null;
}
