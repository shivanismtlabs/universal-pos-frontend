"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { reportsApi, tenantsApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { todayYmd } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

export default function RentalOpsReportPage() {
  const { money, hasMode, hasCapability } = useBootstrap();
  const allowed =
    hasMode("rental") ||
    hasCapability("AVAILABILITY") ||
    hasCapability("DEPOSIT") ||
    hasCapability("DAMAGE");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(todayYmd());
  const [locationId, setLocationId] = useState("");
  const [range, setRange] = useState({ from, to, locationId: "" });

  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });
  const report = useQuery({
    queryKey: ["reports", "rental-ops", range],
    queryFn: () =>
      reportsApi.rentalOps(range.from, range.to, range.locationId || undefined),
    enabled: allowed,
  });

  const s = report.data?.summary;

  function exportCsv() {
    if (!report.data) {
      toast.error("Load a date range first");
      return;
    }
    const rows: Array<Array<string | number>> = [
      ["metric", "value"],
      ["from", range.from],
      ["to", range.to],
      ["orders", s?.orderCount ?? 0],
      ["revenue", s?.revenue ?? 0],
      ["utilization_pct", s?.utilizationPct ?? ""],
      ["units_out", s?.unitsOut ?? 0],
      ["units_total", s?.unitsTotal ?? 0],
      ["overdue", s?.overdueCount ?? 0],
      ["open_deposits", s?.openDeposits ?? 0],
      ["damage_events", s?.damageEvents ?? 0],
    ];
    for (const r of report.data.overdue) {
      rows.push([
        "overdue_order",
        `${r.orderNumber}|${r.customerName}|${r.returnDueDate ?? ""}`,
      ]);
    }
    downloadCsv(
      `rental-ops_${range.from}_to_${range.to}.csv`,
      rows[0] as string[],
      rows.slice(1),
    );
    toast.success("CSV downloaded");
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeader
          title="Rental / assets"
          subtitle="Enable the Rental commerce mode in Settings → Commerce modes to use this report."
        />
        <Button asChild variant="secondary" size="sm">
          <Link href="/settings/capabilities">Open commerce modes</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Rental / assets"
        subtitle="Utilization, overdue returns, deposits, and damage — works for equipment, rooms, vehicles, or garments."
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
              size="sm"
              className="h-9"
              onClick={() => setRange({ from, to, locationId })}
            >
              Apply
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-9"
              onClick={exportCsv}
            >
              Export CSV
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Orders", s?.orderCount ?? "—"],
          ["Revenue", s ? money(s.revenue) : "—"],
          ["Utilization", s?.utilizationPct != null ? `${s.utilizationPct}%` : "—"],
          ["Overdue", s?.overdueCount ?? "—"],
          ["Units out", s ? `${s.unitsOut} / ${s.unitsTotal}` : "—"],
          ["Open deposits", s ? money(s.openDeposits) : "—"],
          ["Damage charges", s ? money(s.damageCharges) : "—"],
          ["Cleaning queue", s?.cleaningQueue ?? "—"],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-[10px] border border-[#e8edf4] bg-white px-4 py-3"
          >
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[#8b9bb0]">
              {label}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-[#0b1f33]">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[12px] border border-[#e8edf4] bg-white p-4">
          <h2 className="text-sm font-semibold text-[#0b1f33]">Lifecycle</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {(report.data?.byLifecycle ?? []).map((r) => (
              <li key={r.lifecycle} className="flex justify-between">
                <span className="capitalize text-[#5a6b7d]">
                  {r.lifecycle.replace(/_/g, " ")}
                </span>
                <span className="tabular-nums font-semibold">{r.count}</span>
              </li>
            ))}
            {!report.data?.byLifecycle.length ? (
              <li className="text-[#8b9bb0]">No rental tickets yet</li>
            ) : null}
          </ul>
        </section>
        <section className="rounded-[12px] border border-[#e8edf4] bg-white p-4">
          <h2 className="text-sm font-semibold text-[#0b1f33]">Asset status</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {(report.data?.byUnitStatus ?? []).map((r) => (
              <li key={r.status} className="flex justify-between">
                <span className="capitalize text-[#5a6b7d]">
                  {r.status.replace(/_/g, " ")}
                </span>
                <span className="tabular-nums font-semibold">{r.count}</span>
              </li>
            ))}
            {!report.data?.byUnitStatus.length ? (
              <li className="text-[#8b9bb0]">No serialized assets yet</li>
            ) : null}
          </ul>
        </section>
      </div>

      <section className="overflow-hidden rounded-[12px] border border-[#e8edf4] bg-white">
        <div className="border-b border-[#e8edf4] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#0b1f33]">Overdue returns</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#f8fafc] text-left text-[0.7rem] uppercase tracking-wide text-[#8b9bb0]">
            <tr>
              <th className="px-4 py-2">Order</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Due</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {(report.data?.overdue ?? []).map((r) => (
              <tr key={r.orderId} className="border-t border-[#eef2f7]">
                <td className="px-4 py-2 font-mono text-xs">{r.orderNumber}</td>
                <td className="px-4 py-2">{r.customerName}</td>
                <td className="px-4 py-2 tabular-nums">
                  {r.returnDueDate?.slice(0, 10) ?? "—"}
                </td>
                <td className="px-4 py-2 capitalize">
                  {r.lifecycle.replace(/_/g, " ")}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {money(r.balanceDue)}
                </td>
              </tr>
            ))}
            {!report.data?.overdue.length ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[#8b9bb0]">
                  No overdue returns
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
