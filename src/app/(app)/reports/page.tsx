"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { reportsApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { formatDate, todayYmd } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [range, setRange] = useState({ from, to });

  const sales = useQuery({
    queryKey: ["reports", "sales", range],
    queryFn: () => reportsApi.salesSummary(range.from, range.to),
  });
  const payments = useQuery({
    queryKey: ["reports", "payments", range],
    queryFn: () => reportsApi.paymentsSummary(range.from, range.to),
  });
  const util = useQuery({
    queryKey: ["reports", "util"],
    queryFn: () => reportsApi.inventoryUtilization(),
  });
  const balances = useQuery({
    queryKey: ["reports", "balances"],
    queryFn: () => reportsApi.balances(),
  });

  const totals = sales.data?.totals;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Reports"
        subtitle="Performance by period — export when you need a spreadsheet."
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
          <Button
            type="button"
            size="sm"
            className="h-9"
            onClick={() => setRange({ from, to })}
          >
            Apply
          </Button>
        </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Orders", totals?.orderCount ?? "—"],
          ["Subtotal", totals?.subtotal != null ? money(totals.subtotal) : "—"],
          ["Balance due", totals?.balanceDue != null ? money(totals.balanceDue) : "—"],
        ].map(([k, v]) => (
          <div
            key={k}
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
          <h2 className="text-sm font-semibold text-[#111827]">Orders by status</h2>
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
          <h2 className="text-sm font-semibold text-[#111827]">Payments by method</h2>
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
