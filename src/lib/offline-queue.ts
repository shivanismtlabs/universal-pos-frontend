/**
 * Stable import path for POS screens — Dexie outbox with cached pending count.
 */
"use client";

import { useAuthStore } from "@/lib/auth-store";
import { newIdempotencyKey } from "@/lib/utils";
import {
  enqueueOfflineEvent as enqueueToDexie,
  enqueueOfflineEventLegacy,
  flushOfflineQueue as flushDexie,
  getDeviceId,
  isOnline,
  pendingOfflineCount as pendingDexie,
  type OfflineEvent,
} from "@/lib/offline";

export type { OfflineEvent };
export { getDeviceId, isOnline };

let cachedPending = 0;

function tenantId() {
  return useAuthStore.getState().user?.tenantId ?? "";
}

async function refreshPendingCache() {
  const tid = tenantId();
  cachedPending = await pendingDexie(tid || undefined);
  return cachedPending;
}

export function enqueueOfflineEvent(
  eventType: string,
  storeId: string,
  payload: Record<string, unknown>,
): OfflineEvent {
  const tid = tenantId();
  const clientEventId = newIdempotencyKey();
  const createdAt = new Date().toISOString();
  const event: OfflineEvent = {
    clientEventId,
    eventType,
    storeId,
    payload,
    createdAt,
  };
  cachedPending += 1;
  if (!tid) {
    enqueueOfflineEventLegacy(eventType, storeId, {
      ...payload,
      _clientEventId: clientEventId,
    });
    return event;
  }
  void enqueueToDexie(
    tid,
    eventType,
    storeId,
    payload,
    null,
    clientEventId,
  ).catch(() => {
    enqueueOfflineEventLegacy(eventType, storeId, payload);
  });
  return event;
}

/** Sync snapshot — refresh via pendingOfflineCountAsync when accuracy matters. */
export function pendingOfflineCount() {
  return cachedPending;
}

export async function pendingOfflineCountAsync() {
  return refreshPendingCache();
}

export async function flushOfflineQueue() {
  const tid = tenantId();
  if (!tid) {
    cachedPending = 0;
    return { synced: 0, remaining: 0 };
  }
  const res = await flushDexie(tid);
  cachedPending = res.remaining;
  return res;
}

/** Call on shell mount to hydrate counter from Dexie. */
export function hydrateOfflinePendingCount() {
  void refreshPendingCache();
}
