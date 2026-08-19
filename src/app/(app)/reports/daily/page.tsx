"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { reportsApi, tenantsApi, usersApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { todayYmd, cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { buildThermalEodHtml } from "@/lib/thermal-eod-html";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

const PAY_METHODS = [
  { value: "", label: "All methods" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI" },
  { value: "wallet", label: "Wallet" },
  { value: "qr", label: "QR" },
  { value: "store_credit", label: "Store credit / on-account" },
  { value: "gift_card", label: "Gift card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "collect_later", label: "Collect later" },
];

function pctLabel(n: number | null | undefined) {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function pctTone(n: number | null | undefined) {
  if (n == null || n === 0) return "text-[#6b7280]";
  return n > 0 ? "text-emerald-700" : "text-rose-600";
}

export default function DailySalesReportPage() {
  const { money, hasCapability } = useBootstrap();
  const [date, setDate] = useState(todayYmd());
  const [locationId, setLocationId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [registerSessionId, setRegisterSessionId] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [applied, setApplied] = useState({
    date: todayYmd(),
    locationId: "",
    employeeId: "",
    paymentMethod: "",
    registerSessionId: "",
  });

  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });
  const users = useQuery({
    queryKey: ["users", "report-filter"],
    queryFn: () => usersApi.list(),
  });

  const report = useQuery({
    queryKey: ["reports", "daily-sales", applied, page, sortBy, sortDir],
    queryFn: () =>
      reportsApi.dailySales({
        date: applied.date,
        locationId: applied.locationId || undefined,
        employeeId: applied.employeeId || undefined,
        paymentMethod: applied.paymentMethod || undefined,
        registerSessionId: applied.registerSessionId || undefined,
        page,
        pageSize: 25,
        sortBy,
        sortDir,
      }),
  });

  const data = report.data;
  const s = data?.summary;
  const maxHourly = useMemo(
    () => Math.max(1, ...(data?.hourly.map((h) => h.sales) ?? [1])),
    [data?.hourly],
  );

  const showRestaurant =
    hasCapability("KOT") ||
    hasCapability("KITCHEN") ||
    hasCapability("TABLE") ||
    Boolean(data?.variations.fulfillmentSplit.length) ||
    data?.variations.tableTurnover != null;
  const showRetailOmni = Boolean(data?.variations.channelSplit.length);
  const showService =
    hasCapability("BOOKING") ||
    hasCapability("STAFF_ASSIGNMENT") ||
    (data?.variations.appointments.completed ?? 0) +
      (data?.variations.appointments.noShows ?? 0) >
      0;

  function applyFilters() {
    setPage(1);
    setApplied({
      date,
      locationId,
      employeeId,
      paymentMethod,
      registerSessionId,
    });
  }

  function exportCsv() {
    if (!data || !s) {
      toast.error("Load the report first");
      return;
    }
    const rows: Array<Array<string | number>> = [
      ["section", "metric", "value"],
      ["meta", "date", data.date],
      ["meta", "timezone", data.timezone],
      ["meta", "business_type", data.businessType],
      ["summary", "gross_sales", s.grossSales],
      ["summary", "discounts", s.discounts],
      ["summary", "tax", s.tax],
      ["summary", "net_sales", s.netSales],
      ["summary", "refunds", s.refunds],
      ["summary", "net_revenue", s.netRevenue],
      ["summary", "orders", s.orderCount],
      ["summary", "aov", s.avgOrderValue],
      [
        "comparison",
        "vs_previous_day_pct",
        data.comparison.previousDay.changePct ?? "",
      ],
      [
        "comparison",
        "vs_same_weekday_pct",
        data.comparison.sameDayLastWeek.changePct ?? "",
      ],
    ];
    for (const h of data.hourly) {
      if (h.orders || h.sales)
        rows.push(["hourly", h.label, `${h.orders}|${h.sales}`]);
    }
    for (const p of data.byPaymentMethod) {
      rows.push(["payment", p.method, `${p.count}|${p.amount}|${p.pct}%`]);
    }
    for (const c of data.byCategory) {
      rows.push(["category", c.name, `${c.qty}|${c.revenue}`]);
    }
    for (const t of data.topProducts) {
      rows.push(["top_item", `${t.sku}|${t.name}`, `${t.qty}|${t.revenue}`]);
    }
    for (const tx of data.transactions.items) {
      rows.push([
        "transaction",
        tx.orderNumber,
        `${tx.cashierName}|${tx.net}|${tx.status}|${tx.paymentMethods.join("+")}`,
      ]);
    }
    downloadCsv(
      `daily-sales_${data.date}.csv`,
      rows[0] as string[],
      rows.slice(1),
    );
    toast.success("CSV downloaded (opens in Excel)");
  }

  function printPdf() {
    window.print();
  }

  function printThermalEod() {
    if (!data || !s) {
      toast.error("Load the report first");
      return;
    }
    const w = window.open("", "_blank", "noopener,noreferrer,width=320,height=720");
    if (!w) return;
    const lines = [
      "UNIVERSAL POS",
      "END OF DAY REPORT",
      "------------------------------",
      `Date: ${data.date}`,
      `TZ: ${data.timezone}`,
      `Type: ${data.businessType}`,
      "------------------------------",
      `Gross:     ${money(s.grossSales)}`,
      `Discount:  ${money(s.discounts)}`,
      `Tax:       ${money(s.tax)}`,
      `Net sales: ${money(s.netSales)}`,
      `Refunds:   ${money(s.refunds)}`,
      `Net rev:   ${money(s.netRevenue)}`,
      `Orders:    ${s.orderCount}`,
      `AOV:       ${money(s.avgOrderValue)}`,
      "------------------------------",
      "Payments",
      ...data.byPaymentMethod.map(
        (p) => `${p.method.padEnd(12)} ${money(p.amount)} (${p.pct}%)`,
      ),
      "------------------------------",
      "Top items",
      ...data.topProducts.map(
        (t) => `${t.name.slice(0, 18).padEnd(18)} x${t.qty}`,
      ),
      "------------------------------",
      `vs yday ${pctLabel(data.comparison.previousDay.changePct)}`,
      `vs week ${pctLabel(data.comparison.sameDayLastWeek.changePct)}`,
      "------------------------------",
      new Date().toLocaleString(),
    ];
    w.document.write(
      buildThermalEodHtml({ date: data.date, bodyText: lines.join("\n") }),
    );
    w.document.close();
  }

  function toggleSort(col: string) {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("desc");
    }
    setPage(1);
  }

  const card = "rounded-lg border border-[#e2e8f0] bg-white px-4 py-3";

  return (
    <div className="mx-auto max-w-6xl space-y-5 print:max-w-none">
      <PageHeader
        title="Daily Sales Report"
        subtitle="Single-day sales snapshot — comparable across retail, restaurant, and service."
        action={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button asChild variant="secondary" size="sm" className="h-9">
              <Link href="/reports">All reports</Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-9"
              disabled={!data}
              onClick={exportCsv}
            >
              CSV / Excel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-9"
              disabled={!data}
              onClick={printPdf}
            >
              PDF / Print
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-9"
              disabled={!data}
              onClick={printThermalEod}
            >
              Print EOD (80mm)
            </Button>
          </div>
        }
      />

      <div
        className={cn(
          "grid gap-3 rounded-lg border border-[#e2e8f0] bg-white p-4 sm:grid-cols-2 lg:grid-cols-6 print:hidden",
        )}
      >
        <div>
          <Label className="text-xs">Date</Label>
          <Input
            className="mt-1 h-9"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Branch / store</Label>
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
          <Label className="text-xs">Employee / cashier</Label>
          <Select
            className="mt-1 h-9"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">All staff</option>
            {(users.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label className="text-xs">Payment method</Label>
          <Select
            className="mt-1 h-9"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          >
            {PAY_METHODS.map((m) => (
              <option key={m.value || "all"} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label className="text-xs">Register / shift</Label>
          <Select
            className="mt-1 h-9"
            value={registerSessionId}
            onChange={(e) => setRegisterSessionId(e.target.value)}
          >
            <option value="">All registers</option>
            {(data?.registerSessions ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-end">
          <Button type="button" className="h-9 w-full" onClick={applyFilters}>
            Apply
          </Button>
        </div>
      </div>

      {report.isLoading ? (
        <p className="text-sm text-[#6b7280]">Loading daily sales…</p>
      ) : report.isError ? (
        <p className="text-sm text-rose-600">
          Failed to load daily sales report
          {report.error instanceof Error && report.error.message
            ? `: ${report.error.message}`
            : ". Restart the API if you just pulled new report code."}
        </p>
      ) : data && s ? (
        <>
          <p className="text-xs text-[#6b7280] print:text-[10px]">
            {data.date} · {data.timezone} · {data.currencyCode} ·{" "}
            {data.businessType}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["Gross sales", money(s.grossSales)],
                ["Discounts", money(s.discounts)],
                ["Tax collected", money(s.tax)],
                ["Net sales", money(s.netSales)],
                ["Refunds / returns", money(s.refunds)],
                ["Net revenue", money(s.netRevenue)],
                ["Transactions", String(s.orderCount)],
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

          <div className="grid gap-3 sm:grid-cols-2">
            <div className={card}>
              <p className="text-[0.65rem] font-semibold tracking-wide text-[#9ca3af] uppercase">
                vs previous day ({data.comparison.previousDay.date})
              </p>
              <p
                className={cn(
                  "mt-1 text-lg font-semibold tabular-nums",
                  pctTone(data.comparison.previousDay.changePct),
                )}
              >
                {pctLabel(data.comparison.previousDay.changePct)}
              </p>
              <p className="text-xs text-[#6b7280]">
                Was {money(data.comparison.previousDay.netRevenue)} ·{" "}
                {data.comparison.previousDay.orderCount} orders
              </p>
            </div>
            <div className={card}>
              <p className="text-[0.65rem] font-semibold tracking-wide text-[#9ca3af] uppercase">
                vs same day last week ({data.comparison.sameDayLastWeek.date})
              </p>
              <p
                className={cn(
                  "mt-1 text-lg font-semibold tabular-nums",
                  pctTone(data.comparison.sameDayLastWeek.changePct),
                )}
              >
                {pctLabel(data.comparison.sameDayLastWeek.changePct)}
              </p>
              <p className="text-xs text-[#6b7280]">
                Was {money(data.comparison.sameDayLastWeek.netRevenue)} ·{" "}
                {data.comparison.sameDayLastWeek.orderCount} orders
              </p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className={cn(card, "min-h-[220px]")}>
              <p className="mb-3 text-sm font-semibold text-[#111827]">
                Sales by hour
              </p>
              <div className="flex h-40 items-end gap-0.5">
                {data.hourly.map((h) => {
                  const barPct = Math.max(
                    h.sales > 0 ? 4 : 0,
                    (h.sales / maxHourly) * 100,
                  );
                  return (
                    <div
                      key={h.hour}
                      className="group relative flex min-w-0 flex-1 flex-col items-center justify-end"
                      title={h.label + ": " + money(h.sales) + " / " + h.orders + " orders"}
                    >
                      <div
                        className="w-full rounded-t bg-[#1a56db]"
                        style={{ height: barPct + "%" }}
                      ></div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 flex justify-between text-xs text-[#9ca3af]">
                <span>00:00</span>
                <span>12:00</span>
                <span>23:00</span>
              </div>
            </div>

            <div className={cn(card, "min-h-[220px]")}>
              <p className="mb-3 text-sm font-semibold text-[#111827]">
                Payment method mix
              </p>
              {data.byPaymentMethod.length === 0 ? (
                <p className="text-sm text-[#6b7280]">No payments</p>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <PaymentPie slices={data.byPaymentMethod} />
                  <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
                    {data.byPaymentMethod.map((p, i) => (
                      <li
                        key={p.method}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                          />
                          <span className="capitalize">
                            {p.method.replace(/_/g, " ")}
                          </span>
                        </span>
                        <span className="tabular-nums text-[#374151]">
                          {money(p.amount)} · {p.pct}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className={card}>
              <p className="mb-2 text-sm font-semibold">By category</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[0.7rem] text-[#6b7280] uppercase">
                    <tr>
                      <th className="py-1 font-medium">Category</th>
                      <th className="py-1 font-medium">Qty</th>
                      <th className="py-1 font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.byCategory.length ? data.byCategory : []).map((c) => (
                      <tr key={c.categoryId ?? c.name} className="border-t border-[#eef2f7]">
                        <td className="py-1.5">{c.name}</td>
                        <td className="py-1.5 tabular-nums">{c.qty}</td>
                        <td className="py-1.5 tabular-nums">{money(c.revenue)}</td>
                      </tr>
                    ))}
                    {!data.byCategory.length ? (
                      <tr>
                        <td colSpan={3} className="py-3 text-[#6b7280]">
                          No category sales
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
            <div className={card}>
              <p className="mb-2 text-sm font-semibold">Top 5 items</p>
              <ol className="space-y-2 text-sm">
                {data.topProducts.map((t, i) => (
                  <li
                    key={t.productId ?? t.sku + t.name}
                    className="flex items-start justify-between gap-2 border-t border-[#eef2f7] pt-2 first:border-0 first:pt-0"
                  >
                    <span>
                      <span className="mr-2 text-[#9ca3af]">{i + 1}.</span>
                      {t.name}
                      <span className="mt-0.5 block text-[0.7rem] text-[#9ca3af]">
                        {t.sku}
                      </span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      ×{t.qty}
                      <span className="block text-[0.7rem] text-[#6b7280]">
                        {money(t.revenue)}
                      </span>
                    </span>
                  </li>
                ))}
                {!data.topProducts.length ? (
                  <li className="text-[#6b7280]">No items sold</li>
                ) : null}
              </ol>
            </div>
          </div>

          {data.registerReconciliation.length ? (
            <div className={card}>
              <p className="mb-2 text-sm font-semibold">
                Cash register reconciliation
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[0.7rem] text-[#6b7280] uppercase">
                    <tr>
                      <th className="py-1 font-medium">Register</th>
                      <th className="py-1 font-medium">Opening</th>
                      <th className="py-1 font-medium">Expected</th>
                      <th className="py-1 font-medium">Counted</th>
                      <th className="py-1 font-medium">Variance</th>
                      <th className="py-1 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.registerReconciliation.map((r) => (
                      <tr key={r.id} className="border-t border-[#eef2f7]">
                        <td className="py-1.5">
                          {r.locationName}
                          <span className="block text-[0.7rem] text-[#9ca3af]">
                            {r.openedBy}
                          </span>
                        </td>
                        <td className="py-1.5 tabular-nums">
                          {money(r.openingFloat)}
                        </td>
                        <td className="py-1.5 tabular-nums">
                          {money(r.expectedCash)}
                        </td>
                        <td className="py-1.5 tabular-nums">
                          {r.closingCash != null ? money(r.closingCash) : "—"}
                        </td>
                        <td
                          className={cn(
                            "py-1.5 tabular-nums",
                            r.variance != null && r.variance !== 0
                              ? r.variance > 0
                                ? "text-emerald-700"
                                : "text-rose-600"
                              : "",
                          )}
                        >
                          {r.variance != null ? money(r.variance) : "—"}
                        </td>
                        <td className="py-1.5 capitalize">{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {(showRestaurant || showRetailOmni || showService) && (
            <div className="grid gap-3 sm:grid-cols-3">
              {showRestaurant ? (
                <div className={card}>
                  <p className="text-sm font-semibold">Restaurant</p>
                  <p className="mt-2 text-xs text-[#6b7280]">Table turnover</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {data.variations.tableTurnover ?? "—"}
                  </p>
                  <p className="mt-2 text-xs text-[#6b7280]">Avg dining time</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {data.variations.avgDiningMinutes != null
                      ? `${data.variations.avgDiningMinutes} min`
                      : "—"}
                  </p>
                  {data.variations.fulfillmentSplit.length ? (
                    <ul className="mt-3 space-y-1 text-sm">
                      {data.variations.fulfillmentSplit.map((f) => (
                        <li key={f.key} className="flex justify-between capitalize">
                          <span>{f.key.replace(/_/g, " ")}</span>
                          <span className="tabular-nums">
                            {f.count} · {money(f.sales)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-[#9ca3af]">
                      Set order meta fulfillment / tableNumber for dine-in split
                    </p>
                  )}
                </div>
              ) : null}
              {showRetailOmni ? (
                <div className={card}>
                  <p className="text-sm font-semibold">Channel split</p>
                  <ul className="mt-3 space-y-1 text-sm">
                    {data.variations.channelSplit.map((c) => (
                      <li key={c.key} className="flex justify-between capitalize">
                        <span>{c.key.replace(/_/g, " ")}</span>
                        <span className="tabular-nums">
                          {c.count} · {money(c.sales)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {showService ? (
                <div className={card}>
                  <p className="text-sm font-semibold">Appointments</p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-[#6b7280]">Completed</dt>
                      <dd className="font-semibold tabular-nums">
                        {data.variations.appointments.completed}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#6b7280]">No-shows</dt>
                      <dd className="font-semibold tabular-nums">
                        {data.variations.appointments.noShows}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#6b7280]">Scheduled</dt>
                      <dd className="font-semibold tabular-nums">
                        {data.variations.appointments.scheduled}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#6b7280]">Cancelled</dt>
                      <dd className="font-semibold tabular-nums">
                        {data.variations.appointments.cancelled}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : null}
            </div>
          )}

          <div className={card}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">
                Transactions ({data.transactions.total})
              </p>
              <div className="flex gap-2 print:hidden">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={page * 25 >= data.transactions.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-[0.7rem] text-[#6b7280] uppercase">
                  <tr>
                    {(
                      [
                        ["orderNumber", "Order"],
                        ["createdAt", "Time"],
                        ["status", "Status"],
                        ["net", "Net"],
                      ] as const
                    ).map(([col, label]) => (
                      <th key={col} className="py-1 font-medium">
                        <button
                          type="button"
                          className="hover:text-[#1a56db] print:pointer-events-none"
                          onClick={() => toggleSort(col)}
                        >
                          {label}
                          {sortBy === col ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </button>
                      </th>
                    ))}
                    <th className="py-1 font-medium">Customer</th>
                    <th className="py-1 font-medium">Cashier</th>
                    <th className="py-1 font-medium">Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.items.map((tx) => (
                    <tr key={tx.id} className="border-t border-[#eef2f7]">
                      <td className="py-1.5">
                        <Link
                          href={`/orders/view?id=${tx.id}`}
                          className="text-[#1a56db] hover:underline"
                        >
                          {tx.orderNumber}
                        </Link>
                      </td>
                      <td className="py-1.5 tabular-nums text-[#6b7280]">
                        {new Date(tx.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-1.5 capitalize">{tx.status}</td>
                      <td className="py-1.5 tabular-nums">{money(tx.net)}</td>
                      <td className="py-1.5">{tx.customerName}</td>
                      <td className="py-1.5">{tx.cashierName}</td>
                      <td className="py-1.5 capitalize">
                        {tx.paymentMethods.map((m) => m.replace(/_/g, " ")).join(", ") ||
                          "—"}
                      </td>
                    </tr>
                  ))}
                  {!data.transactions.items.length ? (
                    <tr>
                      <td colSpan={7} className="py-4 text-[#6b7280]">
                        No transactions for this day / filters
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

const PIE_COLORS = [
  "#1a56db",
  "#0e9f6e",
  "#f59e0b",
  "#e02424",
  "#7c3aed",
  "#0891b2",
  "#64748b",
  "#db2777",
];

function PaymentPie({
  slices,
}: {
  slices: Array<{ method: string; amount: number; pct: number }>;
}) {
  const total = slices.reduce((s, x) => s + x.amount, 0) || 1;
  let angle = -90;
  const paths: Array<{ d: string; color: string }> = [];
  const r = 56;
  const cx = 64;
  const cy = 64;
  slices.forEach((slice, i) => {
    const sweep = (slice.amount / total) * 360;
    const a0 = (angle * Math.PI) / 180;
    const a1 = ((angle + sweep) * Math.PI) / 180;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const large = sweep > 180 ? 1 : 0;
    paths.push({
      d: `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`,
      color: PIE_COLORS[i % PIE_COLORS.length],
    });
    angle += sweep;
  });
  return (
    <svg width="128" height="128" viewBox="0 0 128 128" className="shrink-0">
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.color} />
      ))}
    </svg>
  );
}
