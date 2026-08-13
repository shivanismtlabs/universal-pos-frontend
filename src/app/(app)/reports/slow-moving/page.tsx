"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  catalogApi,
  reportsApi,
  suppliersApi,
  tenantsApi,
} from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

function severityClass(s: string) {
  if (s === "critical") return "bg-rose-700 text-white";
  if (s === "high") return "bg-rose-100 text-rose-900";
  if (s === "medium") return "bg-amber-100 text-amber-900";
  return "bg-[#f3f4f6] text-[#4b5563]";
}

function rowTone(s: string) {
  if (s === "critical") return "bg-rose-50/80";
  if (s === "high") return "bg-rose-50/40";
  return "";
}

export default function SlowMovingStockReportPage() {
  const { money, businessType, hasMode } = useBootstrap();
  const hasPhysicalGoods = hasMode("sale");

  const [inactiveDays, setInactiveDays] = useState<30 | 60 | 90>(60);
  const [locationId, setLocationId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [minStockValue, setMinStockValue] = useState("0");
  const [applied, setApplied] = useState({
    inactiveDays: 60 as 30 | 60 | 90,
    locationId: "",
    categoryId: "",
    supplierId: "",
    minStockValue: 0,
  });

  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });
  const categories = useQuery({
    queryKey: ["catalog", "categories"],
    queryFn: () => catalogApi.listCategories(),
  });
  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => suppliersApi.list(),
  });

  const report = useQuery({
    queryKey: ["reports", "slow-moving", applied],
    queryFn: () =>
      reportsApi.slowMovingStock({
        inactiveDays: applied.inactiveDays,
        locationId: applied.locationId || undefined,
        categoryId: applied.categoryId || undefined,
        supplierId: applied.supplierId || undefined,
        minStockValue: applied.minStockValue || undefined,
      }),
    enabled: hasPhysicalGoods,
  });

  const data = report.data;
  const histMax = useMemo(
    () => Math.max(1, ...(data?.histogram.map((h) => h.stockValue) ?? [1])),
    [data?.histogram],
  );

  const title =
    data?.title ??
    (businessType === "restaurant"
      ? "Slow-Moving Menu Items"
      : "Slow-Moving / Dead Stock");

  function applyFilters() {
    setApplied({
      inactiveDays,
      locationId,
      categoryId,
      supplierId,
      minStockValue: Number(minStockValue) || 0,
    });
  }

  function exportCsv() {
    if (!data?.items.length) {
      toast.error("Load the report first");
      return;
    }
    const header = [
      "severity",
      "item",
      "sku",
      "category",
      "branch",
      "qty_on_hand",
      "unit_cost",
      "stock_value",
      "last_sale_date",
      "days_since_last_sale",
      "avg_monthly_velocity",
      "suggested_action",
      "supplier",
    ];
    const rows = data.items.map((r) => [
      r.severity,
      r.item,
      r.sku,
      r.category ?? "",
      r.locationName,
      r.qtyOnHand,
      r.unitCost,
      r.stockValue,
      r.lastSaleDate ?? "never",
      r.daysSinceLastSale ?? "",
      r.avgMonthlyVelocity,
      r.suggestedAction,
      r.supplierName ?? "",
    ]);
    downloadCsv(
      `slow-moving_${applied.inactiveDays}d.csv`,
      header,
      rows,
    );
  }

  if (!hasPhysicalGoods) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <PageHeader
          title="Slow-Moving / Dead Stock"
          subtitle="Requires sale-mode inventory tracking."
        />
        <p className="rounded-lg border border-[#e2e8f0] bg-white px-4 py-6 text-sm text-[#6b7280]">
          This report analyzes on-hand stock with no recent sales. Enable the
          sale commerce mode to use it. Service businesses without stock can
          review underbooked offerings via Top-Selling / appointments reports.
        </p>
        <Button asChild variant="secondary">
          <Link href="/reports">Back to reports</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="document-print-root mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={title}
        subtitle={
          data?.labels.actionHint ??
          "Inventory tying up capital — discount, bundle, return, or write off."
        }
        action={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button asChild size="sm" variant="secondary">
              <Link href="/reports">All reports</Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href="/reports/inventory">Inventory</Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!data?.items.length}
              onClick={exportCsv}
            >
              CSV
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!data}
              onClick={() => window.print()}
            >
              PDF / Print
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 rounded-lg border border-[#e2e8f0] bg-white p-4 sm:grid-cols-2 lg:grid-cols-6 print:hidden">
        <div>
          <Label className="text-xs">No sale in last</Label>
          <Select
            className="mt-1 h-9"
            value={String(inactiveDays)}
            onChange={(e) =>
              setInactiveDays(Number(e.target.value) as 30 | 60 | 90)
            }
          >
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="90">90 days</option>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Branch</Label>
          <Select
            className="mt-1 h-9"
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
        <div>
          <Label className="text-xs">Category</Label>
          <Select
            className="mt-1 h-9"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">All categories</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label className="text-xs">Supplier</Label>
          <Select
            className="mt-1 h-9"
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
        <div>
          <Label className="text-xs">Min stock value</Label>
          <Input
            className="mt-1 h-9"
            type="number"
            min={0}
            step={100}
            value={minStockValue}
            onChange={(e) => setMinStockValue(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            className="h-9 w-full"
            onClick={applyFilters}
            disabled={report.isFetching}
          >
            {report.isFetching ? "Loading…" : "Apply"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 sm:col-span-2">
          <p className="text-[0.65rem] font-semibold tracking-[0.1em] text-rose-800 uppercase">
            Capital locked in dead stock
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-rose-950">
            {data ? money(data.summary.totalCapitalLocked) : "—"}
          </p>
          <p className="mt-1 text-xs text-rose-800/80">
            {data
              ? `${data.summary.itemCount} items · threshold ${data.inactiveDays}d`
              : "Apply filters to load"}
          </p>
        </div>
        <div className="rounded-lg border border-[#e2e8f0] bg-white px-4 py-3">
          <p className="text-[0.65rem] font-semibold tracking-[0.1em] text-[#6b7280] uppercase">
            Critical / high
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[#0b1f33]">
            {data
              ? `${data.summary.criticalCount} / ${data.summary.highCount}`
              : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-[#e2e8f0] bg-white px-4 py-3">
          <p className="text-[0.65rem] font-semibold tracking-[0.1em] text-[#6b7280] uppercase">
            Never sold · avg days
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[#0b1f33]">
            {data
              ? `${data.summary.neverSoldCount} · ${data.summary.avgDaysSinceSale ?? "—"}`
              : "—"}
          </p>
        </div>
      </div>

      <section className="rounded-lg border border-[#e2e8f0] bg-white p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#111827]">
            Days since last sale
          </h2>
          <p className="text-xs text-[#6b7280]">
            Stock value by staleness (all on-hand ≥ min value)
          </p>
        </div>
        <ul className="mt-4 space-y-2.5">
          {(data?.histogram ?? []).map((h) => {
            const width = Math.max(3, (h.stockValue / histMax) * 100);
            return (
              <li
                key={h.key}
                className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-2"
              >
                <span className="text-xs font-medium text-[#4b5563]">
                  {h.label}
                </span>
                <div className="h-3 overflow-hidden rounded bg-[#f3f4f6]">
                  <div
                    className={cn(
                      "h-full rounded",
                      h.key === "180_plus" || h.key === "90_179"
                        ? "bg-rose-600"
                        : h.key === "60_89"
                          ? "bg-amber-500"
                          : "bg-[#1a56db]",
                    )}
                    style={{ width: `${width}%` }}
                  />
                </div>
                <span className="min-w-[6.5rem] text-right text-xs tabular-nums text-[#374151]">
                  {money(h.stockValue)}
                  <span className="text-[#9ca3af]"> · {h.itemCount}</span>
                </span>
              </li>
            );
          })}
          {report.isLoading ? (
            <li className="py-4 text-center text-sm text-[#6b7280]">Loading…</li>
          ) : null}
        </ul>
      </section>

      <section className="overflow-hidden rounded-lg border border-[#e2e8f0] bg-white">
        <div className="border-b border-[#e2e8f0] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#111827]">
            Ranked by stock value
          </h2>
          <p className="mt-0.5 text-xs text-[#6b7280]">
            Deep red = 90+ days untouched with high value ·{" "}
            {data?.labels.velocity ?? "Avg monthly sales"} from last{" "}
            {data?.velocityLookbackDays ?? 90} days
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#f8fafc] text-[0.65rem] tracking-[0.08em] text-[#6b7280] uppercase">
              <tr>
                <th className="px-3 py-2 font-semibold">Severity</th>
                <th className="px-3 py-2 font-semibold">
                  {data?.labels.entity ?? "Product"}
                </th>
                <th className="px-3 py-2 font-semibold">Category</th>
                <th className="px-3 py-2 font-semibold text-right">Qty</th>
                <th className="px-3 py-2 font-semibold text-right">Value</th>
                <th className="px-3 py-2 font-semibold">Last sale</th>
                <th className="px-3 py-2 font-semibold text-right">Days</th>
                <th className="px-3 py-2 font-semibold text-right">
                  {data?.labels.velocity ?? "Velocity / mo"}
                </th>
                <th className="px-3 py-2 font-semibold">Suggested</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {(data?.items ?? []).map((r) => (
                <tr
                  key={`${r.productId}:${r.locationId}`}
                  className={cn("hover:bg-[#f8fafc]", rowTone(r.severity))}
                >
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex rounded px-2 py-0.5 text-[0.65rem] font-semibold uppercase",
                        severityClass(r.severity),
                      )}
                    >
                      {r.severity}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-[#111827]">{r.item}</p>
                    <p className="text-xs text-[#6b7280]">
                      {r.sku} · {r.locationName}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-[#4b5563]">
                    {r.category ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.qtyOnHand}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {money(r.stockValue)}
                  </td>
                  <td className="px-3 py-2 text-[#4b5563]">
                    {r.neverSold ? "Never" : (r.lastSaleDate ?? "—")}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums font-semibold",
                      (r.daysSinceLastSale ?? 999) >= 90
                        ? "text-rose-700"
                        : "text-[#111827]",
                    )}
                  >
                    {r.neverSold ? "∞" : (r.daysSinceLastSale ?? "—")}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.avgMonthlyVelocity}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs font-semibold text-[#1a56db]">
                      {r.suggestedAction}
                    </span>
                    {r.supplierName ? (
                      <p className="text-[0.65rem] text-[#9ca3af]">
                        {r.supplierName}
                      </p>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!report.isLoading && !(data?.items.length) ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-10 text-center text-[#6b7280]"
                  >
                    No slow-moving stock matched these filters
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
