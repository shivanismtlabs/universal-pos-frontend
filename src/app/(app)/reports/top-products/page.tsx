"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  catalogApi,
  reportsApi,
  tenantsApi,
  type TopSellingProductRow,
  type TopSellingRankBy,
} from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { cn, todayYmd } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
}

function sortPool(pool: TopSellingProductRow[], rankBy: TopSellingRankBy) {
  const copy = [...pool];
  copy.sort((a, b) => {
    if (rankBy === "units") return b.unitsSold - a.unitsSold;
    if (rankBy === "orders") return b.orderCount - a.orderCount;
    if (rankBy === "margin") {
      const d = b.profitMarginPct - a.profitMarginPct;
      if (d !== 0) return d;
      return b.profitContribution - a.profitContribution;
    }
    return b.grossRevenue - a.grossRevenue;
  });
  return copy;
}

function metricValue(row: TopSellingProductRow, rankBy: TopSellingRankBy) {
  if (rankBy === "units") return row.unitsSold;
  if (rankBy === "orders") return row.orderCount;
  if (rankBy === "margin") return row.profitMarginPct;
  return row.grossRevenue;
}

function TrendArrow({
  direction,
  changePct,
}: {
  direction: "up" | "down" | "flat";
  changePct: number | null;
}) {
  const label =
    changePct == null
      ? direction === "up"
        ? "New"
        : "—"
      : `${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}%`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold tabular-nums",
        direction === "up" && "text-emerald-700",
        direction === "down" && "text-rose-600",
        direction === "flat" && "text-[#6b7280]",
      )}
      title="vs previous equal-length period (by revenue)"
    >
      <span aria-hidden>
        {direction === "up" ? "↑" : direction === "down" ? "↓" : "→"}
      </span>
      {label}
    </span>
  );
}

