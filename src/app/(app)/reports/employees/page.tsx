"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { reportsApi, tenantsApi, usersApi } from "@/lib/api";
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

const ROLES = [
  { value: "", label: "All roles" },
  { value: "cashier", label: "Cashier" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
  { value: "fitter", label: "Fitter / technician" },
  { value: "inventory", label: "Inventory" },
  { value: "accountant", label: "Accountant" },
];

export default function EmployeeSalesReportPage() {
  const { money, hasCapability } = useBootstrap();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(todayYmd);
  const [locationId, setLocationId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [role, setRole] = useState("");
  const [shiftSalesOnly, setShiftSalesOnly] = useState(false);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [applied, setApplied] = useState({
    from: defaultFrom(),
    to: todayYmd(),
    locationId: "",
    employeeId: "",
    role: "",
    shiftSalesOnly: false,
    detailUserId: null as string | null,
  });

  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => usersApi.list(),
  });

  const report = useQuery({
    queryKey: ["reports", "employee-sales", applied],
    queryFn: () =>
      reportsApi.employeeSales({
        from: applied.from,
        to: applied.to,
        locationId: applied.locationId || undefined,
        employeeIds: applied.employeeId ? [applied.employeeId] : undefined,
        role: applied.role || undefined,
        shiftSalesOnly: applied.shiftSalesOnly || undefined,
        detailUserId: applied.detailUserId || undefined,
      }),
  });

  const data = report.data;
  const chartMax = useMemo(
    () => Math.max(1, ...(data?.chart.map((c) => c.sales) ?? [1])),
    [data?.chart],
  );

  const showService =
    hasCapability("BOOKING") ||
    hasCapability("STAFF_ASSIGNMENT") ||
    hasCapability("REPAIR_JOB");
  const showRestaurant =
    hasCapability("TABLE") ||
    hasCapability("KOT") ||
    hasCapability("KITCHEN");

  function applyFilters() {
    setApplied({
      from,
      to,
      locationId,
      employeeId,
      role,
      shiftSalesOnly,
      detailUserId,
    });
  }

  function openDetail(userId: string) {
    setDetailUserId(userId);
    setApplied((a) => ({ ...a, detailUserId: userId }));
  }

  function exportPayrollCsv() {
    if (!data?.leaderboard.length) {
      toast.error("Load the report first");
      return;
    }
    // Payroll-friendly flat columns
    downloadCsv(
      `employee_sales_payroll_${data.period.from}_${data.period.to}.csv`,
      [
        "employee_code",
        "employee_name",
        "email",
        "role",
        "period_from",
        "period_to",
        "total_sales",
        "transactions",
        "avg_ticket",
        "items_sold",
        "upsell_rate_pct",
        "commission_earned",
        "tips_earned",
        "refund_amount",
        "void_count",
        "hours_worked",
        "sales_per_hour",
        "services_performed",
        "tables_served",
        "rebooking_rate_pct",
      ],
      data.leaderboard.map((r) => [
        r.employeeCode ?? "",
        r.fullName,
        r.email,
        r.roleLabel,
        data.period.from,
        data.period.to,
        r.totalSales,
        r.transactions,
        r.avgTicket,
        r.itemsSold,
        r.upsellRatePct,
        r.commissionEarned,
        r.tipsEarned,
        r.refundAmount,
        r.voidCount,
        r.hoursWorked,
        r.salesPerHour ?? "",
        r.servicesPerformed,
        r.tablesServed,
        r.rebookingRatePct ?? "",
      ]),
    );
    toast.success("Payroll/commission CSV exported");
  }

  return (
    <div className="document-print-root mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={data?.title ?? "Employee Sales Report"}
        subtitle="Staff performance for accountability, commission, and incentives — with refund/void monitoring and sales-per-hour."
        action={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button asChild size="sm" variant="secondary">
              <Link href="/reports">All reports</Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={exportPayrollCsv}
            >
              Payroll CSV
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

      <div className="grid gap-3 rounded-lg border border-[#e2e8f0] bg-white p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 print:hidden">
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
            <option value="">All</option>
            {(locations.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label className="text-xs">Employee</Label>
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
          <Label className="text-xs">Role</Label>
          <Select
            className="mt-1 h-9"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {ROLES.map((r) => (
              <option key={r.value || "all"} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-end gap-2 pb-2 text-xs text-[#4b5563]">
          <input
            type="checkbox"
            checked={shiftSalesOnly}
            onChange={(e) => setShiftSalesOnly(e.target.checked)}
          />
          Shift sales only
        </label>
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

      {data?.commission ? (
        <p className="text-xs text-[#6b7280]">
          Commission:{" "}
          {data.commission.enabled
            ? `${data.commission.type} @ ${data.commission.ratePercent}%`
            : "not configured"}{" "}
          — {data.commission.note}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Staff", data?.summary.staffCount],
          ["Sales", data ? money(data.summary.totalSales) : "—"],
          ["Txns", data?.summary.totalTransactions],
          [
            "Commission",
            data ? money(data.summary.totalCommission) : "—",
          ],
          ["Hours", data?.summary.totalHours],
        ].map(([label, val]) => (
          <div
            key={String(label)}
            className="rounded-lg border border-[#e2e8f0] bg-white px-4 py-3"
          >
            <p className="text-[0.65rem] font-semibold tracking-wide text-[#6b7280] uppercase">
              {label}
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {val ?? "—"}
            </p>
          </div>
        ))}
      </div>

      <section className="rounded-lg border border-[#e2e8f0] bg-white p-4">
        <h2 className="text-sm font-semibold text-[#111827]">
          Top performers
        </h2>
        <ul className="mt-3 space-y-2">
          {(data?.chart ?? []).map((c) => (
            <li
              key={c.rank}
              className="grid grid-cols-[2rem_1fr_auto] items-center gap-2"
            >
              <span className="text-xs font-semibold text-[#6b7280]">
                #{c.rank}
              </span>
              <div>
                <div className="flex justify-between gap-2 text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="tabular-nums">{money(c.sales)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded bg-[#f3f4f6]">
                  <div
                    className="h-full rounded bg-[#1a56db]"
                    style={{
                      width: `${Math.max(4, (c.sales / chartMax) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            </li>
          ))}
          {!data?.chart.length && !report.isLoading ? (
            <li className="py-4 text-center text-sm text-[#6b7280]">
              No staff sales in this period
            </li>
          ) : null}
        </ul>
      </section>

      <section className="overflow-hidden rounded-lg border border-[#e2e8f0] bg-white">
        <div className="border-b border-[#e2e8f0] px-4 py-3">
          <h2 className="text-sm font-semibold">Leaderboard</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#f8fafc] text-[0.65rem] tracking-[0.08em] text-[#6b7280] uppercase">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2 text-right">Sales</th>
                <th className="px-3 py-2 text-right">Txns</th>
                <th className="px-3 py-2 text-right">ATV</th>
                <th className="px-3 py-2 text-right">Items</th>
                <th className="px-3 py-2 text-right">Upsell %</th>
                <th className="px-3 py-2 text-right">Commission</th>
                <th className="px-3 py-2 text-right">Refunds</th>
                <th className="px-3 py-2 text-right">Voids</th>
                <th className="px-3 py-2 text-right">Hours</th>
                <th className="px-3 py-2 text-right">Sales/hr</th>
                {showService ? (
                  <>
                    <th className="px-3 py-2 text-right">Tips</th>
                    <th className="px-3 py-2 text-right">Services</th>
                    <th className="px-3 py-2 text-right">Rebook %</th>
                  </>
                ) : null}
                {showRestaurant ? (
                  <>
                    <th className="px-3 py-2 text-right">Tables</th>
                    <th className="px-3 py-2 text-right">Tip %</th>
                  </>
                ) : null}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {(data?.leaderboard ?? []).map((r) => (
                <tr
                  key={r.userId}
                  className={cn(
                    "hover:bg-[#f8fafc]",
                    applied.detailUserId === r.userId && "bg-[#e8eefb]/40",
                  )}
                >
                  <td className="px-3 py-2 tabular-nums text-[#6b7280]">
                    {r.rank}
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{r.fullName}</p>
                    <p className="text-xs text-[#6b7280]">{r.roleLabel}</p>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {money(r.totalSales)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.transactions}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {money(r.avgTicket)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.itemsSold}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.upsellRatePct}%
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                    {money(r.commissionEarned)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      r.refundAmount > 0 && "text-rose-700 font-semibold",
                    )}
                  >
                    {money(r.refundAmount)}
                    <span className="text-[0.65rem] text-[#9ca3af]">
                      {" "}
                      ({r.refundCount})
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      r.voidCount > 0 && "text-amber-700 font-semibold",
                    )}
                  >
                    {r.voidCount}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.hoursWorked}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.salesPerHour != null ? money(r.salesPerHour) : "—"}
                  </td>
                  {showService ? (
                    <>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {money(r.tipsEarned)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.servicesPerformed}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.rebookingRatePct != null
                          ? `${r.rebookingRatePct}%`
                          : "—"}
                      </td>
                    </>
                  ) : null}
                  {showRestaurant ? (
                    <>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.tablesServed}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.tipPct != null ? `${r.tipPct}%` : "—"}
                      </td>
                    </>
                  ) : null}
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-xs font-semibold text-[#1a56db]"
                      onClick={() => openDetail(r.userId)}
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
              {!report.isLoading && !data?.leaderboard.length ? (
                <tr>
                  <td
                    colSpan={16}
                    className="px-3 py-10 text-center text-[#6b7280]"
                  >
                    No employee sales for these filters
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {data?.detail ? (
        <section className="overflow-hidden rounded-lg border border-[#e2e8f0] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2e8f0] px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">
                Transaction log — {data.detail.user.fullName}
              </h2>
              <p className="text-xs text-[#6b7280]">{data.detail.user.email}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="print:hidden"
              onClick={() => {
                setDetailUserId(null);
                setApplied((a) => ({ ...a, detailUserId: null }));
              }}
            >
              Close
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f8fafc] text-[0.65rem] tracking-[0.08em] text-[#6b7280] uppercase">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Branch</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Payment</th>
                  <th className="px-3 py-2">Items</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {data.detail.transactions.map((t) => (
                  <tr key={t.orderId}>
                    <td className="px-3 py-2 tabular-nums">{t.date}</td>
                    <td className="px-3 py-2">{t.orderNumber}</td>
                    <td className="px-3 py-2">{t.branch}</td>
                    <td className="px-3 py-2">{t.status}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {money(t.amount)}
                    </td>
                    <td className="px-3 py-2">
                      {t.paymentMethods.join(", ") || "—"}
                    </td>
                    <td className="max-w-[14rem] truncate px-3 py-2 text-xs text-[#4b5563]">
                      {t.items
                        .slice(0, 3)
                        .map((i) => `${i.name}×${i.qty}`)
                        .join(", ")}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={t.href}
                        className="text-xs font-semibold text-[#1a56db]"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
                {!data.detail.transactions.length ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-8 text-center text-[#6b7280]"
                    >
                      No transactions
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
