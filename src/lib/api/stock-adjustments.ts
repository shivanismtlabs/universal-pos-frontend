import { apiRequest, ApiError } from "./client";
import { useAuthStore } from "../auth-store";
import type { StockAdjustment, StockAdjustmentWritePayload } from "./index";

function token() {
  return useAuthStore.getState().accessToken;
}

function isAdjustmentsApiUnavailable(e: unknown) {
  if (!(e instanceof ApiError)) return false;
  if (e.status === 404 || e.status === 405 || e.status === 503) return true;
  if (e.status === 400) return true;
  if (e.status === 500) {
    const msg = e.messages.join(" ").toLowerCase();
    return /does not exist|p2021|p2022|schema/.test(msg);
  }
  return false;
}

export type StockAdjustmentListResult = {
  items: StockAdjustment[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type ListParams = {
  locationId?: string;
  status?: "draft" | "pending" | "adjusted" | "cancelled";
  type?: "quantity" | "value";
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
};

function emptyList(params?: ListParams): StockAdjustmentListResult {
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  return { items: [], total: 0, page, limit, totalPages: 1 };
}

function mapLedgerToAdjustments(
  rows: Array<{
    id: string;
    qtyBefore: number;
    qtyDelta: number;
    qtyAfter: number;
    reason?: string | null;
    createdAt: string;
    sku?: string | null;
    sellUnit?: string | null;
    product?: { id?: string; name?: string; skuCode?: string } | null;
    location?: { id?: string; name?: string } | null;
    actor?: { fullName?: string } | null;
  }>,
  locationId?: string,
): StockAdjustment[] {
  return rows.map((row) => ({
    id: row.id,
    adjustmentNo: row.sku
      ? `ADJ-${row.sku}`
      : row.product?.skuCode
        ? `ADJ-${row.product.skuCode}`
        : `ADJ-${row.id.slice(0, 8)}`,
    locationId: row.location?.id || locationId || "",
    location: row.location ? { id: row.location.id, name: row.location.name } : null,
    adjustmentDate: row.createdAt,
    type: "quantity" as const,
    reason: row.reason || "Stock adjustment",
    status: "adjusted" as const,
    createdAt: row.createdAt,
    createdBy: { fullName: row.actor?.fullName },
    lines: [
      {
        productId: row.product?.id || row.id,
        name: row.product?.name,
        sku: row.sku || row.product?.skuCode,
        currentQty: row.qtyBefore,
        adjustmentQty: row.qtyDelta,
        newQty: row.qtyAfter,
        unit: row.sellUnit || "pcs",
      },
    ],
  }));
}

async function listFromLedger(params?: ListParams): Promise<StockAdjustmentListResult> {
  if (params?.status && params.status !== "adjusted") return emptyList(params);
  if (params?.type && params.type !== "quantity") return emptyList(params);

  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const qs = new URLSearchParams();
  qs.set("type", "adjustment");
  qs.set("page", String(page));
  qs.set("limit", String(limit));
  if (params?.locationId) qs.set("locationId", params.locationId);
  if (params?.search) qs.set("q", params.search);

  const ledger = await apiRequest<{
    items: Array<{
      id: string;
      qtyBefore: number;
      qtyDelta: number;
      qtyAfter: number;
      reason?: string | null;
      createdAt: string;
      sku?: string | null;
      sellUnit?: string | null;
      product?: { id?: string; name?: string; skuCode?: string };
      location?: { id?: string; name?: string };
      actor?: { fullName?: string } | null;
    }>;
    meta?: { page: number; limit: number; total: number; totalPages: number };
  }>(`/inventory/ledger?${qs.toString()}`, { token: token() });

  const items = mapLedgerToAdjustments(ledger.items ?? [], params?.locationId);
  const total = ledger.meta?.total ?? items.length;
  const lim = ledger.meta?.limit ?? limit;
  return {
    items,
    total,
    page: ledger.meta?.page ?? page,
    limit: lim,
    totalPages: ledger.meta?.totalPages ?? Math.max(1, Math.ceil(total / lim) || 1),
  };
}

async function listFromPosSale(params?: ListParams): Promise<StockAdjustmentListResult> {
  const qs = params?.limit ? `?limit=${params.limit}` : "";
  const legacy = await apiRequest<{
    items: Array<{
      id: string;
      createdAt: string;
      productName: string;
      sku: string;
      delta: number;
      beforeQty: number;
      afterQty: number;
      reason?: string | null;
      actorName: string;
      sellUnit?: string;
    }>;
  }>(`/pos/sale/stock-adjustments${qs}`, { token: token() });

  const mapped: StockAdjustment[] = (legacy.items ?? []).map((row, i) => ({
    id: row.id || `legacy-${i}`,
    adjustmentNo: row.sku ? `ADJ-${row.sku}` : undefined,
    locationId: params?.locationId || "",
    adjustmentDate: row.createdAt,
    type: "quantity" as const,
    reason: row.reason || "Stock adjustment",
    status: "adjusted" as const,
    createdAt: row.createdAt,
    createdBy: { fullName: row.actorName },
    lines: [
      {
        productId: row.id,
        name: row.productName,
        sku: row.sku,
        currentQty: row.beforeQty,
        adjustmentQty: row.delta,
        newQty: row.afterQty,
        unit: row.sellUnit || "pcs",
      },
    ],
  }));
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  return {
    items: mapped,
    total: mapped.length,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(mapped.length / limit) || 1),
  };
}

/**
 * List stock adjustments. Falls back to inventory ledger (and POS qty audit)
 * when the formal /inventory/adjustments API is missing or rejects query params.
 */
export async function listStockAdjustments(
  params?: ListParams,
): Promise<StockAdjustmentListResult> {
  const qs = new URLSearchParams();
  if (params?.locationId) qs.set("locationId", params.locationId);
  if (params?.status) qs.set("status", params.status);
  if (params?.type) qs.set("type", params.type);
  if (params?.search) qs.set("search", params.search);
  if (params?.startDate) qs.set("startDate", params.startDate);
  if (params?.endDate) qs.set("endDate", params.endDate);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  const q = qs.toString();

  try {
    return await apiRequest<StockAdjustmentListResult>(
      `/inventory/adjustments${q ? `?${q}` : ""}`,
      { token: token() },
    );
  } catch (e) {
    if (e instanceof ApiError && e.status === 400 && q) {
      try {
        return await apiRequest<StockAdjustmentListResult>(
          "/inventory/adjustments",
          { token: token() },
        );
      } catch {
        /* fall through to ledger */
      }
    } else if (!isAdjustmentsApiUnavailable(e)) {
      throw e;
    }
  }

  try {
    return await listFromLedger(params);
  } catch {
    try {
      return await listFromPosSale(params);
    } catch {
      return emptyList(params);
    }
  }
}

export async function createStockAdjustment(payload: StockAdjustmentWritePayload) {
  try {
    return await apiRequest<StockAdjustment>("/inventory/adjustments", {
      method: "POST",
      body: payload,
      token: token(),
    });
  } catch (e) {
    if (!(e instanceof ApiError) || (e.status !== 404 && e.status !== 405 && e.status !== 503)) {
      if (
        e instanceof ApiError &&
        e.status === 500 &&
        /does not exist|p2021|schema/.test(e.messages.join(" ").toLowerCase())
      ) {
        /* fall through */
      } else {
        throw e;
      }
    }
    if (payload.status === "draft" || payload.status === "pending") {
      throw new ApiError(
        404,
        "Draft adjustments need a newer API. Use Confirm & Apply Stock Change to update stock now.",
      );
    }
    if (!payload.lines?.length) {
      throw new ApiError(400, "At least one adjustment line is required");
    }
    for (const line of payload.lines) {
      const delta = Number(line.adjustmentQty);
      if (!Number.isFinite(delta) || delta === 0) continue;
      await apiRequest("/inventory/adjust", {
        method: "POST",
        body: {
          locationId: payload.locationId,
          productId: line.productId,
          ...(line.stockLevelId ? { stockLevelId: line.stockLevelId } : {}),
          delta,
          reason: [payload.reason, line.notes].filter(Boolean).join(" — "),
        },
        token: token(),
      });
    }
    const stamp = Date.now().toString(36).toUpperCase();
    return {
      id: `legacy-adj-${stamp}`,
      adjustmentNo: `ADJ-${stamp}`,
      locationId: payload.locationId,
      adjustmentDate: payload.adjustmentDate,
      type: payload.type,
      reason: payload.reason,
      description: payload.description,
      status: "adjusted" as const,
      lines: payload.lines,
      finalizedAt: new Date().toISOString(),
    } satisfies StockAdjustment;
  }
}
