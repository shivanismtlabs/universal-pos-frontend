"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { catalogApi, reportsApi, tenantsApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

function pctLabel(n: number | null | undefined) {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : "";
  return sign + n.toFixed(1) + "%";
}

function pctTone(n: number | null | undefined) {
  if (n == null || n === 0) return "text-[#6b7280]";
  return n > 0 ? "text-emerald-700" : "text-rose-600";
}

const now = new Date();

export default function MonthlySalesReportPage() {
  const { money } = useBootstrap();
  const qc = useQueryClient();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [useFiscal, setUseFiscal] = useState(false);
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [compareTo, setCompareTo] = useState<
    "previous_month" | "same_month_last_year"
  >("previous_month");
  const [applied, setApplied] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    useFiscal: false,
    locationIds: [] as string[],
    categoryId: "",
    compareTo: "previous_month" as "previous_month" | "same_month_last_year",
  });
  const [targetInput, setTargetInput] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState("");

  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });
  const categories = useQuery({
    queryKey: ["catalog", "categories"],
    queryFn: () => catalogApi.listCategories(),
  });

  const report = useQuery({
    queryKey: ["reports", "monthly-sales", applied],
    queryFn: () =>
      reportsApi.monthlySales({
        year: applied.year,
        month: applied.month,
        useFiscal: applied.useFiscal,
        locationIds: applied.locationIds,
        categoryId: applied.categoryId || undefined,
        compareTo: applied.compareTo,
      }),
  });

  const scheduleQ = useQuery({
    queryKey: ["reports", "monthly-email"],
    queryFn: () => reportsApi.getMonthlyEmailSchedule(),
  });

  const data = report.data;
  const s = data?.summary;
  const maxDaily = useMemo(
    () => Math.max(1, ...(data?.daily.map((d) => d.sales) ?? [1])),
    [data?.daily],
  );

  const saveTarget = useMutation({
    mutationFn: () =>
      reportsApi.upsertMonthlyTarget({
        year: applied.year,
        month: applied.month,
        amount: targetInput.trim() === "" ? null : Number(targetInput),
      }),
    onSuccess: () => {
      toast.success("Monthly target saved");
      void qc.invalidateQueries({ queryKey: ["reports", "monthly-sales"] });
    },
    onError: (e: Error) => toast.error(e.message || "Failed to save target"),
  });

  const saveSchedule = useMutation({
    mutationFn: () =>
      reportsApi.updateMonthlyEmailSchedule({
        enabled: emailEnabled,
        recipients: emailRecipients
          .split(/[,;\s]+/)
          .map((x) => x.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      toast.success("Email schedule saved");
      void qc.invalidateQueries({ queryKey: ["reports", "monthly-email"] });
    },
    onError: (e: Error) => toast.error(e.message || "Failed to save schedule"),
  });

  const sendNow = useMutation({
    mutationFn: () => reportsApi.sendMonthlyScheduled(true),
    onSuccess: (r) => {
      if (r.sent) toast.success("Prior-month report emailed");
      else toast.message(r.reason || "Not sent");
      void qc.invalidateQueries({ queryKey: ["reports", "monthly-email"] });
    },
    onError: (e: Error) => toast.error(e.message || "Send failed"),
  });

  useEffect(() => {
    if (!scheduleQ.data) return;
    setEmailEnabled(Boolean(scheduleQ.data.enabled));
    setEmailRecipients((scheduleQ.data.recipients ?? []).join(", "));
  }, [scheduleQ.data]);

  function applyFilters() {
    setApplied({
      year,
      month,
      useFiscal,
      locationIds,
      categoryId,
      compareTo,
    });
  }

  function toggleLocation(id: string) {
    setLocationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function exportBoardCsv() {
    if (!data || !s) {
      toast.error("Load the report first");
      return;
    }
    const rows: Array<Array<string | number>> = [
      ["section", "metric", "value"],
      ["meta", "period", data.period.label],
      ["meta", "tenant", data.tenantName],
      ["meta", "timezone", data.timezone],
      ["summary", "revenue", s.revenue],
      ["summary", "orders", s.orderCount],
      ["summary", "avg_daily", s.avgDailySales],
      ["summary", "aov", s.avgOrderValue],
      [
        "comparison",
        "vs_previous_month_pct",
        data.comparison.previousMonth.changePct ?? "",
      ],
      [
        "comparison",
        "vs_same_month_ly_pct",
        data.comparison.sameMonthLastYear.changePct ?? "",
      ],
      ["target", "amount", data.target.amount ?? ""],
      ["target", "pct_achieved", data.target.pct ?? ""],
      ["customers", "new", data.customers.newAcquired],
      ["customers", "returning", data.customers.returning],
      ["best_day", data.bestDay?.date ?? "", data.bestDay?.sales ?? ""],
      ["worst_day", data.worstDay?.date ?? "", data.worstDay?.sales ?? ""],
    ];
    for (const d of data.daily) {
      rows.push([
        "daily",
        d.date,
        d.sales + "|" + d.orders + (d.isWeekend ? "|weekend" : "|weekday"),
      ]);
    }
    for (const w of data.weeks) {
      rows.push(["week", w.label, w.sales + "|" + w.orders]);
    }
    for (const c of data.byCategory) {
      rows.push(["category", c.name, c.revenue + "|" + c.pct + "%"]);
    }
    for (const b of data.byBranch) {
      rows.push(["branch", b.name, b.revenue + "|" + b.pct + "%"]);
    }
    downloadCsv(
      "monthly-sales_" + data.period.key + ".csv",
      rows[0] as string[],
      rows.slice(1),
    );
    toast.success("Board summary CSV downloaded");
  }

  const card = "rounded-lg border border-[#e2e8f0] bg-white px-4 py-3";
  const primaryCmp =
    applied.compareTo === "same_month_last_year"
      ? data?.comparison.sameMonthLastYear
      : data?.comparison.previousMonth;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Monthly Sales Report"
        subtitle="Month trends, targets, and MoM / YoY comparison for management review."
        action={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button asChild variant="secondary" size="sm" className="h-9">
              <Link href="/reports/daily">Daily</Link>
            </Button>
            <Button asChild variant="secondary" size="sm" className="h-9">
              <Link href="/reports">All reports</Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-9"
              disabled={!data}
              onClick={exportBoardCsv}
            >
              Board CSV
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-9"
              disabled={!data}
              onClick={() => window.print()}
            >
              PDF / Print
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 rounded-lg border border-[#e2e8f0] bg-white p-4 lg:grid-cols-6 print:hidden">
        <div>
          <Label className="text-xs">Year</Label>
          <Input
            className="mt-1 h-9"
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </div>
        <div>
          <Label className="text-xs">Month</Label>
          <Select
            className="mt-1 h-9"
            value={String(month)}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {new Date(2000, m - 1, 1).toLocaleString("en", {
                  month: "long",
                })}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label className="text-xs">Calendar / Fiscal</Label>
          <Select
            className="mt-1 h-9"
            value={useFiscal ? "fiscal" : "calendar"}
            onChange={(e) => setUseFiscal(e.target.value === "fiscal")}
          >
            <option value="calendar">Calendar year</option>
            <option value="fiscal">Fiscal year</option>
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
            {(categories.data ?? []).map(
              (c: { id: string; name: string }) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ),
            )}
          </Select>
        </div>
        <div>
          <Label className="text-xs">Compare highlight</Label>
          <Select
            className="mt-1 h-9"
            value={compareTo}
            onChange={(e) =>
              setCompareTo(
                e.target.value as "previous_month" | "same_month_last_year",
              )
            }
          >
            <option value="previous_month">Previous month</option>
            <option value="same_month_last_year">Same month last year</option>
          </Select>
        </div>
        <div className="flex items-end">
          <Button type="button" className="h-9 w-full" onClick={applyFilters}>
            Apply
          </Button>
        </div>
        <div className="lg:col-span-6">
          <Label className="text-xs">Branches (empty = all combined)</Label>
          <div className="mt-1 flex flex-wrap gap-2">
            {(locations.data ?? []).map((l) => {
              const on = locationIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => toggleLocation(l.id)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs",
                    on
                      ? "border-[#1a56db] bg-[#eff6ff] text-[#1a56db]"
                      : "border-[#e2e8f0] bg-white text-[#374151]",
                  )}
                >
                  {l.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {report.isLoading ? (
        <p className="text-sm text-[#6b7280]">Loading monthly sales…</p>
      ) : report.isError ? (
        <p className="text-sm text-rose-600">
          Failed to load monthly report
          {report.error instanceof Error && report.error.message
            ? `: ${report.error.message}`
            : ". Restart the API if you just pulled new report code."}
        </p>
      ) : data && s ? (
        <>
          <p className="text-xs text-[#6b7280]">
            {data.period.label}
            {data.period.useFiscal
              ? " · Fiscal (start month " + data.period.fiscalStartMonth + ")"
              : " · Calendar"}
            {" · "}
            {data.timezone} · {data.currencyCode}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["Total revenue", money(s.revenue)],
                ["Total orders", String(s.orderCount)],
                ["Avg daily sales", money(s.avgDailySales)],
                ["Avg order value", money(s.avgOrderValue)],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className={card}>
                <p className="text-[0.65rem] font-semibold tracking-wide text-[#9ca3af] uppercase">
                  {label}
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-[#111827]">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <div className={cn(card, "lg:col-span-2")}>
              <p className="mb-3 text-sm font-semibold">
                Day-by-day sales{" "}
                <span className="font-normal text-[#6b7280]">
                  (weekend bars muted)
                </span>
              </p>
              <div className="flex h-44 items-end gap-px">
                {data.daily.map((d) => {
                  const barPct = Math.max(
                    d.sales > 0 ? 3 : 0,
                    (d.sales / maxDaily) * 100,
                  );
                  return (
                    <div
                      key={d.date}
                      className="flex min-w-0 flex-1 flex-col items-center justify-end"
                      title={
                        d.date +
                        ": " +
                        money(d.sales) +
                        (d.isWeekend ? " (weekend)" : "")
                      }
                    >
                      <div
                        className={
                          d.isWeekend
                            ? "w-full rounded-t bg-[#93c5fd]"
                            : "w-full rounded-t bg-[#1a56db]"
                        }
                        style={{ height: barPct + "%" }}
                      ></div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 flex justify-between text-xs text-[#9ca3af]">
                <span>{data.daily[0]?.date.slice(8)}</span>
                <span>Day of month</span>
                <span>{data.daily[data.daily.length - 1]?.date.slice(8)}</span>
              </div>
            </div>

            <div className={card}>
              <p className="text-sm font-semibold">Sales target</p>
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-[#6b7280]">
                  <span>Achieved</span>
                  <span>
                    {data.target.pct != null
                      ? data.target.pct.toFixed(0) + "%"
                      : "No target"}
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-[#eef2f7]">
                  <div
                    className="h-full rounded-full bg-[#1a56db]"
                    style={{
                      width:
                        Math.min(100, Math.max(0, data.target.pct ?? 0)) + "%",
                    }}
                  ></div>
                </div>
                <p className="mt-2 text-sm tabular-nums">
                  {money(data.target.achieved)}
                  {data.target.amount != null
                    ? " / " + money(data.target.amount)
                    : ""}
                </p>
              </div>
              <div className="mt-4 space-y-2 print:hidden">
                <Label className="text-xs">Set target for this period</Label>
                <div className="flex gap-2">
                  <Input
                    className="h-9"
                    type="number"
                    placeholder="Amount"
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-9"
                    disabled={saveTarget.isPending}
                    onClick={() => saveTarget.mutate()}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div
              className={cn(
                card,
                applied.compareTo === "previous_month" &&
                  "ring-1 ring-[#1a56db]",
              )}
            >
              <p className="text-[0.65rem] font-semibold tracking-wide text-[#9ca3af] uppercase">
                vs previous month ({data.comparison.previousMonth.period})
              </p>
              <p
                className={cn(
                  "mt-1 text-lg font-semibold tabular-nums",
                  pctTone(data.comparison.previousMonth.changePct),
                )}
              >
                {pctLabel(data.comparison.previousMonth.changePct)}
              </p>
              <p className="text-xs text-[#6b7280]">
                {money(data.comparison.previousMonth.revenue)} ·{" "}
                {data.comparison.previousMonth.orderCount} orders
              </p>
            </div>
            <div
              className={cn(
                card,
                applied.compareTo === "same_month_last_year" &&
                  "ring-1 ring-[#1a56db]",
              )}
            >
              <p className="text-[0.65rem] font-semibold tracking-wide text-[#9ca3af] uppercase">
                vs same month LY ({data.comparison.sameMonthLastYear.period})
              </p>
              <p
                className={cn(
                  "mt-1 text-lg font-semibold tabular-nums",
                  pctTone(data.comparison.sameMonthLastYear.changePct),
                )}
              >
                {pctLabel(data.comparison.sameMonthLastYear.changePct)}
              </p>
              <p className="text-xs text-[#6b7280]">
                {money(data.comparison.sameMonthLastYear.revenue)} ·{" "}
                {data.comparison.sameMonthLastYear.orderCount} orders
              </p>
            </div>
            <div className={card}>
              <p className="text-[0.65rem] font-semibold tracking-wide text-[#9ca3af] uppercase">
                Highlighted growth
              </p>
              <p
                className={cn(
                  "mt-1 text-lg font-semibold tabular-nums",
                  pctTone(primaryCmp?.changePct),
                )}
              >
                {pctLabel(primaryCmp?.changePct)}
              </p>
              <p className="text-xs text-[#6b7280]">
                Best day {data.bestDay?.date ?? "—"} (
                {data.bestDay ? money(data.bestDay.sales) : "—"})
                <br />
                Worst day {data.worstDay?.date ?? "—"} (
                {data.worstDay ? money(data.worstDay.sales) : "—"})
              </p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className={card}>
              <p className="mb-2 text-sm font-semibold">Week-over-week</p>
              <table className="w-full text-left text-sm">
                <thead className="text-[0.7rem] text-[#6b7280] uppercase">
                  <tr>
                    <th className="py-1 font-medium">Week</th>
                    <th className="py-1 font-medium">Sales</th>
                    <th className="py-1 font-medium">Orders</th>
                    <th className="py-1 font-medium">Weekday / WE</th>
                  </tr>
                </thead>
                <tbody>
                  {data.weeks.map((w) => (
                    <tr key={w.week} className="border-t border-[#eef2f7]">
                      <td className="py-1.5">
                        {w.label}
                        <span className="block text-[0.7rem] text-[#9ca3af]">
                          {w.from.slice(8)}–{w.to.slice(8)}
                        </span>
                      </td>
                      <td className="py-1.5 tabular-nums">{money(w.sales)}</td>
                      <td className="py-1.5 tabular-nums">{w.orders}</td>
                      <td className="py-1.5 text-xs tabular-nums text-[#6b7280]">
                        {money(w.weekdaySales)} / {money(w.weekendSales)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={card}>
              <p className="mb-2 text-sm font-semibold">Comparison table</p>
              <table className="w-full text-left text-sm">
                <thead className="text-[0.7rem] text-[#6b7280] uppercase">
                  <tr>
                    <th className="py-1 font-medium">Period</th>
                    <th className="py-1 font-medium">Revenue</th>
                    <th className="py-1 font-medium">Orders</th>
                    <th className="py-1 font-medium">Δ%</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-[#eef2f7]">
                    <td className="py-1.5 font-medium">This month</td>
                    <td className="py-1.5 tabular-nums">{money(s.revenue)}</td>
                    <td className="py-1.5 tabular-nums">{s.orderCount}</td>
                    <td className="py-1.5">—</td>
                  </tr>
                  <tr className="border-t border-[#eef2f7]">
                    <td className="py-1.5">
                      Last month ({data.comparison.previousMonth.period})
                    </td>
                    <td className="py-1.5 tabular-nums">
                      {money(data.comparison.previousMonth.revenue)}
                    </td>
                    <td className="py-1.5 tabular-nums">
                      {data.comparison.previousMonth.orderCount}
                    </td>
                    <td
                      className={cn(
                        "py-1.5 tabular-nums",
                        pctTone(data.comparison.previousMonth.changePct),
                      )}
                    >
                      {pctLabel(data.comparison.previousMonth.changePct)}
                    </td>
                  </tr>
                  <tr className="border-t border-[#eef2f7]">
                    <td className="py-1.5">
                      Same month LY ({data.comparison.sameMonthLastYear.period})
                    </td>
                    <td className="py-1.5 tabular-nums">
                      {money(data.comparison.sameMonthLastYear.revenue)}
                    </td>
                    <td className="py-1.5 tabular-nums">
                      {data.comparison.sameMonthLastYear.orderCount}
                    </td>
                    <td
                      className={cn(
                        "py-1.5 tabular-nums",
                        pctTone(data.comparison.sameMonthLastYear.changePct),
                      )}
                    >
                      {pctLabel(data.comparison.sameMonthLastYear.changePct)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <div className={card}>
              <p className="mb-2 text-sm font-semibold">Category share</p>
              <ul className="space-y-2 text-sm">
                {data.byCategory.slice(0, 8).map((c) => (
                  <li key={c.categoryId ?? c.name}>
                    <div className="mb-0.5 flex justify-between gap-2">
                      <span className="truncate">{c.name}</span>
                      <span className="tabular-nums text-[#6b7280]">
                        {c.pct}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[#eef2f7]">
                      <div
                        className="h-full rounded-full bg-[#0e9f6e]"
                        style={{ width: Math.min(100, c.pct) + "%" }}
                      ></div>
                    </div>
                  </li>
                ))}
                {!data.byCategory.length ? (
                  <li className="text-[#6b7280]">No category sales</li>
                ) : null}
              </ul>
            </div>
            <div className={card}>
              <p className="mb-2 text-sm font-semibold">Branch share</p>
              <ul className="space-y-2 text-sm">
                {data.byBranch.map((b) => (
                  <li key={b.locationId}>
                    <div className="mb-0.5 flex justify-between gap-2">
                      <span className="truncate">{b.name}</span>
                      <span className="tabular-nums text-[#6b7280]">
                        {b.pct}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[#eef2f7]">
                      <div
                        className="h-full rounded-full bg-[#1a56db]"
                        style={{ width: Math.min(100, b.pct) + "%" }}
                      ></div>
                    </div>
                    <p className="mt-0.5 text-xs tabular-nums text-[#9ca3af]">
                      {money(b.revenue)} · {b.orders} orders
                    </p>
                  </li>
                ))}
                {!data.byBranch.length ? (
                  <li className="text-[#6b7280]">No branch sales</li>
                ) : null}
              </ul>
            </div>
            <div className={card}>
              <p className="mb-2 text-sm font-semibold">Customers</p>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-[#6b7280]">New acquired</dt>
                  <dd className="text-xl font-semibold tabular-nums">
                    {data.customers.newAcquired}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#6b7280]">Returning</dt>
                  <dd className="text-xl font-semibold tabular-nums">
                    {data.customers.returning}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-[#6b7280]">
                    Unique customers with orders
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    {data.customers.withOrders}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <div className={cn(card, "print:hidden")}>
            <p className="text-sm font-semibold">
              Auto-email on the 1st (prior month)
            </p>
            <p className="mt-1 text-xs text-[#6b7280]">
              Schedule is stored on the tenant. Point a daily cron at{" "}
              <code className="rounded bg-[#f3f4f6] px-1">
                POST /v1/reports/monthly-sales/send-scheduled
              </code>{" "}
              — it only sends on the 1st in your business timezone.
              {scheduleQ.data?.lastSentFor
                ? " Last sent for " + scheduleQ.data.lastSentFor + "."
                : ""}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Enabled</Label>
                <Select
                  className="mt-1 h-9"
                  value={emailEnabled ? "1" : "0"}
                  onChange={(e) => setEmailEnabled(e.target.value === "1")}
                >
                  <option value="0">Off</option>
                  <option value="1">On</option>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Recipients (comma-separated)</Label>
                <Input
                  className="mt-1 h-9"
                  value={emailRecipients}
                  onChange={(e) => setEmailRecipients(e.target.value)}
                  placeholder="owner@shop.com, cfo@shop.com"
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={saveSchedule.isPending}
                onClick={() => saveSchedule.mutate()}
              >
                Save schedule
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={sendNow.isPending}
                onClick={() => sendNow.mutate()}
              >
                Send prior month now
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
