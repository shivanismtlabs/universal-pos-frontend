/**
 * Append-only local outbox (Dexie) — supersedes localStorage queue.
 * Keeps legacy helpers for POS cash queue compatibility.
 */
import { syncApi } from "@/lib/api";
import { newIdempotencyKey } from "@/lib/utils";
import { getOfflineDb, type OfflineOutboxItem } from "./db";
import { isServerReachable } from "./connectivity";

const DEVICE_KEY = "universal-pos-device-id";
const LEGACY_QUEUE_KEY = "universal-pos-offline-queue";

export type OfflineEvent = {
  clientEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  storeId: string;
  createdAt: string;
};

export function getDeviceId() {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `dev-${newIdempotencyKey().slice(0, 12)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function isOnline() {
  return isServerReachable();
}

async function migrateLegacyQueue(tenantId: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(LEGACY_QUEUE_KEY);
    if (!raw) return;
    const items = JSON.parse(raw) as OfflineEvent[];
    if (!Array.isArray(items) || !items.length) {
      localStorage.removeItem(LEGACY_QUEUE_KEY);
      return;
    }
    const db = getOfflineDb(tenantId);
    for (const item of items) {
      const exists = await db.outbox
        .where("clientEventId")
        .equals(item.clientEventId)
        .first();
      if (exists) continue;
      await db.outbox.add({
        id: crypto.randomUUID(),
        clientEventId: item.clientEventId,
        eventType: item.eventType,
        locationId: item.storeId,
        payloadJson: JSON.stringify(item.payload),
        createdAt: item.createdAt,
        attempts: 0,
        lastError: null,
        status: "pending",
        dependsOn: null,
      });
    }
    localStorage.removeItem(LEGACY_QUEUE_KEY);
  } catch {
    /* ignore bad legacy */
  }
}

export async function enqueueOfflineEvent(
  tenantId: string,
  eventType: string,
  locationId: string,
  payload: Record<string, unknown>,
  dependsOn?: string | null,
  clientEventId?: string,
) {
  await migrateLegacyQueue(tenantId);
  const item: OfflineOutboxItem = {
    id: crypto.randomUUID(),
    clientEventId: clientEventId ?? newIdempotencyKey(),
    eventType,
    locationId,
    payloadJson: JSON.stringify(payload),
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
    status: "pending",
    dependsOn: dependsOn ?? null,
  };
  await getOfflineDb(tenantId).outbox.add(item);
  return {
    clientEventId: item.clientEventId,
    eventType: item.eventType,
    payload,
    storeId: locationId,
    createdAt: item.createdAt,
  } satisfies OfflineEvent;
}

/** Legacy signature used by POS workstations (uses auth tenant from caller). */
export function enqueueOfflineEventLegacy(
  eventType: string,
  storeId: string,
  payload: Record<string, unknown>,
) {
  // Sync enqueue into localStorage fallback if tenant unknown — POS should migrate
  const items = (() => {
    try {
      return JSON.parse(
        localStorage.getItem(LEGACY_QUEUE_KEY) ?? "[]",
      ) as OfflineEvent[];
    } catch {
      return [] as OfflineEvent[];
    }
  })();
  const event: OfflineEvent = {
    clientEventId: newIdempotencyKey(),
    eventType,
    storeId,
    payload,
    createdAt: new Date().toISOString(),
  };
  items.push(event);
  localStorage.setItem(LEGACY_QUEUE_KEY, JSON.stringify(items));
  return event;
}

export async function pendingOfflineCount(tenantId?: string) {
  if (!tenantId) {
    try {
      return (
        JSON.parse(localStorage.getItem(LEGACY_QUEUE_KEY) ?? "[]") as unknown[]
      ).length;
    } catch {
      return 0;
    }
  }
  await migrateLegacyQueue(tenantId);
  return getOfflineDb(tenantId)
    .outbox.where("status")
    .anyOf(["pending", "failed", "syncing"])
    .count();
}

export async function flushOfflineQueue(tenantId: string) {
  await migrateLegacyQueue(tenantId);
  if (!isServerReachable()) {
    const remaining = await pendingOfflineCount(tenantId);
    return { synced: 0, remaining, failed: 0 };
  }

  const db = getOfflineDb(tenantId);
  const pending = await db.outbox
    .where("status")
    .anyOf(["pending", "failed"])
    .sortBy("createdAt");

  const deviceId = getDeviceId();
  let synced = 0;
  let failed = 0;

  for (const item of pending) {
    if (item.dependsOn) {
      const dep = await db.outbox.get(item.dependsOn);
      if (dep && dep.status !== "done") continue;
    }
    await db.outbox.update(item.id, { status: "syncing" });
    try {
      await syncApi.pushEvent({
        deviceId,
        storeId: item.locationId,
        clientEventId: item.clientEventId,
        eventType: item.eventType,
        payload: JSON.parse(item.payloadJson) as Record<string, unknown>,
      });
      await db.outbox.update(item.id, {
        status: "done",
        lastError: null,
        attempts: item.attempts + 1,
      });
      synced += 1;
    } catch (e) {
      failed += 1;
      await db.outbox.update(item.id, {
        status: "failed",
        attempts: item.attempts + 1,
        lastError: e instanceof Error ? e.message : "sync_failed",
      });
    }
  }

  const remaining = await pendingOfflineCount(tenantId);
  return { synced, remaining, failed };
}