export default function TopSellingProductsReportPage() {
  const { money, businessType } = useBootstrap();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(todayYmd);
  const [locationId, setLocationId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [mealPeriod, setMealPeriod] = useState<
    "all" | "breakfast" | "lunch" | "dinner"
  >("all");
  const [topN, setTopN] = useState<10 | 20 | 50 | 100>(20);
  const [rankBy, setRankBy] = useState<TopSellingRankBy>("revenue");
  const [applied, setApplied] = useState({
    from: defaultFrom(),
    to: todayYmd(),
    locationId: "",
    categoryId: "",
    mealPeriod: "all" as "all" | "breakfast" | "lunch" | "dinner",
  });

  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });
  const categories = useQuery({
    queryKey: ["catalog", "categories"],
    queryFn: () => catalogApi.listCategories(),
  });

  const report = useQuery({
    queryKey: ["reports", "top-selling", applied],
    queryFn: () =>
      reportsApi.topSellingProducts({
        from: applied.from,
        to: applied.to,
        locationId: applied.locationId || undefined,
        categoryId: applied.categoryId || undefined,
        mealPeriod: applied.mealPeriod,
        topN: 100,
        rankBy: "revenue",
        includeCrossSell: true,
      }),
  });

  const data = report.data;

  const ranked = useMemo(() => {
    const pool = data?.pool ?? [];
    return sortPool(pool, rankBy)
      .slice(0, topN)
      .map((row, i) => ({ ...row, rank: i + 1 }));
  }, [data?.pool, rankBy, topN]);

  const chartRows = useMemo(() => ranked.slice(0, 10), [ranked]);
  const chartMax = useMemo(
    () => Math.max(1, ...chartRows.map((r) => metricValue(r, rankBy))),
    [chartRows, rankBy],
  );

  const showMeal =
    data?.showMealPeriod ||
    businessType === "restaurant" ||
    businessType === "hybrid";

  const title =
    data?.title ??
    (businessType === "restaurant"
      ? "Top-Selling Menu Items"
      : businessType === "service" || businessType === "salon"
        ? "Top-Booked Services"
        : "Top-Selling Products");

  const labels = data?.labels ?? {
    units: "Units sold",
    orders: "Orders containing item",
    revenue: "Gross revenue",
    profit: "Profit contribution",
    entity: "Product",
  };

  function applyFilters() {
    setApplied({
      from,
      to,
      locationId,
      categoryId,
      mealPeriod,
    });
  }

  function exportCsv() {
    if (!data || !ranked.length) {
      toast.error("Load the report first");
      return;
    }
    const header = [
      "rank",
      "name",
      "sku",
      "category",
      "units_sold",
      "gross_revenue",
      "profit_contribution",
      "profit_margin_pct",
      "order_count",
      "pct_of_total_sales",
      "trend_direction",
      "trend_change_pct",
      "frequently_bought_with",
    ];
    const rows = ranked.map((r) => [
      r.rank,
      r.name,
      r.sku,
      r.categoryName ?? "",
      r.unitsSold,
      r.grossRevenue,
      r.profitContribution,
      r.profitMarginPct,
      r.orderCount,
      r.pctOfTotalSales,
      r.trend.direction,
      r.trend.changePct ?? "",
      r.frequentlyBoughtWith
        .map((p) => `${p.name} (${p.strengthPct}%)`)
        .join("; "),
    ]);
    downloadCsv(
      `top-selling_${data.period.from}_${data.period.to}_${rankBy}.csv`,
      header,
      rows,
    );
  }

  const rankOptions: Array<{ value: TopSellingRankBy; label: string }> = [
    { value: "revenue", label: labels.revenue },
    { value: "units", label: labels.units },
    {
      value: "margin",
      label: data?.emphasizeMargin
        ? "Profit margin % (retail)"
        : "Profit margin %",
    },
    { value: "orders", label: labels.orders },
  ];

  return (
    <div className="document-print-root mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={title}
        subtitle="Best performers for inventory, promotions, and merchandising — prior-period trend and optional basket pairs."
        action={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button type="button" size="sm" variant="secondary" asChild>
              <Link href="/reports">All reports</Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!ranked.length}
              onClick={exportCsv}
            >
              CSV
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!ranked.length}
              onClick={() => window.print()}
            >
              PDF / Print
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 rounded-lg border border-[#e2e8f0] bg-white p-4 sm:grid-cols-2 lg:grid-cols-6 print:hidden">
        <div>
          <Label className="text-xs">From</Label>
          <Input
            className="mt-1 h-9"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input
            className="mt-1 h-9"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
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
        {showMeal ? (
          <div>
            <Label className="text-xs">Meal period</Label>
            <Select
              className="mt-1 h-9"
              value={mealPeriod}
              onChange={(e) =>
                setMealPeriod(
                  e.target.value as "all" | "breakfast" | "lunch" | "dinner",
                )
              }
            >
              <option value="all">All day</option>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
            </Select>
          </div>
        ) : (
          <div>
            <Label className="text-xs">Top N</Label>
            <Select
              className="mt-1 h-9"
              value={String(topN)}
              onChange={(e) =>
                setTopN(Number(e.target.value) as 10 | 20 | 50 | 100)
              }
            >
              <option value="10">Top 10</option>
              <option value="20">Top 20</option>
              <option value="50">Top 50</option>
              <option value="100">Top 100</option>
            </Select>
          </div>
        )}
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

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-[#e2e8f0] bg-white p-4 print:hidden">
        <div>
          <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#6b7280] uppercase">
            Rank by (live — no reload)
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {rankOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setRankBy(o.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                  rankBy === o.value
                    ? "bg-[#1a56db] text-white"
                    : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {showMeal ? (
            <div>
              <Label className="text-xs">Top N</Label>
              <Select
                className="mt-1 h-9 w-28"
                value={String(topN)}
                onChange={(e) =>
                  setTopN(Number(e.target.value) as 10 | 20 | 50 | 100)
                }
              >
                <option value="10">Top 10</option>
                <option value="20">Top 20</option>
                <option value="50">Top 50</option>
                <option value="100">Top 100</option>
              </Select>
            </div>
          ) : null}
          {data ? (
            <p className="pb-2 text-xs text-[#6b7280]">
              {data.period.from} → {data.period.to} · vs{" "}
              {data.period.prevFrom} → {data.period.prevTo}
            </p>
          ) : null}
        </div>
      </div>

      {report.isError ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Could not load report. Check the API is running and try Apply again.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: labels.revenue,
            value: data ? money(data.totals.grossRevenue) : "—",
          },
          {
            label: labels.units,
            value: data ? String(data.totals.unitsSold) : "—",
          },
          {
            label: labels.profit,
            value: data ? money(data.totals.profitContribution) : "—",
          },
          {
            label: "Distinct items",
            value: data ? String(data.totals.productCount) : "—",
          },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-lg border border-[#e2e8f0] bg-white px-4 py-3"
          >
            <p className="text-[0.65rem] font-semibold tracking-[0.1em] text-[#6b7280] uppercase">
              {k.label}
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-[#0b1f33]">
              {k.value}
            </p>
          </div>
        ))}
      </div>

      <section className="rounded-lg border border-[#e2e8f0] bg-white p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#111827]">
            Top 10 by {rankOptions.find((o) => o.value === rankBy)?.label}
          </h2>
          <p className="text-xs text-[#6b7280]">Horizontal share of ranking metric</p>
        </div>
        <ul className="mt-4 space-y-2.5">
          {chartRows.map((r) => {
            const val = metricValue(r, rankBy);
            const width = Math.max(4, (val / chartMax) * 100);
            return (
              <li key={r.key} className="grid grid-cols-[2rem_1fr_auto] items-center gap-2">
                <span className="text-xs font-semibold tabular-nums text-[#6b7280]">
                  #{r.rank}
                </span>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-[#111827]">
                      {r.name}
                    </p>
                    <p className="shrink-0 text-xs tabular-nums text-[#374151]">
                      {rankBy === "margin"
                        ? `${val.toFixed(1)}%`
                        : rankBy === "revenue"
                          ? money(val)
                          : val}
                    </p>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded bg-[#f3f4f6]">
                    <div
                      className="h-full rounded bg-[#1a56db]"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
          {!chartRows.length && !report.isLoading ? (
            <li className="py-6 text-center text-sm text-[#6b7280]">
              No sales in this period
            </li>
          ) : null}
          {report.isLoading ? (
            <li className="py-6 text-center text-sm text-[#6b7280]">Loading…</li>
          ) : null}
        </ul>
      </section>

      <section className="overflow-hidden rounded-lg border border-[#e2e8f0] bg-white">
        <div className="border-b border-[#e2e8f0] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#111827]">
            Ranked {labels.entity.toLowerCase()}s
          </h2>
          <p className="mt-0.5 text-xs text-[#6b7280]">
            Showing {ranked.length} of {data?.pool.length ?? 0} in pool · margin
            uses catalog cost × qty
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#f8fafc] text-[0.65rem] tracking-[0.08em] text-[#6b7280] uppercase">
              <tr>
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">{labels.entity}</th>
                <th className="px-3 py-2 font-semibold">Category</th>
                <th className="px-3 py-2 font-semibold text-right">
                  {labels.units}
                </th>
                <th className="px-3 py-2 font-semibold text-right">
                  {labels.revenue}
                </th>
                <th className="px-3 py-2 font-semibold text-right">
                  {labels.profit}
                </th>
                <th className="px-3 py-2 font-semibold text-right">Margin %</th>
                <th className="px-3 py-2 font-semibold text-right">% sales</th>
                <th className="px-3 py-2 font-semibold text-right">
                  {labels.orders}
                </th>
                <th className="px-3 py-2 font-semibold">Trend</th>
                <th className="px-3 py-2 font-semibold">Bought with</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {ranked.map((r) => (
                <tr key={r.key} className="hover:bg-[#f8fafc]">
                  <td className="px-3 py-2 tabular-nums text-[#6b7280]">
                    {r.rank}
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-[#111827]">{r.name}</p>
                    <p className="text-xs text-[#6b7280]">{r.sku}</p>
                  </td>
                  <td className="px-3 py-2 text-[#4b5563]">
                    {r.categoryName ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.unitsSold}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {money(r.grossRevenue)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {money(r.profitContribution)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      data?.emphasizeMargin &&
                        r.unitsSold >= 5 &&
                        r.profitMarginPct < 15 &&
                        "font-semibold text-amber-700",
                    )}
                  >
                    {r.profitMarginPct.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.pctOfTotalSales.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.orderCount}
                  </td>
                  <td className="px-3 py-2">
                    <TrendArrow
                      direction={r.trend.direction}
                      changePct={r.trend.changePct}
                    />
                  </td>
                  <td className="max-w-[12rem] px-3 py-2 text-xs text-[#4b5563]">
                    {r.frequentlyBoughtWith.length
                      ? r.frequentlyBoughtWith
                          .map((p) => `${p.name} (${p.strengthPct}%)`)
                          .join(", ")
                      : "—"}
                  </td>
                </tr>
              ))}
              {!ranked.length && !report.isLoading ? (
                <tr>
                  <td
                    colSpan={11}
                    className="px-3 py-10 text-center text-[#6b7280]"
                  >
                    No products matched these filters
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
