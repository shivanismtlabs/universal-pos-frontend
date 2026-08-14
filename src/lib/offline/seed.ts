import { syncApi, type OfflineSnapshot } from "@/lib/api";
import {
  getOfflineDb,
  getMeta,
  setMeta,
  verifyOfflineDbIntegrity,
  wipeAndRecreateOfflineDb,
  type OfflineOutboxItem,
} from "./db";
import { encryptJson, isOfflineCryptoUnlocked } from "./crypto";

export type SeedProgress = {
  phase: string;
  percent: number;
  message: string;
};

/**
 * Full or incremental download into local IndexedDB.
 */
export async function pullOfflineSnapshot(opts: {
  tenantId: string;
  locationId: string;
  full?: boolean;
  onProgress?: (p: SeedProgress) => void;
}) {
  const { tenantId, locationId } = opts;
  const report = (phase: string, percent: number, message: string) =>
    opts.onProgress?.({ phase, percent, message });

  report("integrity", 5, "Checking local database…");
  const integrity = await verifyOfflineDbIntegrity(tenantId);
  if (!integrity.ok) {
    report("repair", 8, "Local DB corrupt — re-seeding…");
    await wipeAndRecreateOfflineDb(tenantId);
  }

  const lastSync = opts.full
    ? null
    : await getMeta(tenantId, `lastSyncAt:${locationId}`);

  report("download", 15, lastSync ? "Pulling updates…" : "Downloading catalog…");
  const snap = await syncApi.snapshot({
    locationId,
    since: lastSync ?? undefined,
  });

  const db = getOfflineDb(tenantId);
  report("products", 35, `Writing ${snap.counts.products} products…`);
  await db.products.bulkPut(
    snap.products.map((p) => ({
      ...p,
      shortName: p.shortName ?? null,
      barcode: p.barcode ?? null,
      categoryId: p.categoryId ?? null,
      mrp: p.mrp ?? null,
      taxCode: p.taxCode ?? null,
      photoUrl: p.photoUrl ?? null,
    })),
  );

  report("stock", 50, `Writing ${snap.counts.stockLevels} stock rows…`);
  const asOf = snap.serverTime;
  await db.stockLevels.bulkPut(
    snap.stockLevels.map((s) => ({
      ...s,
      reorderPoint: s.reorderPoint ?? null,
      asOf,
    })),
  );

  report("customers", 65, `Writing ${snap.counts.customers} customers…`);
  const customers = [];
  for (const c of snap.customers) {
    let encPii: string | null = null;
    if (isOfflineCryptoUnlocked()) {
      try {
        encPii = await encryptJson({
          phone: c.phone,
          email: c.email,
          name: c.name,
        });
      } catch {
        encPii = null;
      }
    }
    customers.push({
      id: c.id,
      name: c.name,
      phone: c.phone ?? null,
      email: c.email ?? null,
      creditLimit: c.creditLimit ?? null,
      storeCreditBalance: c.storeCreditBalance,
      loyaltyPoints: c.loyaltyPoints,
      updatedAt: c.updatedAt,
      encPii,
    });
  }
  await db.customers.bulkPut(customers);

  report("promos", 78, `Writing ${snap.counts.coupons} promotions…`);
  await db.coupons.bulkPut(
    snap.coupons.map((c) => ({
      ...c,
      description: c.description ?? null,
      minOrderAmount: c.minOrderAmount ?? null,
      maxRedemptions: c.maxRedemptions ?? null,
      startsAt: c.startsAt ?? null,
      endsAt: c.endsAt ?? null,
    })),
  );

  report("categories", 85, `Writing ${snap.counts.categories} categories…`);
  await db.categories.bulkPut(
    snap.categories.map((c) => ({
      ...c,
      parentId: c.parentId ?? null,
    })),
  );

  report("staff", 92, `Writing ${snap.counts.staff} staff PIN records…`);
  await db.staff.bulkPut(
    snap.staff.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      email: s.email,
      pinHash: s.pinHash ?? "",
      primaryLocationId: s.primaryLocationId ?? null,
      roles: s.roles,
      updatedAt: s.updatedAt,
      failedPinAttempts: 0,
      lockedUntil: null,
    })),
  );

  await setMeta(tenantId, `lastSyncAt:${locationId}`, snap.serverTime);
  await setMeta(
    tenantId,
    `lastFullSyncAt:${locationId}`,
    opts.full || !lastSync
      ? snap.serverTime
      : ((await getMeta(tenantId, `lastFullSyncAt:${locationId}`)) ??
          snap.serverTime),
  );
  await setMeta(
    tenantId,
    "offlinePolicy",
    JSON.stringify(snap.offlinePolicy),
  );
  await setMeta(tenantId, "tax", JSON.stringify(snap.tax));
  await setMeta(tenantId, `location:${locationId}`, JSON.stringify(snap.location));

  // Retention prune for local sales
  const months = snap.offlinePolicy.saleHistoryMonths ?? 3;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  await db.sales
    .where("createdAt")
    .below(cutoff.toISOString())
    .and((s) => Boolean(s.syncedAt))
    .delete();

  report("done", 100, "Local data ready");
  return snap;
}

export async function getOfflineDiagnostics(tenantId: string, locationId: string) {
  const db = getOfflineDb(tenantId);
  const [
    products,
    stock,
    customers,
    coupons,
    sales,
    outboxPending,
    lastSync,
    lastFull,
    integrity,
  ] = await Promise.all([
    db.products.count(),
    db.stockLevels.where("locationId").equals(locationId).count(),
    db.customers.count(),
    db.coupons.count(),
    db.sales.count(),
    db.outbox.where("status").anyOf(["pending", "failed", "syncing"]).count(),
    getMeta(tenantId, `lastSyncAt:${locationId}`),
    getMeta(tenantId, `lastFullSyncAt:${locationId}`),
    verifyOfflineDbIntegrity(tenantId),
  ]);

  let approxBytes = 0;
  if (typeof navigator !== "undefined" && "storage" in navigator) {
    try {
      const est = await navigator.storage.estimate();
      approxBytes = est.usage ?? 0;
    } catch {
      approxBytes = 0;
    }
  }

  return {
    integrity,
    counts: { products, stock, customers, coupons, sales, outboxPending },
    lastIncrementalSyncAt: lastSync,
    lastFullSyncAt: lastFull,
    storageUsageBytes: approxBytes,
  };
}

/** Estimate for diagnostics UI */
export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export async function listPendingOutbox(
  tenantId: string,
): Promise<OfflineOutboxItem[]> {
  return getOfflineDb(tenantId)
    .outbox.where("status")
    .anyOf(["pending", "failed", "syncing"])
    .sortBy("createdAt");
}

export type { OfflineSnapshot };
