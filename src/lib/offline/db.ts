/**
 * Universal POS — local-first IndexedDB (Dexie).
 * Schema mirrors server entities needed for offline POS + append-only outbox.
 */
import Dexie, { type EntityTable } from "dexie";

export const OFFLINE_DB_VERSION = 1;

export type OfflineProduct = {
  id: string;
  name: string;
  shortName?: string | null;
  skuCode: string;
  barcode?: string | null;
  categoryId?: string | null;
  kind: string;
  status: string;
  basePrice: number;
  mrp?: number | null;
  taxCode?: string | null;
  unitOfMeasure: string;
  trackQty: boolean;
  canSell: boolean;
  availableInPos: boolean;
  photoUrl?: string | null;
  updatedAt: string;
};

export type OfflineStockLevel = {
  id: string;
  productId: string;
  locationId: string;
  sku: string;
  qtyOnHand: number;
  qtyDamaged: number;
  reorderPoint?: number | null;
  sellPrice: number;
  /** As-of timestamp from last sync for this row */
  updatedAt: string;
  asOf: string;
};

export type OfflineCustomer = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  creditLimit?: number | null;
  storeCreditBalance: number;
  loyaltyPoints: number;
  updatedAt: string;
  /** Encrypted blob when crypto unlocked (phone/email optional mirror) */
  encPii?: string | null;
};

export type OfflineCoupon = {
  id: string;
  code: string;
  description?: string | null;
  discountType: string;
  discountValue: number;
  minOrderAmount?: number | null;
  maxRedemptions?: number | null;
  redemptionCount: number;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive: boolean;
  updatedAt: string;
};

export type OfflineCategory = {
  id: string;
  name: string;
  parentId?: string | null;
  updatedAt: string;
};

export type OfflineStaff = {
  id: string;
  fullName: string;
  email: string;
  pinHash: string;
  primaryLocationId?: string | null;
  roles: string[];
  updatedAt: string;
  /** Local failed PIN attempts (lockout) */
  failedPinAttempts: number;
  lockedUntil?: string | null;
};

export type OfflineSale = {
  /** Client-generated UUID — immutable once finalized */
  id: string;
  locationId: string;
  registerSessionId?: string | null;
  deviceId: string;
  status: "finalized" | "void";
  createdAt: string;
  pricingAsOf: string;
  customerId?: string | null;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  paymentMethod: string;
  paymentPending: boolean;
  localReceiptNo: string;
  linesJson: string;
  payloadJson: string;
  syncedAt?: string | null;
};

export type OfflineOutboxItem = {
  id: string;
  clientEventId: string;
  eventType: string;
  locationId: string;
  payloadJson: string;
  createdAt: string;
  attempts: number;
  lastError?: string | null;
  status: "pending" | "syncing" | "failed" | "done";
  dependsOn?: string | null;
};

export type OfflineMeta = {
  key: string;
  value: string;
};

export type OfflineInventoryPending = {
  id: string;
  kind: "adjust" | "receive" | "transfer_request";
  locationId: string;
  createdAt: string;
  summary: string;
  payloadJson: string;
  outboxId: string;
  synced: boolean;
};

class OfflineDatabase extends Dexie {
  products!: EntityTable<OfflineProduct, "id">;
  stockLevels!: EntityTable<OfflineStockLevel, "id">;
  customers!: EntityTable<OfflineCustomer, "id">;
  coupons!: EntityTable<OfflineCoupon, "id">;
  categories!: EntityTable<OfflineCategory, "id">;
  staff!: EntityTable<OfflineStaff, "id">;
  sales!: EntityTable<OfflineSale, "id">;
  outbox!: EntityTable<OfflineOutboxItem, "id">;
  inventoryPending!: EntityTable<OfflineInventoryPending, "id">;
  meta!: EntityTable<OfflineMeta, "key">;

  constructor(tenantId: string) {
    super(`upos-offline-${tenantId}`);
    this.version(OFFLINE_DB_VERSION).stores({
      products: "id, skuCode, barcode, name, updatedAt, categoryId",
      stockLevels: "id, productId, locationId, [locationId+productId], updatedAt",
      customers: "id, phone, name, updatedAt",
      coupons: "id, code, updatedAt",
      categories: "id, parentId, name",
      staff: "id, email",
      sales: "id, locationId, createdAt, syncedAt",
      outbox: "id, clientEventId, status, createdAt, locationId",
      inventoryPending: "id, locationId, synced, createdAt",
      meta: "key",
    });
  }
}

const dbCache = new Map<string, OfflineDatabase>();

export function getOfflineDb(tenantId: string) {
  if (!tenantId) throw new Error("tenantId required for offline DB");
  let db = dbCache.get(tenantId);
  if (!db) {
    db = new OfflineDatabase(tenantId);
    dbCache.set(tenantId, db);
  }
  return db;
}

export async function verifyOfflineDbIntegrity(tenantId: string) {
  const db = getOfflineDb(tenantId);
  try {
    await db.open();
    // Touch each table
    await Promise.all([
      db.products.count(),
      db.stockLevels.count(),
      db.customers.count(),
      db.outbox.count(),
      db.meta.count(),
    ]);
    await db.meta.put({ key: "schemaVersion", value: String(OFFLINE_DB_VERSION) });
    return { ok: true as const };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "integrity_failed",
    };
  }
}

export async function wipeAndRecreateOfflineDb(tenantId: string) {
  const existing = dbCache.get(tenantId);
  if (existing) {
    existing.close();
    dbCache.delete(tenantId);
  }
  await Dexie.delete(`upos-offline-${tenantId}`);
  return getOfflineDb(tenantId);
}

export async function getMeta(tenantId: string, key: string) {
  const row = await getOfflineDb(tenantId).meta.get(key);
  return row?.value ?? null;
}

export async function setMeta(tenantId: string, key: string, value: string) {
  await getOfflineDb(tenantId).meta.put({ key, value });
}
