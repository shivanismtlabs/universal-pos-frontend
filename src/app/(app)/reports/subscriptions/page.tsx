"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { reportsApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { todayYmd } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

export default function SubscriptionsReportPage() {
  const { money, hasMode, hasCapability } = useBootstrap();
  const allowed =
    hasMode("subscription") ||
    hasCapability("SUBSCRIPTION") ||
    hasCapability("MEMBERSHIP") ||
    hasCapability("CHECK_IN");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(todayYmd());
  const [range, setRange] = useState({ from, to });

  const report = useQuery({
    queryKey: ["reports", "subscriptions", range],
    queryFn: () => reportsApi.subscriptionsReport(range.from, range.to),
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
      ["active", s?.active ?? 0],
      ["monthly_recurring", s?.monthlyRecurring ?? 0],
      ["started", s?.startedInPeriod ?? 0],
      ["cancelled", s?.cancelledInPeriod ?? 0],
      ["check_ins", s?.checkInsInPeriod ?? 0],
      ["churn_pct", s?.churnPct ?? 0],
    ];
    for (const r of report.data.upcomingRenewals) {
      rows.push(["renewal", `${r.customerName}|${r.planName}|${r.renewsAt}`]);
    }
    downloadCsv(
      `plans-memberships_${range.from}_to_${range.to}.csv`,
      rows[0] as string[],
      rows.slice(1),
    );
    toast.success("CSV downloaded");
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeader
          title="Plans & memberships"
          subtitle="Enable the Subscription commerce mode to track gym, class, club, or software-style plans."
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
        title="Plans & memberships"
        subtitle="Active plans, recurring value, churn, renewals, and check-ins — same model for any membership business."
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
              size="sm"
              className="h-9"
              onClick={() => setRange({ from, to })}
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Active plans", s?.active ?? "—"],
          ["Monthly recurring", s ? money(s.monthlyRecurring) : "—"],
          ["Started", s?.startedInPeriod ?? "—"],
          ["Cancelled", s?.cancelledInPeriod ?? "—"],
          ["Check-ins", s?.checkInsInPeriod ?? "—"],
          ["Churn (period)", s != null ? `${s.churnPct}%` : "—"],
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

      <section className="rounded-[12px] border border-[#e8edf4] bg-white p-4">
        <h2 className="text-sm font-semibold text-[#0b1f33]">By status</h2>
        <ul className="mt-3 space-y-1.5 text-sm">
          {(report.data?.byStatus ?? []).map((r) => (
            <li key={r.status} className="flex justify-between">
              <span className="capitalize text-[#5a6b7d]">{r.status}</span>
              <span className="tabular-nums font-semibold">
                {r.count} · {money(r.priceSum)}
              </span>
            </li>
          ))}
          {!report.data?.byStatus.length ? (
            <li className="text-[#8b9bb0]">No plans yet</li>
          ) : null}
        </ul>
      </section>

      <section className="overflow-hidden rounded-[12px] border border-[#e8edf4] bg-white">
        <div className="border-b border-[#e8edf4] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#0b1f33]">
            Upcoming renewals (14 days)
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#f8fafc] text-left text-[0.7rem] uppercase tracking-wide text-[#8b9bb0]">
            <tr>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Plan</th>
              <th className="px-4 py-2">Renews</th>
              <th className="px-4 py-2 text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {(report.data?.upcomingRenewals ?? []).map((r) => (
              <tr key={r.id} className="border-t border-[#eef2f7]">
                <td className="px-4 py-2">{r.customerName}</td>
                <td className="px-4 py-2">{r.planName}</td>
                <td className="px-4 py-2 tabular-nums">
                  {r.renewsAt.slice(0, 10)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {money(r.price)}
                </td>
              </tr>
            ))}
            {!report.data?.upcomingRenewals.length ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[#8b9bb0]">
                  No renewals in the next 14 days
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
