"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { reportsApi, tenantsApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { formatDate, todayYmd } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

export default function ReportsPage() {
  const { money } = useBootstrap();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(todayYmd());
  const [locationId, setLocationId] = useState("");
  const [range, setRange] = useState({ from, to, locationId: "" });

  const locArg = range.locationId || undefined;

  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });

  const sales = useQuery({
    queryKey: ["reports", "sales", range],
    queryFn: () => reportsApi.salesSummary(range.from, range.to, locArg),
  });
  const payments = useQuery({
    queryKey: ["reports", "payments", range],
    queryFn: () => reportsApi.paymentsSummary(range.from, range.to, locArg),
  });
  const util = useQuery({
    queryKey: ["reports", "util", range.locationId],
    queryFn: () => reportsApi.inventoryUtilization(locArg),
  });
  const balances = useQuery({
    queryKey: ["reports", "balances", range.locationId],
    queryFn: () => reportsApi.balances(locArg),
  });
  const velocity = useQuery({
    queryKey: ["reports", "velocity", range],
    queryFn: () => reportsApi.productVelocity(range.from, range.to, locArg),
  });
  const staff = useQuery({
    queryKey: ["reports", "staff", range],
    queryFn: () => reportsApi.staffSales(range.from, range.to, locArg),
  });
  const tax = useQuery({
    queryKey: ["reports", "tax", range],
    queryFn: () => reportsApi.taxSummary(range.from, range.to, locArg),
  });

  const totals = sales.data?.totals;
  const locationLabel = useMemo(() => {
    if (!range.locationId) return "All locations";
    return (
      locations.data?.find((l) => l.id === range.locationId)?.name ??
      "Location"
    );
  }, [locations.data, range.locationId]);

  function exportCsv() {
    if (!sales.data && !payments.data) {
      toast.error("Load a date range first");
      return;
    }
    const stamp = `${range.from}_to_${range.to}`;
    const summaryRows: Array<Array<string | number>> = [
      ["section", "metric", "value"],
      ["filter", "location", locationLabel],
      ["sales", "from", range.from],
      ["sales", "to", range.to],
      ["sales", "order_count", totals?.orderCount ?? 0],
      ["sales", "subtotal", Number(totals?.subtotal ?? 0)],
      ["sales", "tax_total", Number(totals?.taxTotal ?? 0)],
      ["sales", "balance_due", Number(totals?.balanceDue ?? 0)],
      [
        "tax",
        "invoice_cgst",
        Number(tax.data?.invoices?.cgst ?? 0),
      ],
      [
        "tax",
        "invoice_sgst",
        Number(tax.data?.invoices?.sgst ?? 0),
      ],
      [
        "tax",
        "invoice_igst",
        Number(tax.data?.invoices?.igst ?? 0),
      ],
    ];
    for (const r of sales.data?.byStatus ?? []) {
      summaryRows.push(["orders_by_status", r.status, r.count]);
    }
    for (const r of sales.data?.byKind ?? []) {
      summaryRows.push([
        "orders_by_kind",
        r.kind,
        `${r.count}|${Number(r.subtotal ?? 0)}`,
      ]);
    }
    for (const r of payments.data?.byMethod ?? []) {
      summaryRows.push([
        "payments_by_method",
        r.method,
        `${r.count}|${Number(r.amount ?? 0)}`,
      ]);
    }
    for (const r of util.data?.byAvailabilityStatus ?? []) {
      summaryRows.push([
        "inventory_status",
        r.availabilityStatus,
        r.count,
      ]);
    }
    for (const r of velocity.data?.topMovers ?? []) {
      summaryRows.push([
        "top_mover",
        `${r.sku}|${r.name}`,
        `${r.qty}|${r.revenue}`,
      ]);
    }
    for (const r of velocity.data?.slowMovers ?? []) {
      summaryRows.push([
        "slow_mover",
        `${r.sku}|${r.name}`,
        `${r.qty}|${r.revenue}`,
      ]);
    }
    for (const r of staff.data?.staff ?? []) {
      summaryRows.push([
        "staff_sales",
        r.name,
        `${r.orderCount}|${r.subtotal}`,
      ]);
    }
    for (const o of balances.data?.items ?? []) {
      summaryRows.push([
        "outstanding",
        o.orderNumber,
        `${o.customer?.fullName ?? ""}|${Number(o.balanceDue ?? 0)}`,
      ]);
    }
    downloadCsv(
      `universal-pos-report_${stamp}.csv`,
      summaryRows[0] as string[],
      summaryRows.slice(1),
    );
    toast.success("Report CSV downloaded");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Reports"
        subtitle="Sales, product velocity, staff, tax, and balances — filter by store / location."
        action={
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-xs">From</Label>
              <Input
                className="mt-1 h-9 w-36"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input
                className="mt-1 h-9 w-36"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Location</Label>
              <Select
                className="mt-1 h-9 min-w-[8rem]"
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
            <Button
              type="button"
              size="sm"
              className="h-9"
              onClick={() => setRange({ from, to, locationId })}
            >
              Apply
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-9"
              disabled={sales.isLoading || payments.isLoading}
              onClick={exportCsv}
            >
              Export CSV
            </Button>
          </div>
        }
      />

      <p className="text-xs text-[#6b7280]">Showing: {locationLabel}</p>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Orders", totals?.orderCount ?? "—"],
          ["Subtotal", totals?.subtotal != null ? money(totals.subtotal) : "—"],
          [
            "Tax (orders)",
            totals?.taxTotal != null ? money(totals.taxTotal) : "—",
          ],
        ].map(([k, v]) => (
          <div
            key={k as string}
            className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-3"
          >
            <p className="text-[0.65rem] font-semibold tracking-wide text-[#9ca3af] uppercase">
              {k}
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-[#111827]">
              {v}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
          <h2 className="text-sm font-semibold text-[#111827]">
            Orders by status
          </h2>
          <ul className="mt-3 divide-y divide-[#f3f4f6] text-sm">
            {(sales.data?.byStatus ?? []).map((r) => (
              <li key={r.status} className="flex justify-between py-2">
                <span className="capitalize text-[#6b7280]">
                  {r.status.replaceAll("_", " ")}
                </span>
                <span className="font-medium tabular-nums">{r.count}</span>
              </li>
            ))}
            {!sales.data?.byStatus?.length ? (
              <li className="py-4 text-[#6b7280]">No data</li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
          <h2 className="text-sm font-semibold text-[#111827]">
            Payments by method
          </h2>
          <ul className="mt-3 divide-y divide-[#f3f4f6] text-sm">
            {(payments.data?.byMethod ?? []).map((r) => (
              <li key={r.method} className="flex justify-between py-2">
                <span className="uppercase text-[#6b7280]">{r.method}</span>
                <span className="font-medium tabular-nums">
                  {money(r.amount)} · {r.count}
                </span>
              </li>
            ))}
            {!payments.data?.byMethod?.length ? (
              <li className="py-4 text-[#6b7280]">No data</li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
          <h2 className="text-sm font-semibold text-[#111827]">Top movers</h2>
          <ul className="mt-3 max-h-56 divide-y divide-[#f3f4f6] overflow-y-auto text-sm">
            {(velocity.data?.topMovers ?? []).map((r) => (
              <li
                key={`t-${r.sku}-${r.name}`}
                className="flex justify-between gap-2 py-2"
              >
                <span className="min-w-0 truncate text-[#6b7280]">
                  {r.name}
                  <span className="ml-1 font-mono text-[0.65rem]">{r.sku}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {r.qty} · {money(r.revenue)}
                </span>
              </li>
            ))}
            {!velocity.data?.topMovers?.length ? (
              <li className="py-4 text-[#6b7280]">No sold lines in range</li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
          <h2 className="text-sm font-semibold text-[#111827]">Slow movers</h2>
          <ul className="mt-3 max-h-56 divide-y divide-[#f3f4f6] overflow-y-auto text-sm">
            {(velocity.data?.slowMovers ?? []).map((r) => (
              <li
                key={`s-${r.sku}-${r.name}`}
                className="flex justify-between gap-2 py-2"
              >
                <span className="min-w-0 truncate text-[#6b7280]">
                  {r.name}
                  <span className="ml-1 font-mono text-[0.65rem]">{r.sku}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {r.qty} · {money(r.revenue)}
                </span>
              </li>
            ))}
            {!velocity.data?.slowMovers?.length ? (
              <li className="py-4 text-[#6b7280]">No data</li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
          <h2 className="text-sm font-semibold text-[#111827]">Staff sales</h2>
          <ul className="mt-3 divide-y divide-[#f3f4f6] text-sm">
            {(staff.data?.staff ?? []).map((r) => (
              <li key={r.userId} className="flex justify-between py-2">
                <span className="text-[#6b7280]">{r.name}</span>
                <span className="font-medium tabular-nums">
                  {r.orderCount} · {money(r.subtotal)}
                </span>
              </li>
            ))}
            {!staff.data?.staff?.length ? (
              <li className="py-4 text-[#6b7280]">No staff sales in range</li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
          <h2 className="text-sm font-semibold text-[#111827]">Tax summary</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-[#6b7280]">Order tax</dt>
              <dd className="tabular-nums font-medium">
                {money(tax.data?.orders?.taxTotal ?? 0)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#6b7280]">Invoice CGST</dt>
              <dd className="tabular-nums font-medium">
                {money(tax.data?.invoices?.cgst ?? 0)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#6b7280]">Invoice SGST</dt>
              <dd className="tabular-nums font-medium">
                {money(tax.data?.invoices?.sgst ?? 0)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#6b7280]">Invoice IGST</dt>
              <dd className="tabular-nums font-medium">
                {money(tax.data?.invoices?.igst ?? 0)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-[#f3f4f6] pt-2">
              <dt className="text-[#6b7280]">Invoice grand total</dt>
              <dd className="tabular-nums font-semibold">
                {money(tax.data?.invoices?.grandTotal ?? 0)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
          <h2 className="text-sm font-semibold text-[#111827]">
            Inventory status
          </h2>
          <ul className="mt-3 divide-y divide-[#f3f4f6] text-sm">
            {(util.data?.byAvailabilityStatus ?? []).map((r) => (
              <li
                key={r.availabilityStatus}
                className="flex justify-between py-2"
              >
                <span className="text-[#6b7280]">
                  {r.availabilityStatus.replaceAll("_", " ")}
                </span>
                <span className="font-medium tabular-nums">{r.count}</span>
              </li>
            ))}
            {util.data?.saleStock ? (
              <li className="flex justify-between py-2 text-[#6b7280]">
                <span>Sale SKUs on hand</span>
                <span className="tabular-nums">
                  {util.data.saleStock.skuCount} ·{" "}
                  {Number(util.data.saleStock.qtyOnHand)}
                </span>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
          <h2 className="text-sm font-semibold text-[#111827]">
            Outstanding balances
          </h2>
          <ul className="mt-3 max-h-64 divide-y divide-[#f3f4f6] overflow-y-auto text-sm">
            {(balances.data?.items ?? []).map((o) => (
              <li key={o.id} className="flex justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{o.orderNumber}</p>
                  <p className="truncate text-xs text-[#6b7280]">
                    {o.customer?.fullName ?? "—"} · {formatDate(o.pickupDate)}
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">
                  {money(o.balanceDue)}
                </span>
              </li>
            ))}
            {!balances.data?.items?.length ? (
              <li className="py-4 text-[#6b7280]">None outstanding</li>
            ) : null}
          </ul>
        </section>
      </div>
    </div>
  );
}
