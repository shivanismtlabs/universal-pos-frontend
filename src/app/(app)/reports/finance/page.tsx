"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { reportsApi, tenantsApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { cn, todayYmd } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { downloadReportExcel } from "@/lib/report-excel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

type Tab = "tax" | "suppliers" | "cashflow" | "expenses";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "tax", label: "Tax" },
  { id: "suppliers", label: "Suppliers" },
  { id: "cashflow", label: "Cash flow" },
  { id: "expenses", label: "Expenses" },
];

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
}

function severityClass(s: string) {
  if (s === "critical") return "bg-rose-700 text-white";
  if (s === "high") return "bg-rose-100 text-rose-900";
  if (s === "medium") return "bg-amber-100 text-amber-900";
  return "bg-[#f3f4f6] text-[#4b5563]";
}

export default function FinanceReportsPage() {
  const { money } = useBootstrap();
  const [tab, setTab] = useState<Tab>("tax");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(todayYmd);
  const [locationId, setLocationId] = useState("");
  const [applied, setApplied] = useState({
    from: defaultFrom(),
    to: todayYmd(),
    locationId: "",
  });

  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });

  const params = useMemo(
    () => ({
      from: applied.from,
      to: applied.to,
      locationId: applied.locationId || undefined,
    }),
    [applied],
  );

  const tax = useQuery({
    queryKey: ["reports", "tax", params],
    queryFn: () => reportsApi.taxReport(params),
    enabled: tab === "tax",
  });
  const suppliers = useQuery({
    queryKey: ["reports", "suppliers", params],
    queryFn: () => reportsApi.supplierReport(params),
    enabled: tab === "suppliers",
  });
  const cash = useQuery({
    queryKey: ["reports", "cash-flow", params],
    queryFn: () => reportsApi.cashFlowReport(params),
    enabled: tab === "cashflow",
  });
  const expenses = useQuery({
    queryKey: ["reports", "expenses", params],
    queryFn: () => reportsApi.expenseReport(params),
    enabled: tab === "expenses",
  });

  const cashMax = useMemo(
    () =>
      Math.max(
        1,
        ...(cash.data?.series.flatMap((s) => [s.inflow, s.outflow]) ?? [1]),
      ),
    [cash.data],
  );
  const expCatMax = useMemo(
    () => Math.max(1, ...(expenses.data?.byCategory.map((c) => c.amount) ?? [1])),
    [expenses.data],
  );
  const taxMax = useMemo(
    () => Math.max(1, ...(tax.data?.breakdown.map((b) => Math.abs(b.amount)) ?? [1])),
    [tax.data],
  );

  function applyFilters() {
    setApplied({ from, to, locationId });
  }

  async function exportExcel() {
    try {
      if (tab === "tax" && tax.data) {
        const d = tax.data;
        await downloadReportExcel({
          filename: `tax_report_${d.period.from}_${d.period.to}`,
          title: "Tax Report",
          tenantName: d.tenantName,
          subtitle: `${d.period.from} → ${d.period.to} · ${d.currencyCode}`,
          sheets: [
            {
              name: "Summary",
              columns: [
                { header: "Metric", width: 28 },
                { header: "Amount", width: 16 },
              ],
              rows: [
                ["Taxable sales", d.summary.taxableSales],
                ["Output tax", d.summary.outputTax],
                ["CGST", d.summary.cgst],
                ["SGST", d.summary.sgst],
                ["IGST", d.summary.igst],
                ["Input tax (purchases)", d.summary.inputTax],
                ["Net tax payable", d.summary.netTaxPayable],
              ],
            },
            {
              name: "Invoices",
              columns: [
                { header: "Invoice", width: 16 },
                { header: "Order", width: 14 },
                { header: "Date", width: 12 },
                { header: "Branch", width: 16 },
                { header: "Taxable", width: 12 },
                { header: "CGST", width: 10 },
                { header: "SGST", width: 10 },
                { header: "IGST", width: 10 },
                { header: "Total", width: 12 },
              ],
              rows: d.invoices.map((r) => [
                r.invoiceNumber,
                r.orderNumber,
                r.date,
                r.branch,
                r.taxable,
                r.cgst,
                r.sgst,
                r.igst,
                r.grandTotal,
              ]),
            },
          ],
        });
        toast.success("Tax report Excel downloaded");
        return;
      }
      if (tab === "suppliers" && suppliers.data) {
        const d = suppliers.data;
        await downloadReportExcel({
          filename: `supplier_report_${d.period.from}_${d.period.to}`,
          title: "Supplier / AP Report",
          tenantName: d.tenantName,
          subtitle: `${d.period.from} → ${d.period.to}`,
          sheets: [
            {
              name: "Suppliers",
              columns: [
                { header: "Supplier", width: 24 },
                { header: "Invoices", width: 10 },
                { header: "Billed", width: 14 },
                { header: "Paid", width: 14 },
                { header: "Outstanding", width: 14 },
                { header: "Tax", width: 12 },
                { header: "POs", width: 8 },
                { header: "0-30", width: 12 },
                { header: "30-60", width: 12 },
                { header: "60-90", width: 12 },
                { header: "90+", width: 12 },
              ],
              rows: d.suppliers.map((r) => [
                r.supplierName,
                r.invoiceCount,
                r.billed,
                r.paid,
                r.outstanding,
                r.tax,
                r.poCount,
                r.aging.d0_30,
                r.aging.d30_60,
                r.aging.d60_90,
                r.aging.d90,
              ]),
            },
          ],
        });
        toast.success("Supplier report Excel downloaded");
        return;
      }
      if (tab === "cashflow" && cash.data) {
        const d = cash.data;
        await downloadReportExcel({
          filename: `cash_flow_${d.period.from}_${d.period.to}`,
          title: "Cash Flow",
          tenantName: d.tenantName,
          subtitle: `${d.period.from} → ${d.period.to}`,
          sheets: [
            {
              name: "Operating",
              columns: [
                { header: "Line", width: 28 },
                { header: "Amount", width: 14 },
              ],
              rows: d.operating.map((r) => [r.label, r.amount]),
            },
            {
              name: "Daily",
              columns: [
                { header: "Date", width: 12 },
                { header: "Inflow", width: 14 },
                { header: "Outflow", width: 14 },
                { header: "Net", width: 14 },
              ],
              rows: d.series.map((r) => [r.date, r.inflow, r.outflow, r.net]),
            },
          ],
        });
        toast.success("Cash flow Excel downloaded");
        return;
      }
      if (tab === "expenses" && expenses.data) {
        const d = expenses.data;
        await downloadReportExcel({
          filename: `expenses_${d.period.from}_${d.period.to}`,
          title: "Expense Report",
          tenantName: d.tenantName,
          subtitle: `${d.period.from} → ${d.period.to}`,
          sheets: [
            {
              name: "By category",
              columns: [
                { header: "Category", width: 22 },
                { header: "Amount", width: 14 },
                { header: "Count", width: 10 },
                { header: "%", width: 10 },
              ],
              rows: d.byCategory.map((r) => [r.name, r.amount, r.count, r.pct]),
            },
            {
              name: "Lines",
              columns: [
                { header: "Date", width: 12 },
                { header: "Category", width: 18 },
                { header: "Amount", width: 12 },
                { header: "Branch", width: 16 },
                { header: "Method", width: 12 },
                { header: "Petty", width: 8 },
                { header: "Notes", width: 28 },
              ],
              rows: d.items.map((r) => [
                r.date,
                r.category,
                r.amount,
                r.branch,
                r.paymentMethod,
                r.isPettyCash ? "Y" : "",
                r.notes,
              ]),
            },
          ],
        });
        toast.success("Expense report Excel downloaded");
        return;
      }
      toast.error("Load the report first");
    } catch {
      toast.error("Excel export failed");
    }
  }

  function exportCsv() {
    if (tab === "tax" && tax.data) {
      downloadCsv(
        `tax_${tax.data.period.from}_${tax.data.period.to}.csv`,
        [
          "invoice",
          "order",
          "date",
          "branch",
          "taxable",
          "cgst",
          "sgst",
          "igst",
          "grand_total",
        ],
        tax.data.invoices.map((r) => [
          r.invoiceNumber,
          r.orderNumber ?? "",
          r.date,
          r.branch ?? "",
          r.taxable,
          r.cgst,
          r.sgst,
          r.igst,
          r.grandTotal,
        ]),
      );
      toast.success("CSV downloaded");
      return;
    }
    if (tab === "suppliers" && suppliers.data) {
      downloadCsv(
        `suppliers_${suppliers.data.period.from}_${suppliers.data.period.to}.csv`,
        [
          "supplier",
          "invoices",
          "billed",
          "paid",
          "outstanding",
          "tax",
          "po_count",
        ],
        suppliers.data.suppliers.map((r) => [
          r.supplierName,
          r.invoiceCount,
          r.billed,
          r.paid,
          r.outstanding,
          r.tax,
          r.poCount,
        ]),
      );
      toast.success("CSV downloaded");
      return;
    }
    if (tab === "cashflow" && cash.data) {
      downloadCsv(
        `cash_flow_${cash.data.period.from}_${cash.data.period.to}.csv`,
        ["date", "inflow", "outflow", "net"],
        cash.data.series.map((r) => [r.date, r.inflow, r.outflow, r.net]),
      );
      toast.success("CSV downloaded");
      return;
    }
    if (tab === "expenses" && expenses.data) {
      downloadCsv(
        `expenses_${expenses.data.period.from}_${expenses.data.period.to}.csv`,
        [
          "date",
          "category",
          "amount",
          "branch",
          "method",
          "petty_cash",
          "notes",
        ],
        expenses.data.items.map((r) => [
          r.date,
          r.category,
          r.amount,
          r.branch ?? "",
          r.paymentMethod,
          r.isPettyCash ? "Y" : "",
          r.notes ?? "",
        ]),
      );
      toast.success("CSV downloaded");
      return;
    }
    toast.error("Load the report first");
  }

  const loading =
    (tab === "tax" && tax.isLoading) ||
    (tab === "suppliers" && suppliers.isLoading) ||
    (tab === "cashflow" && cash.isLoading) ||
    (tab === "expenses" && expenses.isLoading);

  return (
    <div className="document-print-root mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Finance Reports"
        subtitle="Tax, supplier AP, cash flow, and expenses — with Excel, CSV, and print/PDF."
        action={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button asChild size="sm" variant="secondary">
              <Link href="/reports">All reports</Link>
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={exportCsv}>
              CSV
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={exportExcel}>
              Excel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => window.print()}
            >
              PDF / Print
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 rounded-lg border border-[#e2e8f0] bg-white p-4 sm:grid-cols-2 lg:grid-cols-5 print:hidden">
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
          <Label className="text-xs">Location</Label>
          <Select
            className="mt-1 h-9"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            <option value="">All</option>
            {(locations.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
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

      <div className="flex flex-wrap gap-1 border-b border-[#e2e8f0] print:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-t-md px-3 py-2 text-sm font-medium",
              tab === t.id
                ? "border border-b-white border-[#e2e8f0] bg-white text-[#1a56db]"
                : "text-[#6b7280] hover:text-[#111827]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[#6b7280]">Loading report…</p>
      ) : null}

      {tab === "tax" && tax.data ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Taxable sales", tax.data.summary.taxableSales],
              ["Output tax", tax.data.summary.outputTax],
              ["Input tax", tax.data.summary.inputTax],
              ["Net payable", tax.data.summary.netTaxPayable],
            ].map(([label, val]) => (
              <div
                key={String(label)}
                className="rounded-lg border border-[#e2e8f0] bg-white p-4"
              >
                <p className="text-xs text-[#6b7280]">{label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-[#111827]">
                  {money(Number(val))}
                </p>
              </div>
            ))}
          </div>

          <section className="rounded-lg border border-[#e2e8f0] bg-white p-4">
            <h3 className="text-sm font-semibold text-[#111827]">Tax breakdown</h3>
            <div className="mt-4 flex h-36 items-end gap-2">
              {tax.data.breakdown.map((b) => (
                <div
                  key={b.key}
                  className="flex flex-1 flex-col items-center justify-end gap-1"
                  title={`${b.label}: ${money(b.amount)}`}
                >
                  <div
                    className="w-full max-w-[2.5rem] rounded-t-md bg-[#1a56db]"
                    style={{
                      height: `${Math.max(4, (Math.abs(b.amount) / taxMax) * 120)}px`,
                    }}
                  />
                  <span className="max-w-full truncate text-[0.65rem] text-[#6b7280]">
                    {b.label}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-[#6b7280]">
              CGST {money(tax.data.summary.cgst)} · SGST {money(tax.data.summary.sgst)} ·
              IGST {money(tax.data.summary.igst)}
            </p>
          </section>

          <section className="overflow-x-auto rounded-lg border border-[#e2e8f0] bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f8fafc] text-xs uppercase text-[#6b7280]">
                <tr>
                  <th className="px-3 py-2">Invoice</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Branch</th>
                  <th className="px-3 py-2 text-right">Taxable</th>
                  <th className="px-3 py-2 text-right">CGST</th>
                  <th className="px-3 py-2 text-right">SGST</th>
                  <th className="px-3 py-2 text-right">IGST</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {tax.data.invoices.map((r) => (
                  <tr key={r.invoiceNumber} className="border-t border-[#eef1f4]">
                    <td className="px-3 py-2 font-medium">{r.invoiceNumber}</td>
                    <td className="px-3 py-2">{r.date}</td>
                    <td className="px-3 py-2">{r.branch ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {money(r.taxable)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.cgst)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.sgst)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.igst)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {money(r.grandTotal)}
                    </td>
                  </tr>
                ))}
                {!tax.data.invoices.length ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-[#6b7280]">
                      No invoices in this period
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </div>
      ) : null}

      {tab === "suppliers" && suppliers.data ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Billed", suppliers.data.summary.totalBilled],
              ["Paid (invoices)", suppliers.data.summary.totalPaid],
              ["Outstanding", suppliers.data.summary.totalOutstanding],
              ["Payments in period", suppliers.data.summary.paymentsInPeriod],
            ].map(([label, val]) => (
              <div
                key={String(label)}
                className="rounded-lg border border-[#e2e8f0] bg-white p-4"
              >
                <p className="text-xs text-[#6b7280]">{label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {money(Number(val))}
                </p>
              </div>
            ))}
          </div>

          <section className="rounded-lg border border-[#e2e8f0] bg-white p-4">
            <h3 className="text-sm font-semibold">AP aging</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              {suppliers.data.agingBuckets.map((b) => (
                <div
                  key={b.key}
                  className="rounded-md border border-[#eef1f4] p-3"
                >
                  <span
                    className={cn(
                      "inline-block rounded px-1.5 py-0.5 text-[0.65rem] font-semibold",
                      severityClass(b.severity),
                    )}
                  >
                    {b.label}
                  </span>
                  <p className="mt-2 text-base font-semibold tabular-nums">
                    {money(b.amount)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="overflow-x-auto rounded-lg border border-[#e2e8f0] bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f8fafc] text-xs uppercase text-[#6b7280]">
                <tr>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2 text-right">Invoices</th>
                  <th className="px-3 py-2 text-right">Billed</th>
                  <th className="px-3 py-2 text-right">Paid</th>
                  <th className="px-3 py-2 text-right">Outstanding</th>
                  <th className="px-3 py-2 text-right">POs</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.data.suppliers.map((r) => (
                  <tr key={r.supplierId} className="border-t border-[#eef1f4]">
                    <td className="px-3 py-2 font-medium">{r.supplierName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.invoiceCount}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {money(r.billed)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {money(r.paid)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {money(r.outstanding)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.poCount}</td>
                  </tr>
                ))}
                {!suppliers.data.suppliers.length ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-[#6b7280]">
                      No supplier activity in this period
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </div>
      ) : null}

      {tab === "cashflow" && cash.data ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Cash in", cash.data.summary.cashIn],
              ["Cash out", cash.data.summary.cashOut],
              ["Net cash", cash.data.summary.netCash],
              ["Petty cash", cash.data.summary.pettyCash],
            ].map(([label, val]) => (
              <div
                key={String(label)}
                className="rounded-lg border border-[#e2e8f0] bg-white p-4"
              >
                <p className="text-xs text-[#6b7280]">{label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {money(Number(val))}
                </p>
              </div>
            ))}
          </div>

          <section className="rounded-lg border border-[#e2e8f0] bg-white p-4">
            <h3 className="text-sm font-semibold">Daily cash flow</h3>
            <div className="mt-4 flex h-40 items-end gap-1 overflow-x-auto">
              {cash.data.series.map((s) => (
                <div
                  key={s.date}
                  className="flex min-w-[1.25rem] flex-1 flex-col items-center justify-end gap-0.5"
                  title={`${s.date}: in ${money(s.inflow)} / out ${money(s.outflow)}`}
                >
                  <div
                    className="w-full rounded-t-sm bg-[#0e9f6e]"
                    style={{
                      height: `${Math.max(2, (s.inflow / cashMax) * 70)}px`,
                    }}
                  />
                  <div
                    className="w-full rounded-b-sm bg-[#e02424]"
                    style={{
                      height: `${Math.max(2, (s.outflow / cashMax) * 70)}px`,
                    }}
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-[#6b7280]">
              Green = inflow · Red = outflow · {cash.data.series.length} days
            </p>
          </section>

          <section className="rounded-lg border border-[#e2e8f0] bg-white p-4">
            <h3 className="text-sm font-semibold">Operating cash</h3>
            <ul className="mt-3 divide-y divide-[#eef1f4]">
              {cash.data.operating.map((r) => (
                <li
                  key={r.key}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className={r.key === "net" ? "font-semibold" : ""}>
                    {r.label}
                  </span>
                  <span
                    className={cn(
                      "tabular-nums font-medium",
                      r.amount < 0 ? "text-rose-700" : "text-[#111827]",
                    )}
                  >
                    {money(r.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}

      {tab === "expenses" && expenses.data ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-[#e2e8f0] bg-white p-4">
              <p className="text-xs text-[#6b7280]">Total expenses</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {money(expenses.data.summary.total)}
              </p>
            </div>
            <div className="rounded-lg border border-[#e2e8f0] bg-white p-4">
              <p className="text-xs text-[#6b7280]">Entries</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {expenses.data.summary.expenseCount}
              </p>
            </div>
            <div className="rounded-lg border border-[#e2e8f0] bg-white p-4">
              <p className="text-xs text-[#6b7280]">Categories</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {expenses.data.summary.categoryCount}
              </p>
            </div>
            <div className="rounded-lg border border-[#e2e8f0] bg-white p-4">
              <p className="text-xs text-[#6b7280]">Petty cash</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {money(expenses.data.summary.pettyCash)}
              </p>
            </div>
          </div>

          <section className="rounded-lg border border-[#e2e8f0] bg-white p-4">
            <h3 className="text-sm font-semibold">By category</h3>
            <div className="mt-4 space-y-2">
              {expenses.data.byCategory.map((c) => (
                <div key={c.categoryId ?? c.name}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{c.name}</span>
                    <span className="tabular-nums">
                      {money(c.amount)} · {c.pct}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-[#eef1f4]">
                    <div
                      className="h-full rounded bg-[#1a56db]"
                      style={{ width: `${(c.amount / expCatMax) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              {!expenses.data.byCategory.length ? (
                <p className="text-sm text-[#6b7280]">No expenses in this period</p>
              ) : null}
            </div>
          </section>

          <section className="overflow-x-auto rounded-lg border border-[#e2e8f0] bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f8fafc] text-xs uppercase text-[#6b7280]">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Branch</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenses.data.items.map((r) => (
                  <tr key={r.id} className="border-t border-[#eef1f4]">
                    <td className="px-3 py-2">{r.date}</td>
                    <td className="px-3 py-2">
                      {r.category}
                      {r.isPettyCash ? (
                        <span className="ml-1 text-[0.65rem] text-amber-700">
                          petty
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{r.branch ?? "—"}</td>
                    <td className="px-3 py-2 capitalize">{r.paymentMethod}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {money(r.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      ) : null}
    </div>
  );
}
