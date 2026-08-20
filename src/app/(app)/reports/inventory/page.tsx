"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  catalogApi,
  reportsApi,
  suppliersApi,
  tenantsApi,
  type InventoryReportParams,
  type InventoryStockStatus,
} from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { cn, todayYmd } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { TablePager } from "@/components/table-pager";
import { usePagedList } from "@/lib/use-paged-list";

type Tab =
  | "current"
  | "movement"
  | "valuation"
  | "adjustments"
  | "reorder"
  | "expiry";

const TABS: { id: Tab; label: string }[] = [
  { id: "current", label: "Current stock" },
  { id: "movement", label: "Stock movement" },
  { id: "valuation", label: "Valuation" },
  { id: "adjustments", label: "Adjustments" },
  { id: "reorder", label: "Reorder" },
  { id: "expiry", label: "Expiry" },
];

function StatusBadge({ status }: { status: InventoryStockStatus }) {
  const tone =
    status === "out_of_stock"
      ? "bg-rose-100 text-rose-800 border-rose-200"
      : status === "low_stock"
        ? "bg-amber-100 text-amber-900 border-amber-200"
        : "bg-emerald-100 text-emerald-800 border-emerald-200";
  const label =
    status === "out_of_stock"
      ? "Out of stock"
      : status === "low_stock"
        ? "Low stock"
        : "In stock";
  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-2 py-0.5 text-[0.68rem] font-semibold",
        tone,
      )}
    >
      {label}
    </span>
  );
}

function UrgencyBadge({
  urgency,
}: {
  urgency: "expired" | "critical" | "warning";
}) {
  const tone =
    urgency === "expired"
      ? "bg-rose-100 text-rose-800 border-rose-200"
      : urgency === "critical"
        ? "bg-orange-100 text-orange-900 border-orange-200"
        : "bg-amber-100 text-amber-900 border-amber-200";
  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-2 py-0.5 text-[0.68rem] font-semibold capitalize",
        tone,
      )}
    >
      {urgency}
    </span>
  );
}

function monthStartYmd() {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-01"
  );
}

