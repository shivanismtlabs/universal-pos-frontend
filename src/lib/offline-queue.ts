"use client";

import { syncApi } from "@/lib/api";
import { newIdempotencyKey } from "@/lib/utils";

const QUEUE_KEY = "tuxedo-offline-queue";
const DEVICE_KEY = "tuxedo-device-id";

export type OfflineEvent = {
  clientEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  storeId: string;
  createdAt: string;
};

function readQueue(): OfflineEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as OfflineEvent[];
  } catch {
    return [];
  }
}

function writeQueue(items: OfflineEvent[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

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
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

export function enqueueOfflineEvent(
  eventType: string,
  storeId: string,
  payload: Record<string, unknown>,
) {
  const items = readQueue();
  const event: OfflineEvent = {
    clientEventId: newIdempotencyKey(),
    eventType,
    storeId,
    payload,
    createdAt: new Date().toISOString(),
  };
  items.push(event);
  writeQueue(items);
  return event;
}

export function pendingOfflineCount() {
  return readQueue().length;
}

export async function flushOfflineQueue() {
  const items = readQueue();
  if (!items.length || !isOnline()) return { synced: 0, remaining: items.length };

  const remaining: OfflineEvent[] = [];
  let synced = 0;
  const deviceId = getDeviceId();

  for (const item of items) {
    try {
      await syncApi.pushEvent({
        deviceId,
        storeId: item.storeId,
        clientEventId: item.clientEventId,
        eventType: item.eventType,
        payload: item.payload,
      });
      synced += 1;
    } catch {
      remaining.push(item);
    }
  }
  writeQueue(remaining);
  return { synced, remaining: remaining.length };
}
