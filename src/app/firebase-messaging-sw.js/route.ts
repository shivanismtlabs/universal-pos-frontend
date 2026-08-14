import { NextResponse } from "next/server";

function envClean(v?: string | null) {
  if (!v) return "";
  return v
    .trim()
    .replace(/^["']/, "")
    .replace(/["']$/, "")
    .replace(/,$/, "")
    .trim();
}

/**
 * Serves the FCM service worker with Firebase web config injected from env.
 * Path: /firebase-messaging-sw.js
 */
export function GET() {
  const apiKey = envClean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
  const projectId = envClean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  const authDomain =
    envClean(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) ||
    (projectId ? `${projectId}.firebaseapp.com` : "");
  const storageBucket =
    envClean(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) ||
    (projectId ? `${projectId}.appspot.com` : "");
  const messagingSenderId = envClean(
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  );
  const appId = envClean(process.env.NEXT_PUBLIC_FIREBASE_APP_ID);

  const body = `/* Universal POS — Firebase Messaging SW */
importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: ${JSON.stringify(apiKey)},
  authDomain: ${JSON.stringify(authDomain)},
  projectId: ${JSON.stringify(projectId)},
  storageBucket: ${JSON.stringify(storageBucket)},
  messagingSenderId: ${JSON.stringify(messagingSenderId)},
  appId: ${JSON.stringify(appId)},
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const title =
    (payload.notification && payload.notification.title) ||
    (payload.data && payload.data.title) ||
    'Universal POS';
  const bodyText =
    (payload.notification && payload.notification.body) ||
    (payload.data && payload.data.body) ||
    '';
  const href = (payload.data && payload.data.href) || '/notifications';
  self.registration.showNotification(title, {
    body: bodyText,
    icon: '/favicon.ico',
    data: { href: href },
  });
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const href =
    (event.notification.data && event.notification.data.href) ||
    '/notifications';
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if ('focus' in client) {
            client.navigate(href);
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(href);
        }
      }),
  );
});
`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
