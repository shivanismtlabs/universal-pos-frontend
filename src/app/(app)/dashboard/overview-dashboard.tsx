"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Download,
  Package,
  ShoppingBag,
} from "lucide-react";
import {
  posApi,
  reportsApi,
  servicesCommerceApi,
  subscriptionsApi,
  tenantsApi,
} from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { useAuthStore } from "@/lib/auth-store";
import { useBranchStore } from "@/lib/branch-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function moneyNum(v: string | number | undefined | null) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatInr(n: number) {
  if (n >= 1_000_000) return `₹${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatDisplayName(fullName?: string | null) {
  if (!fullName?.trim()) return null;
  const parts = fullName.trim().split(/\s+/);
  // "Shop Owner" → prefer full string over bare "Shop"
  if (parts[0]?.toLowerCase() === "shop" && parts.length > 1) {
    return parts.slice(1).join(" ");
  }
  return parts[0] ?? fullName.trim();
}

/**
 * Enterprise overview — metrics, charts, activity.
 * Brand: sapphire / cool gray.
 * @param embed when true, omit redundant page title (parent Dashboard provides it)
 */
export function OverviewDashboard({ embed = false }: { embed?: boolean }) {
  const { money, productName, hasMode } = useBootstrap();
  const user = useAuthStore((s) => s.user);
  const branchId = useBranchStore((s) => s.currentLocationId);
  const hasSale = hasMode("sale");
  const hasSub = hasMode("subscription");
  const hasService = hasMode("service");
  const greetName = formatDisplayName(user?.fullName);

  const branchDash = useQuery({
    queryKey: ["branch-dashboard", branchId],
    queryFn: () => tenantsApi.branchDashboard(branchId!),
    enabled: Boolean(branchId),
  });
  const hqDash = useQuery({
    queryKey: ["multi-store-dashboard"],
    queryFn: () => tenantsApi.multiStoreDashboard(),
  });

  const sales = useQuery({
    queryKey: ["reports-sales-summary"],
    queryFn: () => reportsApi.salesSummary(),
  });
  const payments = useQuery({
    queryKey: ["reports-payments-summary"],
    queryFn: () => reportsApi.paymentsSummary(),
  });
  const financeDash = useQuery({
    queryKey: ["reports-dashboard-finance"],
    queryFn: () => reportsApi.dashboardFinance(),
  });
  const floor = useQuery({
    queryKey: ["pos-sale-floor"],
    queryFn: () => posApi.saleFloor(),
    enabled: hasSale,
  });
  const lowStockQ = useQuery({
    queryKey: ["pos-sale-low-stock"],
    queryFn: () =>
      posApi.saleCatalog({ lowStock: true, maxQty: 5, limit: 8 }),
    enabled: hasSale,
  });
  const recent = useQuery({
    queryKey: ["pos-sale-recent-overview"],
    queryFn: () => posApi.listRecentSales(8),
    enabled: hasSale,
  });
  const subSummary = useQuery({
    queryKey: ["subscriptions-summary"],
    queryFn: () => subscriptionsApi.summary(),
    enabled: hasSub,
  });
  const svcSummary = useQuery({
    queryKey: ["services-summary"],
    queryFn: () => servicesCommerceApi.summary(),
    enabled: hasService,
  });

  const revenue =
    moneyNum(sales.data?.totals?.subtotal) +
    moneyNum(sales.data?.totals?.taxTotal);
  const orderCount = sales.data?.totals?.orderCount ?? 0;
  const products = floor.data?.counts?.products ?? 0;
  const inStock = floor.data?.counts?.inStock ?? 0;
  const stockRows = floor.data?.counts?.stockRows ?? 0;
  const lowStock = Math.max(0, stockRows - inStock);
  const lowItems = lowStockQ.data?.items ?? [];
  const lowCount = lowItems.length || lowStock;

  const payMethods = payments.data?.byMethod ?? [];
  const payTotal = payMethods.reduce((s, m) => s + moneyNum(m.amount), 0) || 1;

  const spark = useMemo(() => {
    const vals = (recent.data?.items ?? [])
      .slice(0, 7)
      .reverse()
      .map((o) => moneyNum(o.total ?? o.subtotal));
    if (vals.length < 2) return [] as number[];
    const max = Math.max(...vals, 1);
    return vals.map((v) => Math.max(8, Math.round((v / max) * 36)));
  }, [recent.data]);

  const cashSpark = useMemo(() => {
    const series = financeDash.data?.cashFlow.series ?? [];
    if (!series.length) return null;
    const max = Math.max(1, ...series.map((s) => Math.max(s.inflow, s.outflow)));
    return series.map((s) => ({
      date: s.date,
      inH: Math.max(2, Math.round((s.inflow / max) * 48)),
      outH: Math.max(2, Math.round((s.outflow / max) * 48)),
      net: s.net,
    }));
  }, [financeDash.data]);

  const expCatMax = useMemo(
    () =>
      Math.max(
        1,
        ...(financeDash.data?.expenses.byCategory.map((c) => c.amount) ?? [1]),
      ),
    [financeDash.data],
  );

  const tasks = [
    ...(hasSale && products === 0
      ? [
          {
            label: "Add your first product",
            href: "/catalog",
            priority: "HIGH" as const,
          },
        ]
      : []),
    ...(hasSale
      ? [
          {
            label: "Open counter & take a sale",
            href: "/counter",
            priority: "HIGH" as const,
          },
          {
            label: "Review products & stock",
            href: "/catalog",
            priority: "MEDIUM" as const,
          },
        ]
      : []),
    ...(hasSub
      ? [
          {
            label: "Enroll a member on a plan",
            href: "/dashboard",
            priority: "HIGH" as const,
          },
        ]
      : []),
    ...(hasService
      ? [
          {
            label: "Charge a service or book appointment",
            href: "/appointments",
            priority: "MEDIUM" as const,
          },
        ]
      : []),
    {
      label: "Check today’s reports",
      href: "/reports",
      priority: "LOW" as const,
    },
  ];

  return (
    <div className="space-y-5">
      {!embed ? (
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#0b1f33] sm:text-[1.75rem]">
              Overview
            </h1>
            <p className="mt-1 text-[0.9375rem] text-[#5a6b7d]">
              Welcome back{greetName ? `, ${greetName}` : ""}
              — here&apos;s what&apos;s happening at {productName}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link href="/reports">
                <Download className="h-4 w-4" />
                Reports
              </Link>
            </Button>
            {hasSale ? (
              <Button asChild>
                <Link href="/counter">
                  <CreditCard className="h-4 w-4" />
                  Open counter
                </Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href="/dashboard">
                  <CreditCard className="h-4 w-4" />
                  Open floor
                </Link>
              </Button>
            )}
          </div>
        </header>
      ) : null}

      {(branchDash.data || (hqDash.data && hqDash.data.totalStores > 1)) && (
        <section className="space-y-3 rounded-[14px] border border-[#d9e0ea] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="eyebrow">Multi-store</p>
              <h2 className="section-title mt-1">
                {branchDash.data?.branch.name
                  ? `Branch · ${branchDash.data.branch.name}`
                  : "All branches"}
              </h2>
            </div>
            <Button asChild size="sm" variant="secondary">
              <Link href="/multi-store/dashboard">Multi-store dashboard</Link>
            </Button>
          </div>
          {branchDash.data ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniStat
                label="Today sales"
                value={formatInr(branchDash.data.today.salesTotal)}
              />
              <MiniStat
                label="Orders"
                value={String(branchDash.data.today.orders)}
              />
              <MiniStat
                label="Low stock"
                value={String(branchDash.data.inventory.lowStock)}
              />
              <MiniStat
                label="Inventory value"
                value={formatInr(branchDash.data.inventory.value)}
              />
            </div>
          ) : null}
          {hqDash.data && hqDash.data.byBranch.length > 1 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[0.8rem]">
                <thead className="text-[0.65rem] tracking-wide text-[#8a9bb0] uppercase">
                  <tr>
                    <th className="py-1 pr-3 font-semibold">Branch</th>
                    <th className="py-1 pr-3 font-semibold">Orders</th>
                    <th className="py-1 font-semibold">Today sales</th>
                  </tr>
                </thead>
                <tbody>
                  {hqDash.data.byBranch.map((b) => (
                    <tr key={b.locationId} className="border-t border-[#eef2f8]">
                      <td className="py-1.5 pr-3 font-medium text-[#0b1f33]">
                        {b.name}
                      </td>
                      <td className="py-1.5 pr-3 tabular-nums">
                        {b.todayOrders}
                      </td>
                      <td className="py-1.5 tabular-nums">
                        {formatInr(b.todaySales)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      )}

      {hasSale && products === 0 ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#bfd0f5] bg-[#eef4ff] px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#0b1f33]">
              No products yet
            </p>
            <p className="mt-0.5 text-[0.8rem] text-[#5a6b7d]">
              Add items in Products so they appear on the counter.
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/catalog">Add products</Link>
          </Button>
        </section>
      ) : null}

      {/* Metric cards — equal columns, stable grid */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard
          label="Total sales"
          value={formatInr(revenue)}
          hint={
            orderCount
              ? `${orderCount} order${orderCount === 1 ? "" : "s"} recorded`
              : "No sales yet"
          }
          tone="up"
          icon={ShoppingBag}
        />
        <MetricCard
          label="Orders"
          value={String(orderCount)}
          hint="Closed tickets"
          tone="neutral"
          icon={ClipboardList}
          href="/orders"
        />
        {hasSale ? (
          <>
            <MetricCard
              label="Products"
              value={String(products)}
              hint={
                products
                  ? `${floor.data?.counts?.categories ?? 0} categories`
                  : "Tap to add stock"
              }
              tone={products ? "neutral" : "warn"}
              icon={Package}
              href="/catalog"
              progress={products ? Math.min(100, products * 8) : 0}
            />
            <MetricCard
              label="In stock SKUs"
              value={`${inStock}`}
              hint={
                lowCount > 0
                  ? `${lowCount} SKU${lowCount === 1 ? "" : "s"} low or out`
                  : products
                    ? "Stock levels look healthy"
                    : "Add products first"
              }
              tone={lowCount > 0 ? "warn" : "up"}
              icon={BarChart3}
              href="/catalog"
            />
          </>
        ) : null}
        {hasSub ? (
          <>
            <MetricCard
              label="Active members"
              value={String(subSummary.data?.activeMembers ?? 0)}
              hint={`${subSummary.data?.plans ?? 0} plans`}
              tone="up"
              icon={ClipboardList}
            />
            <MetricCard
              label="Plan renewals due"
              value={String(subSummary.data?.expired ?? 0)}
              hint="Expired periods"
              tone={(subSummary.data?.expired ?? 0) > 0 ? "warn" : "neutral"}
              icon={Package}
            />
          </>
        ) : null}
        {hasService ? (
          <>
            <MetricCard
              label="Services"
              value={String(svcSummary.data?.services ?? 0)}
              hint="Active on menu"
              tone="neutral"
              icon={BarChart3}
            />
            <MetricCard
              label="Open appointments"
              value={String(svcSummary.data?.openAppointments ?? 0)}
              hint="Scheduled / checked in"
              tone="neutral"
              icon={ClipboardList}
            />
          </>
        ) : null}
      </div>

      {/* Charts — stack on mobile, side-by-side on large */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[1.35fr_1fr]">
        <section className="rounded-[14px] border border-[#d9e0ea] bg-white p-5 shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
                Sales trend
              </h2>
              <p className="text-[0.75rem] text-[#5a6b7d]">
                Recent ticket totals
              </p>
            </div>
            <span className="rounded-lg bg-[#e8eefb] px-2.5 py-1 text-[0.7rem] font-semibold text-[#1341a8]">
              Recent
            </span>
          </div>
          {spark.length ? (
            <>
              <div className="mt-6 flex h-40 items-end gap-2 px-1">
                {spark.map((h, i) => (
                  <div
                    key={i}
                    className="flex flex-1 flex-col items-center justify-end gap-1"
                  >
                    <div
                      className="w-full max-w-[2.25rem] rounded-t-md bg-[linear-gradient(180deg,#5b8def_0%,#1a56db_100%)]"
                      style={{ height: `${h * 3.2}px` }}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[0.75rem] text-[#8b9bb0]">
                Total sales {money(revenue)} · recent closed tickets
              </p>
            </>
          ) : (
            <p className="mt-8 rounded-lg border border-dashed border-[#d9e0ea] bg-[#fafbfc] px-4 py-10 text-center text-[0.8125rem] text-[#8b9bb0]">
              No closed tickets yet — open the counter to start the sales trend.
            </p>
          )}
        </section>

        <section className="rounded-[14px] border border-[#d9e0ea] bg-white p-5 shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
          <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
            Payments mix
          </h2>
          <p className="text-[0.75rem] text-[#5a6b7d]">By method</p>

          {payMethods.length ? (
            <div className="mt-5 flex items-center gap-5">
              <Donut
                segments={payMethods.map((m, i) => ({
                  pct: (moneyNum(m.amount) / payTotal) * 100,
                  color: ["#1a56db", "#5b8def", "#0b1f33", "#94a3b8"][i % 4]!,
                }))}
                center={formatInr(payTotal)}
              />
              <ul className="min-w-0 flex-1 space-y-2">
                {payMethods.map((m, i) => (
                  <li
                    key={m.method}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="flex items-center gap-2 text-[#5a6b7d]">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          background: [
                            "#1a56db",
                            "#5b8def",
                            "#0b1f33",
                            "#94a3b8",
                          ][i % 4],
                        }}
                      />
                      <span className="capitalize">{m.method}</span>
                    </span>
                    <span className="font-semibold tabular-nums text-[#0b1f33]">
                      {money(m.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-8 rounded-lg border border-dashed border-[#d9e0ea] bg-[#fafbfc] px-4 py-10 text-center text-[0.8125rem] text-[#8b9bb0]">
              No payments recorded yet for this period.
            </p>
          )}
        </section>
      </div>

      {/* Finance charts — cash flow + expenses / tax */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[14px] border border-[#d9e0ea] bg-white p-5 shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
                Cash flow
              </h2>
              <p className="text-[0.75rem] text-[#5a6b7d]">
                Last 14 days · in vs out
              </p>
            </div>
            <Link
              href="/reports/finance"
              className="text-[0.75rem] font-semibold text-[#1a56db] hover:underline"
            >
              Finance reports
            </Link>
          </div>
          {cashSpark ? (
            <>
              <div className="mt-5 flex h-28 items-end gap-1">
                {cashSpark.map((s) => (
                  <div
                    key={s.date}
                    className="flex flex-1 flex-col items-center justify-end gap-0.5"
                    title={`${s.date}: net ${formatInr(s.net)}`}
                  >
                    <div
                      className="w-full max-w-[1.1rem] rounded-t-sm bg-[#0e9f6e]"
                      style={{ height: `${s.inH}px` }}
                    />
                    <div
                      className="w-full max-w-[1.1rem] rounded-b-sm bg-[#f87171]"
                      style={{ height: `${s.outH}px` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-[0.75rem] text-[#5a6b7d]">
                <span>
                  In {formatInr(financeDash.data?.cashFlow.cashIn ?? 0)}
                </span>
                <span>
                  Out {formatInr(financeDash.data?.cashFlow.cashOut ?? 0)}
                </span>
                <span className="font-semibold text-[#0b1f33]">
                  Net {formatInr(financeDash.data?.cashFlow.netCash ?? 0)}
                </span>
              </div>
            </>
          ) : (
            <p className="mt-6 text-sm text-[#8b9bb0]">
              No cash movements yet — receipts and expenses will chart here.
            </p>
          )}
        </section>

        <section className="rounded-[14px] border border-[#d9e0ea] bg-white p-5 shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
                Expenses & tax
              </h2>
              <p className="text-[0.75rem] text-[#5a6b7d]">
                Category spend · net tax payable
              </p>
            </div>
            <span className="rounded-lg bg-[#e8eefb] px-2.5 py-1 text-[0.7rem] font-semibold text-[#1341a8]">
              {formatInr(financeDash.data?.tax.netTaxPayable ?? 0)} tax
            </span>
          </div>
          <ul className="mt-4 space-y-2.5">
            {(financeDash.data?.expenses.byCategory ?? []).slice(0, 5).map((c) => (
              <li key={c.categoryId ?? c.name}>
                <div className="mb-1 flex justify-between text-[0.8rem]">
                  <span className="truncate text-[#5a6b7d]">{c.name}</span>
                  <span className="tabular-nums font-medium text-[#0b1f33]">
                    {formatInr(c.amount)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded bg-[#eef1f4]">
                  <div
                    className="h-full rounded bg-[#1a56db]"
                    style={{ width: `${(c.amount / expCatMax) * 100}%` }}
                  />
                </div>
              </li>
            ))}
            {!financeDash.data?.expenses.byCategory?.length ? (
              <li className="rounded-xl bg-[#f4f6fa] px-4 py-6 text-center text-sm text-[#5a6b7d]">
                No expenses yet.{" "}
                <Link href="/expenses" className="font-semibold text-[#1a56db]">
                  Add expense →
                </Link>
              </li>
            ) : null}
          </ul>
          {(financeDash.data?.suppliers.outstanding ?? 0) > 0 ? (
            <p className="mt-4 border-t border-[#eef1f4] pt-3 text-[0.75rem] text-[#5a6b7d]">
              Supplier AP outstanding{" "}
              <span className="font-semibold text-[#0b1f33]">
                {formatInr(financeDash.data?.suppliers.outstanding ?? 0)}
              </span>
            </p>
          ) : null}
        </section>
      </div>

      {/* Activity + tasks */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[14px] border border-[#d9e0ea] bg-white p-5 shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
          <div className="flex items-center justify-between">
            <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
              Recent activity
            </h2>
            <Link
              href="/orders"
              className="text-[0.75rem] font-semibold text-[#1a56db] hover:underline"
            >
              View all
            </Link>
          </div>
          <ul className="mt-4 space-y-3">
            {(recent.data?.items ?? []).slice(0, 5).map((o) => (
              <li key={o.id} className="flex gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#e8eefb] text-[#1a56db]">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#0b1f33]">
                    Sale {o.orderNumber} · {money(o.subtotal)}
                  </p>
                  <p className="text-[0.75rem] text-[#8b9bb0]">
                    {o.customerName || "Walk-in"} ·{" "}
                    {new Date(o.createdAt).toLocaleString()}
                  </p>
                </div>
              </li>
            ))}
            {!recent.data?.items?.length && !recent.isLoading ? (
              <li className="rounded-xl bg-[#f4f6fa] px-4 py-8 text-center text-sm text-[#5a6b7d]">
                No sales yet.{" "}
                <Link href="/counter" className="font-semibold text-[#1a56db]">
                  Open counter →
                </Link>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-[14px] border border-[#d9e0ea] bg-white p-5 shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
          <div className="flex items-center justify-between">
            <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
              Pending tasks
            </h2>
            <Link
              href="/catalog"
              className="text-[0.75rem] font-semibold text-[#1a56db] hover:underline"
            >
              View all
            </Link>
          </div>
          <ul className="mt-4 space-y-2.5">
            {tasks.map((t) => (
              <li key={t.label}>
                <Link
                  href={t.href}
                  className="flex items-center gap-3 rounded-[10px] border border-[#eef1f4] bg-[#f8fafc] px-3 py-2.5 transition hover:border-[#cfd8e6] hover:bg-white"
                >
                  <span className="grid h-5 w-5 place-items-center rounded border border-[#d9e0ea] bg-white" />
                  <span className="min-w-0 flex-1 text-sm font-medium text-[#0b1f33]">
                    {t.label}
                  </span>
                  <PriorityTag level={t.priority} />
                  <ArrowUpRight className="h-3.5 w-3.5 text-[#8b9bb0]" />
                </Link>
              </li>
            ))}
            {lowCount > 0 ? (
              <li className="flex items-start gap-2 rounded-[10px] border border-[#fecaca] bg-[#fff6f6] px-3 py-2.5 text-sm text-[#c81e1e]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {lowCount} SKU{lowCount === 1 ? "" : "s"} low/out — restock from
                  Products or accept a purchase.
                </span>
              </li>
            ) : null}
          </ul>
        </section>
      </div>

      {hasSale && lowItems.length > 0 ? (
        <section className="rounded-[14px] border border-[#fecaca] bg-white p-5 shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
                Needs attention — low stock
              </h2>
              <p className="text-[0.75rem] text-[#5a6b7d]">
                Any product type — restock before the counter sells out.
              </p>
            </div>
            <Button asChild size="sm" variant="secondary">
              <Link href="/catalog">Open products</Link>
            </Button>
          </div>
          <ul className="mt-4 divide-y divide-[#eef1f4]">
            {lowItems.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-[#0b1f33]">
                    {row.name}
                  </p>
                  <p className="truncate text-[0.75rem] text-[#5a6b7d]">
                    {row.productSku || row.sku}
                    {row.category?.name ? ` · ${row.category.name}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-md px-2 py-0.5 text-xs font-bold tabular-nums",
                    row.qtyOnHand <= 0
                      ? "bg-[#fff6f6] text-[#c81e1e]"
                      : "bg-[#fff7ed] text-[#9a3412]",
                  )}
                >
                  {row.qtyOnHand} left
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#eef2f8] bg-[#f8fafc] px-3 py-2">
      <p className="text-[0.65rem] font-medium tracking-wide text-[#8a9bb0] uppercase">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-[#0b1f33]">
        {value}
      </p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  progress,
  href,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "up" | "warn" | "neutral";
  progress?: number;
  href?: string;
}) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.75rem] font-medium text-[#5a6b7d]">{label}</p>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#e8eefb] text-[#1a56db]">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-[#0b1f33]">
        {value}
      </p>
      <p
        className={cn(
          "mt-1 text-[0.75rem] font-medium",
          tone === "up" && "text-[#166534]",
          tone === "warn" && "text-[#c81e1e]",
          tone === "neutral" && "text-[#5a6b7d]",
        )}
      >
        {hint}
      </p>
      {typeof progress === "number" ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#eef2f7]">
          <div
            className="h-full rounded-full bg-[#1a56db]"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      ) : null}
    </>
  );

  const shell = cn(
    "flex h-full min-h-[7.5rem] flex-col rounded-[14px] border border-[#d9e0ea] bg-white p-4 shadow-[0_1px_2px_rgba(11,31,51,0.04)]",
    href && "transition hover:border-[#1a56db]/30 hover:shadow-sm",
  );

  if (href) {
    return (
      <Link href={href} className={shell}>
        {inner}
      </Link>
    );
  }
  return <div className={shell}>{inner}</div>;
}

function Donut({
  segments,
  center,
}: {
  segments: Array<{ pct: number; color: string }>;
  center: string;
}) {
  let acc = 0;
  const stops = segments
    .map((s) => {
      const start = acc;
      acc += s.pct;
      return `${s.color} ${start}% ${acc}%`;
    })
    .join(", ");

  return (
    <div
      className="relative h-[7.5rem] w-[7.5rem] shrink-0 rounded-full"
      style={{
        background: `conic-gradient(${stops || "#e8eefb 0% 100%"})`,
      }}
    >
      <div className="absolute inset-[18%] grid place-items-center rounded-full bg-white">
        <span className="text-center text-xs font-bold text-[#0b1f33]">
          {center}
        </span>
      </div>
    </div>
  );
}

function PriorityTag({ level }: { level: "HIGH" | "MEDIUM" | "LOW" }) {
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[0.65rem] font-bold tracking-wide",
        level === "HIGH" && "bg-[#fef2f2] text-[#c81e1e]",
        level === "MEDIUM" && "bg-[#e8eefb] text-[#1a56db]",
        level === "LOW" && "bg-[#f1f5f9] text-[#5a6b7d]",
      )}
    >
      {level}
    </span>
  );
}
