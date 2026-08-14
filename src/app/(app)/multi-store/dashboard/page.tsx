"use client";

/**
 * HQ Multi-store dashboard — rollup + per-branch today KPIs.
 * Branch detail uses current branch from shell selector.
 */
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Building2, ArrowRightLeft, Store } from "lucide-react";
import { tenantsApi } from "@/lib/api";
import { useBranchStore } from "@/lib/branch-store";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PageSkeleton } from "@/components/page-header";

function formatInr(n: number) {
  if (n >= 1_000_000) return `₹${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function MultiStoreDashboardPage() {
  const { money } = useBootstrap();
  const branchId = useBranchStore((s) => s.currentLocationId);
  const setBranch = useBranchStore((s) => s.setCurrentLocationId);

  const hq = useQuery({
    queryKey: ["multi-store-dashboard"],
    queryFn: () => tenantsApi.multiStoreDashboard(),
  });

  const branch = useQuery({
    queryKey: ["branch-dashboard", branchId],
    queryFn: () => tenantsApi.branchDashboard(branchId!),
    enabled: Boolean(branchId),
  });

  if (hq.isLoading) return <PageSkeleton />;

  const byBranch = hq.data?.byBranch ?? [];
  const maxSales = Math.max(1, ...byBranch.map((b) => b.todaySales));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#eef1f4] pb-3">
        <div>
          <p className="text-[0.65rem] font-bold tracking-[0.12em] text-[#1a56db] uppercase">
            Multi-store
          </p>
          <h1 className="mt-0.5 text-[1.4rem] font-semibold text-[#0b1f33]">
            Multi-store dashboard
          </h1>
          <p className="mt-0.5 text-[0.8rem] text-[#5a6b7d]">
            All branches today · switch operating branch from the top bar
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link href="/stores">
              <Store className="mr-1 size-4" />
              Manage stores
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/transfers">
              <ArrowRightLeft className="mr-1 size-4" />
              Stock transfers
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total stores"
          value={String(hq.data?.totalStores ?? 0)}
        />
        <StatCard
          label="Active stores"
          value={String(hq.data?.activeStores ?? 0)}
        />
        <StatCard
          label="Today sales (all)"
          value={formatInr(hq.data?.today.salesTotal ?? 0)}
        />
        <StatCard
          label="Today orders (all)"
          value={String(hq.data?.today.orders ?? 0)}
        />
      </div>

      {branch.data ? (
        <section className="rounded-xl border border-[#d9e0ea] bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <Building2 className="size-4 text-[#1a56db]" />
            <h2 className="text-sm font-semibold text-[#0b1f33]">
              Current branch · {branch.data.branch.name}
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Mini
              label="Sales"
              value={formatInr(branch.data.today.salesTotal)}
            />
            <Mini label="Orders" value={String(branch.data.today.orders)} />
            <Mini
              label="Refunds"
              value={String(branch.data.today.refunds)}
            />
            <Mini
              label="Expenses"
              value={formatInr(branch.data.today.expensesTotal)}
            />
            <Mini
              label="Inventory value"
              value={formatInr(branch.data.inventory.value)}
            />
            <Mini
              label="Low stock"
              value={String(branch.data.inventory.lowStock)}
            />
            <Mini
              label="Out of stock"
              value={String(branch.data.inventory.outOfStock)}
            />
            <Mini
              label="Register"
              value={branch.data.registerOpen ? "Open" : "Closed"}
            />
          </div>
        </section>
      ) : (
        <p className="text-sm text-[#8a9bb0]">
          Select a branch in the top bar to see branch-level KPIs.
        </p>
      )}

      <section className="overflow-hidden rounded-xl border border-[#d9e0ea] bg-white">
        <div className="border-b border-[#eef2f8] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#0b1f33]">
            Store comparison · today
          </h2>
        </div>
        {byBranch.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[#8a9bb0]">
            No active branches yet.{" "}
            <Link href="/stores" className="font-medium text-[#1a56db]">
              Add a store
            </Link>
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-[#f8fafc] text-[0.7rem] tracking-wide text-[#8a9bb0] uppercase">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Branch</th>
                <th className="px-4 py-2.5 font-semibold">Orders</th>
                <th className="px-4 py-2.5 font-semibold">Sales</th>
                <th className="hidden px-4 py-2.5 font-semibold sm:table-cell">
                  Share
                </th>
                <th className="px-4 py-2.5 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {byBranch.map((b) => (
                <tr
                  key={b.locationId}
                  className={cn(
                    "border-t border-[#eef2f8]",
                    branchId === b.locationId && "bg-[#eff6ff]",
                  )}
                >
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-[#0b1f33]">{b.name}</div>
                    <div className="font-mono text-[0.7rem] text-[#8a9bb0]">
                      {b.code}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{b.todayOrders}</td>
                  <td className="px-4 py-2.5 tabular-nums font-medium">
                    {money(b.todaySales)}
                  </td>
                  <td className="hidden px-4 py-2.5 sm:table-cell">
                    <div className="h-1.5 w-28 overflow-hidden rounded-full bg-[#eef2f8]">
                      <div
                        className="h-full rounded-full bg-[#1a56db]"
                        style={{
                          width: `${Math.round((b.todaySales / maxSales) * 100)}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant={
                        branchId === b.locationId ? "default" : "outline"
                      }
                      onClick={() => setBranch(b.locationId)}
                    >
                      {branchId === b.locationId ? "Current" : "Use"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#d9e0ea] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
      <p className="text-[0.65rem] font-medium tracking-wide text-[#8a9bb0] uppercase">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-[#0b1f33]">
        {value}
      </p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#eef2f8] bg-[#f8fafc] px-3 py-2">
      <p className="text-[0.65rem] text-[#8a9bb0]">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-[#0b1f33]">{value}</p>
    </div>
  );
}
