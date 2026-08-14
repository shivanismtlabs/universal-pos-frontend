import { notifyApi } from "@/lib/api";

const STORAGE_KEY = "upos_fcm_token";

function firebaseWebConfig() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const messagingSenderId =
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim();
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim();
  if (!apiKey || !projectId || !messagingSenderId || !appId) return null;
  return {
    apiKey,
    authDomain:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() ||
      `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() ||
      `${projectId}.appspot.com`,
    messagingSenderId,
    appId,
  };
}

export function isFirebaseWebConfigured() {
  return Boolean(firebaseWebConfig() && process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim());
}

/**
 * Request browser notification permission, obtain FCM token, register with API.
 * No-ops when Firebase env is unset or Notification API unavailable.
 */
export async function registerWebPush(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (typeof window === "undefined") {
    return { ok: false, reason: "ssr" };
  }
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return { ok: false, reason: "unsupported" };
  }

  const config = firebaseWebConfig();
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim();
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
