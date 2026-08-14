import { notifyApi } from "@/lib/api";

const STORAGE_KEY = "upos_fcm_token";

/** Strip quotes / trailing commas from .env mistakes. */
function envClean(v?: string | null) {
  if (!v) return "";
  return v
    .trim()
    .replace(/^["']/, "")
    .replace(/["']$/, "")
    .replace(/,$/, "")
    .trim();
}

function firebaseWebConfig() {
  const apiKey = envClean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
  const projectId = envClean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  const messagingSenderId = envClean(
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  );
  const appId = envClean(process.env.NEXT_PUBLIC_FIREBASE_APP_ID);
  if (!apiKey || !projectId || !messagingSenderId || !appId) return null;
  return {
    apiKey,
    authDomain:
      envClean(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) ||
      `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket:
      envClean(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) ||
      `${projectId}.appspot.com`,
    messagingSenderId,
    appId,
  };
}

export function isFirebaseWebConfigured() {
  return Boolean(
    firebaseWebConfig() && envClean(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY),
  );
}

/** OS / browser Notification API needs HTTPS (or localhost). */
export function canUseOsNotifications() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "Notification" in window
  );
}

export function showOsNotification(
  title: string,
  body: string,
  href?: string | null,
) {
  if (!canUseOsNotifications()) return false;
  if (Notification.permission !== "granted") return false;
  try {
    const n = new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: `upos-${title.slice(0, 40)}`,
    });
    n.onclick = () => {
      window.focus();
      if (href) window.location.assign(href);
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

/**
 * Request browser notification permission, obtain FCM token, register with API.
 * No-ops when Firebase env is unset, Notification API unavailable, or HTTP origin.
 */
export async function registerWebPush(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (typeof window === "undefined") {
    return { ok: false, reason: "ssr" };
  }
  if (!window.isSecureContext) {
    return { ok: false, reason: "insecure_origin" };
  }
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return { ok: false, reason: "unsupported" };
  }

  const config = firebaseWebConfig();
  const vapidKey = envClean(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY);
  if (!config || !vapidKey) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    const { initializeApp, getApps } = await import("firebase/app");
    const { getMessaging, getToken, isSupported } = await import(
      "firebase/messaging"
    );

    if (!(await isSupported())) {
      return { ok: false, reason: "unsupported" };
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, reason: "permission_denied" };
    }

    const app = getApps().length ? getApps()[0]! : initializeApp(config);
    const messaging = getMessaging(app);

    const registration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js",
      { scope: "/" },
    );
    await navigator.serviceWorker.ready;

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
    if (!token) {
      return { ok: false, reason: "no_token" };
    }

    const prev = localStorage.getItem(STORAGE_KEY);
    if (prev && prev !== token) {
      try {
        await notifyApi.unregisterPushToken(prev);
      } catch {
        /* ignore stale unregister */
      }
    }

    await notifyApi.registerPushToken(token, "web");
    localStorage.setItem(STORAGE_KEY, token);
    return { ok: true };
  } catch (e) {
    console.warn("[FCM] register failed", e);
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "register_error",
    };
  }
}

let foregroundListening = false;

/**
 * Foreground FCM → callback (OS auto-show only runs in background via SW).
 */
export async function listenForegroundPush(
  onPayload: (p: { title: string; body: string; href?: string }) => void,
): Promise<void> {
  if (typeof window === "undefined" || foregroundListening) return;
  if (!window.isSecureContext) return;

  const config = firebaseWebConfig();
  if (!config) return;

  try {
    const { initializeApp, getApps } = await import("firebase/app");
    const { getMessaging, onMessage, isSupported } = await import(
      "firebase/messaging"
    );
    if (!(await isSupported())) return;

    const app = getApps().length ? getApps()[0]! : initializeApp(config);
    const messaging = getMessaging(app);
    foregroundListening = true;
    onMessage(messaging, (payload) => {
      const title =
        payload.notification?.title ||
        payload.data?.title ||
        "Universal POS";
      const body =
        payload.notification?.body || payload.data?.body || "";
      const href = payload.data?.href || "/notifications";
      onPayload({ title, body, href });
    });
  } catch (e) {
    console.warn("[FCM] foreground listen failed", e);
  }
}

export async function unregisterWebPush(): Promise<void> {
  if (typeof window === "undefined") return;
  const token = localStorage.getItem(STORAGE_KEY);
  if (!token) return;
  try {
    await notifyApi.unregisterPushToken(token);
  } catch {
    /* ignore */
  }
  localStorage.removeItem(STORAGE_KEY);
}

export function pushFailureMessage(reason?: string) {
  switch (reason) {
    case "insecure_origin":
      return "OS popups need HTTPS (http://IP pe browser push block hota hai). In-app popups still work.";
    case "permission_denied":
      return "Notification permission denied";
    case "not_configured":
      return "Firebase not configured on this build";
    case "unsupported":
      return "Push not available on this browser";
    default:
      return reason ? `Push failed: ${reason}` : "Push not available";
  }
}