export default function InventoryReportsPage() {
  const { money, hasCapability, hasMode } = useBootstrap();
  const qc = useQueryClient();
  const hasPhysicalGoods = hasMode("sale");

  const [tab, setTab] = useState<Tab>("current");
  const [locationId, setLocationId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState(monthStartYmd);
  const [to, setTo] = useState(todayYmd);
  const [costingMethod, setCostingMethod] = useState<
    "" | "standard" | "weighted_average" | "fifo" | "lifo"
  >("");
  const [expiryWindowDays, setExpiryWindowDays] = useState<30 | 60 | 90>(30);
  const [inventoryClass, setInventoryClass] = useState<
    "all" | "ingredient" | "finished"
  >("all");
  const [consolidated, setConsolidated] = useState(false);
  const [selectedReorder, setSelectedReorder] = useState<Record<string, boolean>>(
    {},
  );
  const [poSupplierId, setPoSupplierId] = useState("");

  const [applied, setApplied] = useState({
    locationId: "",
    categoryId: "",
    supplierId: "",
    q: "",
    from: monthStartYmd(),
    to: todayYmd(),
    costingMethod: "" as typeof costingMethod,
    expiryWindowDays: 30 as 30 | 60 | 90,
    inventoryClass: "all" as typeof inventoryClass,
    consolidated: false,
  });

  const showRestaurantSplit =
    hasCapability("KOT") ||
    hasCapability("KITCHEN") ||
    hasCapability("MODIFIERS");

  const params: InventoryReportParams = useMemo(
    () => ({
      locationId: applied.locationId || undefined,
      categoryId: applied.categoryId || undefined,
      supplierId: applied.supplierId || undefined,
      q: applied.q || undefined,
      from: applied.from,
      to: applied.to,
      costingMethod: applied.costingMethod || undefined,
      expiryWindowDays: applied.expiryWindowDays,
      inventoryClass: applied.inventoryClass,
      consolidated: applied.consolidated,
    }),
    [applied],
  );

  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });
  const categories = useQuery({
    queryKey: ["catalog-categories"],
    queryFn: () => catalogApi.listCategories(),
  });
  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => suppliersApi.list(),
  });

  const current = useQuery({
    queryKey: ["reports", "inv-current", params],
    queryFn: () => reportsApi.inventoryCurrentStock(params),
    enabled: hasPhysicalGoods && tab === "current",
  });
  const movement = useQuery({
    queryKey: ["reports", "inv-movement", params],
    queryFn: () => reportsApi.inventoryStockMovement(params),
    enabled: hasPhysicalGoods && tab === "movement",
  });
  const valuation = useQuery({
    queryKey: ["reports", "inv-valuation", params],
    queryFn: () => reportsApi.inventoryValuation(params),
    enabled: hasPhysicalGoods && tab === "valuation",
  });
  const adjustments = useQuery({
    queryKey: ["reports", "inv-adjustments", params],
    queryFn: () => reportsApi.inventoryAdjustments(params),
    enabled: hasPhysicalGoods && tab === "adjustments",
  });
  const reorder = useQuery({
    queryKey: ["reports", "inv-reorder", params],
    queryFn: () => reportsApi.inventoryReorderSuggestions(params),
    enabled: hasPhysicalGoods && tab === "reorder",
  });
  const expiry = useQuery({
    queryKey: ["reports", "inv-expiry", params],
    queryFn: () => reportsApi.inventoryExpiry(params),
    enabled: hasPhysicalGoods && tab === "expiry",
  });

  const activeQuery =
    tab === "current"
      ? current
      : tab === "movement"
        ? movement
        : tab === "valuation"
          ? valuation
          : tab === "adjustments"
            ? adjustments
            : tab === "reorder"
              ? reorder
              : expiry;

  const currentPaged = usePagedList(current.data?.items, 25);
  const movementPaged = usePagedList(movement.data?.items, 25);
  const valuationPaged = usePagedList(valuation.data?.items, 25);
  const adjustmentsPaged = usePagedList(adjustments.data?.items, 25);
  const reorderPaged = usePagedList(reorder.data?.items, 25);
  const expiryPaged = usePagedList(expiry.data?.items, 25);

  useEffect(() => {
    currentPaged.setPage(1);
    movementPaged.setPage(1);
    valuationPaged.setPage(1);
    adjustmentsPaged.setPage(1);
    reorderPaged.setPage(1);
    expiryPaged.setPage(1);
    // Reset when filters or tab change — ignore setPage identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, params]);

  const createPo = useMutation({
    mutationFn: async () => {
      const items = (reorder.data?.items ?? []).filter(
        (i) => selectedReorder[i.stockLevelId],
      );
      if (!items.length) throw new Error("Select at least one item");
      const supplier =
        poSupplierId ||
        items.find((i) => i.supplierId)?.supplierId ||
        "";
      if (!supplier) throw new Error("Pick a supplier for the purchase order");
      return suppliersApi.createPo({
        supplierId: supplier,
        poType: "purchase",
        notes: "Created from Inventory Reorder report",
        lines: items.map((i) => ({
          stockLevelId: i.stockLevelId,
          qtyOrdered: Math.max(1, Math.round(i.suggestedQty)),
          ...(i.unitCost != null ? { unitCost: i.unitCost } : {}),
        })),
      });
    },
    onSuccess: () => {
      toast.success("Purchase order created (draft)");
      setSelectedReorder({});
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError
          ? e.messages.join(", ")
          : e instanceof Error
            ? e.message
            : "Failed to create PO",
      ),
  });

  function applyFilters() {
    setApplied({
      locationId,
      categoryId,
      supplierId,
      q: q.trim(),
      from,
      to,
      costingMethod,
      expiryWindowDays,
      inventoryClass,
      consolidated,
    });
  }

  function exportCsv() {
    const stamp = todayYmd();
    if (tab === "current" && current.data) {
      downloadCsv(
        `inventory-current-stock-${stamp}.csv`,
        [
          "Item",
          "SKU",
          "Category",
          "Branch",
          "Qty",
          "Unit cost",
          "Value",
          "Reorder",
          "Status",
        ],
        current.data.items.map((r) => [
          r.item,
          r.sku,
          r.category,
          r.locationName,
          r.qtyOnHand,
          r.unitCost,
          r.stockValue,
          r.reorderPoint,
          r.status,
        ]),
      );
      return;
    }
    if (tab === "movement" && movement.data) {
      downloadCsv(
        `inventory-stock-movement-${stamp}.csv`,
        [
          "When",
          "Type",
          "Direction",
          "Qty",
          "Balance",
          "Item",
          "SKU",
          "Branch",
          "Reason",
          "Actor",
        ],
        movement.data.items.map((r) => [
          r.at,
          r.type,
          r.direction,
          r.quantity,
          r.runningBalance,
          r.item,
          r.sku,
          r.locationName,
          r.reason,
          r.actorName,
        ]),
      );
      return;
    }
    if (tab === "valuation" && valuation.data) {
      downloadCsv(
        `inventory-valuation-${stamp}.csv`,
        ["Item", "SKU", "Category", "Branch", "Qty", "Unit cost", "Value"],
        valuation.data.items.map((r) => [
          r.item,
          r.sku,
          r.category,
          r.locationName,
          r.qtyOnHand,
          r.unitCost,
          r.value,
        ]),
      );
      return;
    }
    if (tab === "adjustments" && adjustments.data) {
      downloadCsv(
        `inventory-adjustments-${stamp}.csv`,
        [
          "When",
          "Type",
          "Reason code",
          "Qty",
          "Damage",
          "Item",
          "Branch",
          "Approved by",
          "Reason",
        ],
        adjustments.data.items.map((r) => [
          r.at,
          r.type,
          r.reasonCode,
          r.quantity,
          r.damageDelta,
          r.item,
          r.locationName,
          r.approvedBy,
          r.reason,
        ]),
      );
      return;
    }
    if (tab === "reorder" && reorder.data) {
      downloadCsv(
        `inventory-reorder-${stamp}.csv`,
        [
          "Item",
          "SKU",
          "Branch",
          "On hand",
          "Reorder point",
          "Suggested qty",
          "Avg daily sales",
          "Lead days",
          "Supplier",
          "Status",
        ],
        reorder.data.items.map((r) => [
          r.item,
          r.sku,
          r.locationName,
          r.qtyOnHand,
          r.reorderPoint,
          r.suggestedQty,
          r.avgDailySales,
          r.leadTimeDays,
          r.supplierName,
          r.status,
        ]),
      );
      return;
    }
    if (tab === "expiry" && expiry.data) {
      downloadCsv(
        `inventory-expiry-${stamp}.csv`,
        [
          "Item",
          "SKU",
          "Batch",
          "Branch",
          "Expires",
          "Days left",
          "Urgency",
          "Qty",
          "Value",
        ],
        expiry.data.items.map((r) => [
          r.item,
          r.sku,
          r.batchCode,
          r.locationName,
          r.expiresAt,
          r.daysLeft,
          r.urgency,
          r.qtyOnHand,
          r.stockValue,
        ]),
      );
      return;
    }
    toast.error("Nothing to export yet");
  }

  if (!hasPhysicalGoods) {
    return (
      <div className="document-print-root mx-auto max-w-3xl space-y-4">
        <PageHeader
          title="Inventory Reports"
          subtitle="Stock levels, movement, and valuation for physical goods."
        />
        <div className="rounded-2xl border border-[#d9e0ea] bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-[#0b1f33]">
            No physical inventory for this shop
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#5a6b7d]">
            Inventory reports stay hidden for service-only setups. Enable{" "}
            <strong>Sale</strong> commerce mode (or add trackable stock items)
            to use this suite.
          </p>
          <Button asChild className="mt-4" variant="secondary">
            <Link href="/reports">Back to reports</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="document-print-root mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Inventory Reports"
        subtitle="Stock levels, movement, valuation, adjustments, reorder, and expiry — any business with physical goods."
        action={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button asChild variant="secondary" size="sm">
              <Link href="/reports">All reports</Link>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={exportCsv}
              disabled={activeQuery.isLoading || !activeQuery.data}
            >
              CSV / Excel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => window.print()}
              disabled={activeQuery.isLoading || !activeQuery.data}
            >
              PDF / Print
            </Button>
          </div>
        }
      />

      <div className="seg-control print:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            data-active={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-[#d9e0ea] bg-white p-4 print:border-0 print:p-0">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 print:hidden">
          <div className="field-shell">
            <Label>Branch</Label>
            <Select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              <option value="">All branches</option>
              {(locations.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="field-shell">
            <Label>Category</Label>
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">All categories</option>
              {(categories.data ?? []).map((c: { id: string; name: string }) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="field-shell">
            <Label>Supplier</Label>
            <Select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">All suppliers</option>
              {(suppliers.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="field-shell">
            <Label>Item search</Label>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name or SKU"
            />
          </div>
          {(tab === "movement" || tab === "adjustments") && (
            <>
              <div className="field-shell">
                <Label>From</Label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="field-shell">
                <Label>To</Label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </>
          )}
          {(tab === "current" || tab === "valuation") && (
            <div className="field-shell">
              <Label>Costing</Label>
              <Select
                value={costingMethod}
                onChange={(e) =>
                  setCostingMethod(
                    e.target.value as typeof costingMethod,
                  )
                }
              >
                <option value="">Shop default</option>
                <option value="standard">Standard cost</option>
                <option value="weighted_average">Weighted average</option>
                <option value="fifo">FIFO</option>
                <option value="lifo">LIFO</option>
              </Select>
            </div>
          )}
          {tab === "expiry" ? (
            <div className="field-shell">
              <Label>Expiry window</Label>
              <Select
                value={String(expiryWindowDays)}
                onChange={(e) =>
                  setExpiryWindowDays(Number(e.target.value) as 30 | 60 | 90)
                }
              >
                <option value="30">30 days</option>
                <option value="60">60 days</option>
                <option value="90">90 days</option>
              </Select>
            </div>
          ) : null}
          {showRestaurantSplit ? (
            <div className="field-shell">
              <Label>Inventory class</Label>
              <Select
                value={inventoryClass}
                onChange={(e) =>
                  setInventoryClass(e.target.value as typeof inventoryClass)
                }
              >
                <option value="all">All</option>
                <option value="ingredient">Raw ingredients</option>
                <option value="finished">Finished / menu</option>
              </Select>
            </div>
          ) : null}
          {tab === "current" ? (
            <label className="flex items-end gap-2 pb-2 text-sm text-[#5a6b7d]">
              <input
                type="checkbox"
                checked={consolidated}
                onChange={(e) => setConsolidated(e.target.checked)}
              />
              Consolidated
            </label>
          ) : null}
          <div className="flex items-end">
            <Button type="button" className="w-full" onClick={applyFilters}>
              Apply
            </Button>
          </div>
        </div>

        {activeQuery.isError ? (
          <p className="mt-4 text-sm text-rose-600">
            {activeQuery.error instanceof ApiError
              ? activeQuery.error.messages.join(", ")
              : "Failed to load report"}
          </p>
        ) : null}

        {tab === "current" && current.data ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["SKUs", String(current.data.summary.skuCount)],
                ["Total qty", String(current.data.summary.totalQty)],
                ["Stock value", money(current.data.summary.totalValue)],
                [
                  "Health",
                  `${current.data.summary.inStock} ok · ${current.data.summary.lowStock} low · ${current.data.summary.outOfStock} out`,
                ],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="rounded-xl border border-[#e8edf4] bg-[#f8fafc] px-3 py-2"
                >
                  <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                    {k}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#0b1f33]">
                    {v}
                  </p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-[#d9e0ea] text-[0.7rem] tracking-wide text-[#8b9bb0] uppercase">
                  <tr>
                    <th className="px-2 py-2 font-semibold">Item</th>
                    <th className="px-2 py-2 font-semibold">Category</th>
                    <th className="px-2 py-2 font-semibold">Branch</th>
                    <th className="px-2 py-2 font-semibold text-right">Qty</th>
                    <th className="px-2 py-2 font-semibold text-right">
                      Unit cost
                    </th>
                    <th className="px-2 py-2 font-semibold text-right">Value</th>
                    <th className="px-2 py-2 font-semibold text-right">
                      Reorder
                    </th>
                    <th className="px-2 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef2f8]">
                  {currentPaged.slice.map((r) => (
                    <tr key={`${r.stockLevelId}-${r.locationId}`}>
                      <td className="px-2 py-2">
                        <p className="font-medium text-[#0b1f33]">{r.item}</p>
                        <p className="text-xs text-[#8b9bb0]">{r.sku}</p>
                      </td>
                      <td className="px-2 py-2 text-[#5a6b7d]">
                        {r.category ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-[#5a6b7d]">
                        {r.locationName}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {r.qtyOnHand}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {money(r.unitCost)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {money(r.stockValue)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {r.reorderPoint ?? "—"}
                      </td>
                      <td className="px-2 py-2">
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!current.data.items.length ? (
                <p className="py-8 text-center text-sm text-[#8b9bb0]">
                  No stock rows for these filters
                </p>
              ) : (
                <TablePager {...currentPaged.pagerProps} />
              )}
            </div>
          </div>
        ) : null}

        {tab === "movement" && movement.data ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ["Events", movement.data.summary.eventCount],
                ["Stock in", movement.data.summary.stockIn],
                ["Stock out", movement.data.summary.stockOut],
                ["Adjustments", movement.data.summary.adjustments],
              ].map(([k, v]) => (
                <div
                  key={String(k)}
                  className="rounded-xl border border-[#e8edf4] bg-[#f8fafc] px-3 py-2"
                >
                  <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                    {k}
                  </p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">
                    {v}
                  </p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="border-b border-[#d9e0ea] text-[0.7rem] tracking-wide text-[#8b9bb0] uppercase">
                  <tr>
                    <th className="px-2 py-2 font-semibold">When</th>
                    <th className="px-2 py-2 font-semibold">Type</th>
                    <th className="px-2 py-2 font-semibold">Item</th>
                    <th className="px-2 py-2 font-semibold">Branch</th>
                    <th className="px-2 py-2 font-semibold text-right">Qty</th>
                    <th className="px-2 py-2 font-semibold text-right">
                      Balance
                    </th>
                    <th className="px-2 py-2 font-semibold">Actor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef2f8]">
                  {movementPaged.slice.map((r) => (
                    <tr key={r.id}>
                      <td className="px-2 py-2 text-xs text-[#5a6b7d]">
                        {new Date(r.at).toLocaleString()}
                      </td>
                      <td className="px-2 py-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-[#5a6b7d]">
                          {r.type}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <p className="font-medium">{r.item}</p>
                        <p className="text-xs text-[#8b9bb0]">{r.sku}</p>
                      </td>
                      <td className="px-2 py-2 text-[#5a6b7d]">
                        {r.locationName}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2 text-right tabular-nums font-medium",
                          r.quantity < 0 ? "text-rose-700" : "text-emerald-700",
                        )}
                      >
                        {r.quantity > 0 ? `+${r.quantity}` : r.quantity}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {r.runningBalance}
                      </td>
                      <td className="px-2 py-2 text-[#5a6b7d]">
                        {r.actorName ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!movement.data.items.length ? (
                <p className="py-8 text-center text-sm text-[#8b9bb0]">
                  No ledger events in this range
                </p>
              ) : (
                <TablePager {...movementPaged.pagerProps} />
              )}
            </div>
          </div>
        ) : null}

        {tab === "valuation" && valuation.data ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-[#e8edf4] bg-[#f8fafc] px-3 py-2">
                <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                  Total value
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {money(valuation.data.summary.totalValue)}
                </p>
                <p className="text-xs text-[#8b9bb0]">
                  {valuation.data.costingMethod} · {valuation.data.costingNote}
                </p>
              </div>
              <div className="rounded-xl border border-[#e8edf4] bg-[#f8fafc] px-3 py-2">
                <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                  By category
                </p>
                <ul className="mt-1 max-h-28 space-y-1 overflow-y-auto text-xs">
                  {valuation.data.byCategory.slice(0, 8).map((c) => (
                    <li key={c.key} className="flex justify-between gap-2">
                      <span className="truncate text-[#5a6b7d]">{c.key}</span>
                      <span className="tabular-nums">{money(c.value)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-[#e8edf4] bg-[#f8fafc] px-3 py-2">
                <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                  By branch
                </p>
                <ul className="mt-1 max-h-28 space-y-1 overflow-y-auto text-xs">
                  {valuation.data.byBranch.map((c) => (
                    <li key={c.key} className="flex justify-between gap-2">
                      <span className="truncate text-[#5a6b7d]">{c.key}</span>
                      <span className="tabular-nums">{money(c.value)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-[#d9e0ea] text-[0.7rem] tracking-wide text-[#8b9bb0] uppercase">
                  <tr>
                    <th className="px-2 py-2 font-semibold">Item</th>
                    <th className="px-2 py-2 font-semibold">Category</th>
                    <th className="px-2 py-2 font-semibold">Branch</th>
                    <th className="px-2 py-2 font-semibold text-right">Qty</th>
                    <th className="px-2 py-2 font-semibold text-right">
                      Unit cost
                    </th>
                    <th className="px-2 py-2 font-semibold text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef2f8]">
                  {valuationPaged.slice.map((r, i) => (
                    <tr key={`${r.sku}-${r.locationName}-${i}`}>
                      <td className="px-2 py-2">
                        <p className="font-medium">{r.item}</p>
                        <p className="text-xs text-[#8b9bb0]">{r.sku}</p>
                      </td>
                      <td className="px-2 py-2 text-[#5a6b7d]">
                        {r.category ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-[#5a6b7d]">
                        {r.locationName}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {r.qtyOnHand}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {money(r.unitCost)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium">
                        {money(r.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {valuation.data.items.length ? (
                <TablePager {...valuationPaged.pagerProps} />
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "adjustments" && adjustments.data ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-[#e8edf4] bg-[#f8fafc] px-3 py-2">
                <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                  Events
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {adjustments.data.summary.eventCount}
                </p>
              </div>
              <div className="rounded-xl border border-[#e8edf4] bg-[#f8fafc] px-3 py-2">
                <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                  Net qty
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {adjustments.data.summary.netQty}
                </p>
              </div>
              <div className="rounded-xl border border-[#e8edf4] bg-[#f8fafc] px-3 py-2">
                <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                  Damage qty
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {adjustments.data.summary.damageQty}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-[#d9e0ea] text-[0.7rem] tracking-wide text-[#8b9bb0] uppercase">
                  <tr>
                    <th className="px-2 py-2 font-semibold">When</th>
                    <th className="px-2 py-2 font-semibold">Code</th>
                    <th className="px-2 py-2 font-semibold">Item</th>
                    <th className="px-2 py-2 font-semibold text-right">Qty</th>
                    <th className="px-2 py-2 font-semibold">Approved by</th>
                    <th className="px-2 py-2 font-semibold">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef2f8]">
                  {adjustmentsPaged.slice.map((r) => (
                    <tr key={r.id}>
                      <td className="px-2 py-2 text-xs text-[#5a6b7d]">
                        {new Date(r.at).toLocaleString()}
                      </td>
                      <td className="px-2 py-2 text-xs font-semibold uppercase tracking-wide">
                        {r.reasonCode}
                      </td>
                      <td className="px-2 py-2">
                        <p className="font-medium">{r.item}</p>
                        <p className="text-xs text-[#8b9bb0]">
                          {r.locationName}
                        </p>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {r.quantity}
                      </td>
                      <td className="px-2 py-2 text-[#5a6b7d]">
                        {r.approvedBy ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-[#5a6b7d]">
                        {r.reason ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!adjustments.data.items.length ? (
                <p className="py-8 text-center text-sm text-[#8b9bb0]">
                  No adjustments in this range
                </p>
              ) : (
                <TablePager {...adjustmentsPaged.pagerProps} />
              )}
            </div>
          </div>
        ) : null}

        {tab === "reorder" && reorder.data ? (
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["Below threshold", reorder.data.summary.itemCount],
                  ["Out of stock", reorder.data.summary.outOfStock],
                  ["With supplier", reorder.data.summary.withSupplier],
                ].map(([k, v]) => (
                  <div
                    key={String(k)}
                    className="rounded-xl border border-[#e8edf4] bg-[#f8fafc] px-3 py-2"
                  >
                    <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                      {k}
                    </p>
                    <p className="mt-1 text-sm font-semibold">{v}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="field-shell min-w-[180px]">
                  <Label>PO supplier</Label>
                  <Select
                    value={poSupplierId}
                    onChange={(e) => setPoSupplierId(e.target.value)}
                  >
                    <option value="">Use item’s last supplier</option>
                    {(suppliers.data ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  type="button"
                  disabled={
                    createPo.isPending ||
                    !Object.values(selectedReorder).some(Boolean)
                  }
                  onClick={() => createPo.mutate()}
                >
                  Create purchase order
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-[#d9e0ea] text-[0.7rem] tracking-wide text-[#8b9bb0] uppercase">
                  <tr>
                    <th className="px-2 py-2 font-semibold print:hidden">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="px-2 py-2 font-semibold">Item</th>
                    <th className="px-2 py-2 font-semibold">Branch</th>
                    <th className="px-2 py-2 font-semibold text-right">
                      On hand
                    </th>
                    <th className="px-2 py-2 font-semibold text-right">
                      Suggest
                    </th>
                    <th className="px-2 py-2 font-semibold text-right">
                      Velocity
                    </th>
                    <th className="px-2 py-2 font-semibold">Supplier</th>
                    <th className="px-2 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef2f8]">
                  {reorderPaged.slice.map((r) => (
                    <tr key={r.stockLevelId}>
                      <td className="px-2 py-2 print:hidden">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedReorder[r.stockLevelId])}
                          onChange={(e) =>
                            setSelectedReorder((prev) => ({
                              ...prev,
                              [r.stockLevelId]: e.target.checked,
                            }))
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <p className="font-medium">{r.item}</p>
                        <p className="text-xs text-[#8b9bb0]">{r.sku}</p>
                      </td>
                      <td className="px-2 py-2 text-[#5a6b7d]">
                        {r.locationName}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {r.qtyOnHand}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums font-semibold">
                        {r.suggestedQty}
                      </td>
                      <td className="px-2 py-2 text-right text-xs tabular-nums text-[#5a6b7d]">
                        {r.avgDailySales}/day · {r.leadTimeDays}d lead
                      </td>
                      <td className="px-2 py-2 text-[#5a6b7d]">
                        {r.supplierName ?? "—"}
                      </td>
                      <td className="px-2 py-2">
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!reorder.data.items.length ? (
                <p className="py-8 text-center text-sm text-[#8b9bb0]">
                  Nothing below reorder threshold
                </p>
              ) : (
                <TablePager {...reorderPaged.pagerProps} />
              )}
            </div>
          </div>
        ) : null}

        {tab === "expiry" && expiry.data ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ["Batches", expiry.data.summary.batchCount],
                ["Expired", expiry.data.summary.expired],
                ["Critical (≤7d)", expiry.data.summary.critical],
                ["At-risk value", money(expiry.data.summary.atRiskValue)],
              ].map(([k, v]) => (
                <div
                  key={String(k)}
                  className="rounded-xl border border-[#e8edf4] bg-[#f8fafc] px-3 py-2"
                >
                  <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                    {k}
                  </p>
                  <p className="mt-1 text-sm font-semibold">{v}</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-[#d9e0ea] text-[0.7rem] tracking-wide text-[#8b9bb0] uppercase">
                  <tr>
                    <th className="px-2 py-2 font-semibold">Item</th>
                    <th className="px-2 py-2 font-semibold">Batch</th>
                    <th className="px-2 py-2 font-semibold">Branch</th>
                    <th className="px-2 py-2 font-semibold">Expires</th>
                    <th className="px-2 py-2 font-semibold text-right">
                      Days left
                    </th>
                    <th className="px-2 py-2 font-semibold text-right">Qty</th>
                    <th className="px-2 py-2 font-semibold">Urgency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef2f8]">
                  {expiryPaged.slice.map((r) => (
                    <tr key={r.batchId}>
                      <td className="px-2 py-2">
                        <p className="font-medium">{r.item}</p>
                        <p className="text-xs text-[#8b9bb0]">{r.sku}</p>
                      </td>
                      <td className="px-2 py-2 tabular-nums">{r.batchCode}</td>
                      <td className="px-2 py-2 text-[#5a6b7d]">
                        {r.locationName}
                      </td>
                      <td className="px-2 py-2 tabular-nums">{r.expiresAt}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {r.daysLeft}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {r.qtyOnHand}
                      </td>
                      <td className="px-2 py-2">
                        <UrgencyBadge urgency={r.urgency} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!expiry.data.items.length ? (
                <p className="py-8 text-center text-sm text-[#8b9bb0]">
                  No batches expiring in this window (enable batch tracking on
                  items)
                </p>
              ) : (
                <TablePager {...expiryPaged.pagerProps} />
              )}
            </div>
          </div>
        ) : null}

        {activeQuery.isLoading ? (
          <p className="mt-6 text-center text-sm text-[#8b9bb0]">Loading…</p>
        ) : null}
      </section>
    </div>
  );
}
