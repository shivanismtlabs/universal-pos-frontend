"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { posApi, tenantsApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { canWriteCatalog } from "@/lib/roles";
import { useAuthStore } from "@/lib/auth-store";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  EmptyState,
  PageSkeleton,
} from "@/components/page-header";
import {
  StockAdjustDialog,
  type StockAdjustTarget,
} from "@/components/stock-adjust-dialog";
import {
  formatQtyWithUnit,
  normalizeSellUnit,
  qtyStep,
} from "@/lib/sell-units";

/**
 * Phase-1 inventory floor — stock levels, low-stock filter, qty adjust + audit.
 */
export default function InventoryPage() {
  const { money, hasMode } = useBootstrap();
  const roles = useAuthStore((s) => s.user?.roles);
  const canWrite = canWriteCatalog(roles);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [locationId, setLocationId] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<StockAdjustTarget | null>(
    null,
  );

  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });

  const activeLoc =
    locationId ||
    locations.data?.find((l) => l.isActive !== false)?.id ||
    locations.data?.[0]?.id ||
    "";

  const catalog = useQuery({
    queryKey: ["inventory-stock", activeLoc, q, lowOnly],
    queryFn: () =>
      posApi.saleCatalog({
        locationId: activeLoc || undefined,
        q: q.trim() || undefined,
        limit: 200,
        lowStock: lowOnly || undefined,
        maxQty: lowOnly ? 5 : undefined,
      }),
    enabled: hasMode("sale") && Boolean(activeLoc || locations.isFetched),
  });

  const adjust = useMutation({
    mutationFn: (body: { id: string; delta: number; reason?: string }) =>
      posApi.adjustSaleStock(body.id, {
        delta: body.delta,
        reason: body.reason,
      }),
    onSuccess: (res) => {
      toast.success(
        `Stock updated · ${formatQtyWithUnit(Number(res.qty), res.sellUnit)}`,
      );
      setAdjustTarget(null);
      void qc.invalidateQueries({ queryKey: ["inventory-stock"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-low-stock"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Adjust failed",
      ),
  });

  const items = catalog.data?.items ?? [];
  const lowCount = useMemo(
    () => items.filter((i) => i.lowStock || Number(i.qtyOnHand) <= 5).length,
    [items],
  );

  if (!hasMode("sale")) {
    return (
      <EmptyState
        title="Inventory is for product sales"
        detail="Enable the Sell products commerce mode to track quantity stock. Rental inventory lives on the Products / rental floor."
        action={
          <Button asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        }
      />
    );
  }

  if (locations.isLoading || (catalog.isLoading && !items.length)) {
    return <PageSkeleton rows={8} />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.65rem] font-bold tracking-[0.12em] text-[#1a56db] uppercase">
            Inventory · Stock levels
          </p>
          <h1 className="page-title mt-0.5">Stock on hand</h1>
          <p className="page-subtitle mt-1">
            Location stock overview — adjust quantity and watch low stock (items
            still managed under Items).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="secondary">
            <Link href="/adjustments">Adjustments</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/catalog">Open Items</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#d9e0ea] bg-white px-4 py-3">
        <div className="min-w-[12rem] flex-1">
          <Label htmlFor="inv-q">Search</Label>
          <Input
            id="inv-q"
            className="mt-1"
            placeholder="Name or SKU"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="min-w-[10rem]">
          <Label htmlFor="inv-loc">Location</Label>
          <Select
            id="inv-loc"
            className="mt-1"
            value={locationId || activeLoc}
            onChange={(e) => setLocationId(e.target.value)}
          >
            {(locations.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-end pb-0.5">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[#0b1f33]">
            <input
              type="checkbox"
              checked={lowOnly}
              onChange={(e) => setLowOnly(e.target.checked)}
              className="h-4 w-4 rounded border-[#c5d0e0]"
            />
            Low stock only
            {lowCount > 0 ? (
              <span className="rounded-full bg-[#fef2f2] px-2 py-0.5 text-[0.7rem] font-semibold text-[#991b1b]">
                {lowCount}
              </span>
            ) : null}
          </label>
        </div>
      </div>

      {!items.length ? (
        <EmptyState
          title={lowOnly ? "No low-stock products" : "No stock rows yet"}
          detail="Add sale items from catalog, then adjust on-hand quantities here."
          action={
            <Button asChild>
              <Link href="/catalog">+ New item</Link>
            </Button>
          }
        />
      ) : (
        <section className="overflow-x-auto rounded-xl border border-[#d9e0ea] bg-white shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-[#e8eef5] bg-[#f8fafc] text-[0.7rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">Stock on Hand</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f3f7]">
              {items.map((row) => {
                const qty = Number(row.qtyOnHand);
                const unit = normalizeSellUnit(row.sellUnit);
                const low = Boolean(row.lowStock) || qty <= 5;
                return (
                  <tr key={row.id} className="hover:bg-[#f7f9fc]">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#0b1f33]">{row.name}</p>
                      {row.category?.name ? (
                        <p className="text-[0.75rem] text-[#8b9aab]">
                          {row.category.name}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-[0.8rem] text-[#5a6b7d]">
                      {row.sku}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#5a6b7d]">
                      {money(row.sellPrice)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-[#0b1f33]">
                      <span
                        className={
                          low
                            ? "rounded-md bg-[#fff7ed] px-2 py-0.5 text-[#9a3412]"
                            : ""
                        }
                      >
                        {formatQtyWithUnit(qty, unit)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {low ? (
                        <span className="inline-block rounded-full bg-[#fef2f2] px-2 py-0.5 text-[0.65rem] font-semibold text-[#991b1b] uppercase">
                          Low stock
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[0.65rem] font-semibold text-[#047857] uppercase">
                          OK
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {canWrite ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="soft"
                            disabled={adjust.isPending}
                            onClick={() =>
                              setAdjustTarget({
                                id: row.id,
                                name: row.name,
                                sku: row.sku,
                                qty,
                                sellUnit: unit,
                              })
                            }
                          >
                            Adjust stock
                          </Button>
                        ) : (
                          <span className="text-[0.75rem] text-[#8b9aab]">
                            View only
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <StockAdjustDialog
        target={adjustTarget}
        busy={adjust.isPending}
        onClose={() => setAdjustTarget(null)}
        onSubmit={(args) => adjust.mutate(args)}
      />
    </div>
  );
}
