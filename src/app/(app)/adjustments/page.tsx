"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { posApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { canWriteCatalog } from "@/lib/roles";
import { useAuthStore } from "@/lib/auth-store";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageSkeleton } from "@/components/page-header";
import {
  StockAdjustDialog,
  type StockAdjustTarget,
} from "@/components/stock-adjust-dialog";
import { formatQtyWithUnit, normalizeSellUnit } from "@/lib/sell-units";
import { cn } from "@/lib/utils";
import { TablePager } from "@/components/table-pager";
import { usePagedList } from "@/lib/use-paged-list";

/**
 * Zoho-style Inventory → Adjustments — scrollable history + new qty adjustment.
 */
export default function InventoryAdjustmentsPage() {
  const { hasMode } = useBootstrap();
  const roles = useAuthStore((s) => s.user?.roles);
  const canWrite = canWriteCatalog(roles);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const [pickQ, setPickQ] = useState("");
  const [adjustTarget, setAdjustTarget] = useState<StockAdjustTarget | null>(
    null,
  );

  const history = useQuery({
    queryKey: ["pos-sale-stock-adjustments"],
    queryFn: () => posApi.listSaleStockAdjustments(100),
    enabled: hasMode("sale"),
  });

  const products = useQuery({
    queryKey: ["pos-sale-products-adj-pick", pickQ],
    queryFn: () =>
      posApi.listSaleProducts({
        q: pickQ.trim() || undefined,
      }),
    enabled: pickOpen && hasMode("sale"),
  });

  const adjust = useMutation({
    mutationFn: (body: { id: string; delta: number; reason?: string }) =>
      posApi.adjustSaleStock(body.id, {
        delta: body.delta,
        reason: body.reason,
      }),
    onSuccess: (res) => {
      toast.success(
        `Adjusted · now ${formatQtyWithUnit(Number(res.qty), res.sellUnit)}`,
      );
      setAdjustTarget(null);
      setPickOpen(false);
      void qc.invalidateQueries({ queryKey: ["pos-sale-stock-adjustments"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-products"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-products-adj-pick"] });
      void qc.invalidateQueries({ queryKey: ["catalog-products"] });
      void qc.invalidateQueries({ queryKey: ["inventory-stock"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Adjust failed",
      ),
  });

  const items = useMemo(() => {
    const list = history.data?.items ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (r) =>
        r.productName.toLowerCase().includes(needle) ||
        r.sku.toLowerCase().includes(needle) ||
        (r.reason ?? "").toLowerCase().includes(needle) ||
        r.actorName.toLowerCase().includes(needle),
    );
  }, [history.data, q]);
  const pagedAdj = usePagedList(items, 20);

  if (!hasMode("sale")) {
    return (
      <EmptyState
        title="Adjustments for product sales"
        detail="Enable the Sell products commerce mode to track quantity adjustments."
        action={
          <Button asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        }
      />
    );
  }

  if (history.isLoading && !history.data) {
    return <PageSkeleton rows={8} />;
  }

  return (
    <div className="flex min-h-0 flex-col gap-4 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.65rem] font-bold tracking-[0.12em] text-[#1a56db] uppercase">
            Inventory
          </p>
          <h1 className="mt-0.5 text-[1.35rem] font-semibold tracking-tight text-[#0b1f33]">
            Adjustments
          </h1>
          <p className="mt-1 max-w-xl text-[0.85rem] text-[#5a6b7d]">
            Correct stock on hand with a reason — theft, damage, found stock, or
            count variance. Same flow for any Universal POS shop.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link href="/catalog">Items</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/transfers">Stock transfer</Link>
          </Button>
          {canWrite ? (
            <Button size="sm" onClick={() => setPickOpen(true)}>
              + New adjustment
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e4e9f0] bg-white px-4 py-2.5">
        <Input
          className="h-9 max-w-sm flex-1 text-[0.8125rem]"
          placeholder="Search product, SKU, reason, or staff"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="text-[0.75rem] text-[#8b9bb0]">
          {items.length} record{items.length === 1 ? "" : "s"}
        </span>
      </div>

      {!items.length ? (
        <EmptyState
          title="No adjustments yet"
          detail="When you change stock quantities, each change is logged here with before/after qty and reason."
          action={
            canWrite ? (
              <Button type="button" onClick={() => setPickOpen(true)}>
                + New adjustment
              </Button>
            ) : undefined
          }
        />
      ) : (
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#e4e9f0] bg-white shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
          <div className="max-h-[min(60dvh,32rem)] overflow-auto overscroll-contain [scrollbar-gutter:stable]">
            <table className="w-full min-w-[52rem] text-left text-[0.8125rem]">
              <thead className="sticky top-0 z-[1] border-b border-[#eef1f4] bg-[#f8fafc] text-[0.7rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Item</th>
                  <th className="px-3 py-2.5">SKU</th>
                  <th className="px-3 py-2.5 text-right">Delta</th>
                  <th className="px-3 py-2.5 text-right">Before</th>
                  <th className="px-3 py-2.5 text-right">After</th>
                  <th className="px-3 py-2.5">Reason</th>
                  <th className="px-4 py-2.5">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef1f4]">
                {pagedAdj.slice.map((r) => {
                  const unit = normalizeSellUnit(r.sellUnit);
                  const up = r.delta > 0;
                  const down = r.delta < 0;
                  return (
                    <tr key={r.id} className="hover:bg-[#fafbfc]">
                      <td className="px-4 py-3 whitespace-nowrap text-[#5a6b7d]">
                        {new Date(r.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-3 font-medium text-[#0b1f33]">
                        {r.productName}
                      </td>
                      <td className="px-3 py-3 font-mono text-[0.75rem] text-[#5a6b7d]">
                        {r.sku}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-3 text-right font-semibold tabular-nums",
                          up && "text-[#047857]",
                          down && "text-[#c81e1e]",
                          !up && !down && "text-[#5a6b7d]",
                        )}
                      >
                        {up ? "+" : ""}
                        {formatQtyWithUnit(r.delta, unit)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#5a6b7d]">
                        {formatQtyWithUnit(r.beforeQty, unit)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-[#0b1f33]">
                        {formatQtyWithUnit(r.afterQty, unit)}
                      </td>
                      <td className="max-w-[12rem] truncate px-3 py-3 text-[#5a6b7d]">
                        {r.reason || "—"}
                      </td>
                      <td className="px-4 py-3 text-[#5a6b7d]">{r.actorName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TablePager {...pagedAdj.pagerProps} />
        </section>
      )}

      {pickOpen ? (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-[#0b1f33]/45"
            aria-label="Close"
            onClick={() => setPickOpen(false)}
          />
          <div className="relative z-10 flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[#e4e9f0] bg-white shadow-xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#eef1f4] px-5 py-4">
              <div>
              <h2 className="text-lg font-semibold text-[#0b1f33]">
                New adjustment
              </h2>
              <p className="mt-1 text-[0.8rem] text-[#5a6b7d]">
                Pick an item, then type how much to add or remove.
              </p>
              </div>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5a6b7d] hover:bg-[#f1f5f9]"
                aria-label="Close"
                onClick={() => setPickOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="shrink-0 px-5 pb-3">
              <Input
                className="h-9"
                placeholder="Search items…"
                value={pickQ}
                onChange={(e) => setPickQ(e.target.value)}
                autoFocus
              />
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain divide-y divide-[#eef1f4]">
              {(products.data?.items ?? []).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-[#f8fafc]"
                    onClick={() => {
                      setAdjustTarget({
                        id: item.id,
                        name: item.title,
                        sku: item.sku,
                        qty: Number(item.qty),
                        sellUnit: item.sellUnit,
                      });
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-[#0b1f33]">
                        {item.title}
                      </span>
                      <span className="font-mono text-[0.72rem] text-[#8b9bb0]">
                        {item.sku}
                      </span>
                    </span>
                    <span className="shrink-0 text-[0.8rem] font-semibold text-[#1341a8]">
                      {formatQtyWithUnit(Number(item.qty), item.sellUnit)}
                    </span>
                  </button>
                </li>
              ))}
              {!products.data?.items?.length && !products.isLoading ? (
                <li className="px-5 py-10 text-center text-sm text-[#5a6b7d]">
                  No items match.{" "}
                  <Link href="/catalog" className="font-semibold text-[#1a56db]">
                    Open Items
                  </Link>
                </li>
              ) : null}
            </ul>
            <div className="shrink-0 border-t border-[#eef1f4] px-5 py-3 text-right">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPickOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <StockAdjustDialog
        target={adjustTarget}
        busy={adjust.isPending}
        onClose={() => setAdjustTarget(null)}
        onSubmit={(args) => adjust.mutate(args)}
      />
    </div>
  );
}
