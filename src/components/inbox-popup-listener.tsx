"use client";

/**
 * In-app popup toasts for new inbox alerts.
 * Works on HTTP (unlike OS browser push, which needs HTTPS).
 */
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { notifyApi } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import {
  listenForegroundPush,
  registerWebPush,
  showOsNotification,
} from "@/lib/firebase-messaging";

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
  const router = useRouter();
  const qc = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const pinLocked = useAuthStore((s) => s.pinLocked);
  const primed = useRef(false);
  const recentKeys = useRef(new Map<string, number>());

  const inbox = useQuery({
    queryKey: ["notify-inbox-popup"],
    queryFn: () => notifyApi.inbox({ status: "unread", limit: 12 }),
    enabled: Boolean(accessToken) && !pinLocked,
    refetchInterval: 12_000,
    refetchOnWindowFocus: true,
    staleTime: 8_000,
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
    if (prev && now - prev < 20_000) return;
    recentKeys.current.set(key, now);

    toast(opts.title, {
      description: opts.body,
      icon: <Bell className="size-4 text-[#1a56db]" />,
      duration: 10_000,
      action: opts.href
        ? {
            label: "Open",
            onClick: () => router.push(opts.href!),
          }
        : {
            label: "Alerts",
            onClick: () => router.push("/notifications"),
          },
    });
    showOsNotification(opts.title, opts.body, opts.href ?? "/notifications");
    void qc.invalidateQueries({ queryKey: ["notify-unread"] });
  }

  useEffect(() => {
    if (!accessToken || pinLocked) return;
    void registerWebPush().then((r) => {
      if (!r.ok) return;
      return listenForegroundPush((p) => {
        showPopup({
          title: p.title,
          body: p.body,
          href: p.href,
        });
      });
    });
  }, [accessToken, pinLocked]);

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
