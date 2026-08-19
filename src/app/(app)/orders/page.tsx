"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ordersApi, posApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModeBadge } from "@/components/mode-badge";
import {
  EmptyState,
  PageHeader,
  PageSkeleton,
} from "@/components/page-header";
import { ReceiptModal, type ReceiptData } from "@/components/receipt-modal";
import { TablePager } from "@/components/table-pager";
import { usePagedList } from "@/lib/use-paged-list";

/**
 * All orders — read-only history. Create tickets only at the counter.
 * Print receipt available without leaving this page.
 */
export default function OrdersPage() {
  const { money, commerceModes } = useBootstrap();
  const [kind, setKind] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [receiptOrderId, setReceiptOrderId] = useState<string | null>(null);

  const orders = useQuery({
    queryKey: ["orders", appliedQ],
    queryFn: () =>
      ordersApi.list({
        limit: 80,
        ...(appliedQ ? { q: appliedQ } : {}),
      }),
  });

  const receiptQ = useQuery({
    queryKey: ["order-receipt", receiptOrderId],
    queryFn: () => posApi.receipt(receiptOrderId!),
    enabled: Boolean(receiptOrderId),
  });

  const kinds = useMemo(() => {
    const fromData = new Set(
      (orders.data?.items ?? []).map((o) => o.kind).filter(Boolean) as string[],
    );
    commerceModes.forEach((m) => fromData.add(m));
    return ["all", ...[...fromData].sort()];
  }, [orders.data?.items, commerceModes]);

  const rows = (orders.data?.items ?? []).filter(
    (o) => kind === "all" || o.kind === kind,
  );
  const paged = usePagedList(rows, 20);

  if (orders.isLoading) {
    return <PageSkeleton rows={6} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="All orders"
        subtitle="View completed sales and look up tickets. Create new sales at the counter."
        action={
          <Button asChild>
            <Link href="/counter">Open counter</Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div
          role="tablist"
          className="inline-flex flex-wrap rounded-lg border border-[var(--line)] bg-[#eef2f7] p-0.5"
        >
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "rounded-md px-3 py-1.5 text-[0.8125rem] font-medium capitalize transition",
                kind === k
                  ? "bg-white text-[#1a56db] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--ink)]",
              )}
            >
              {k === "all" ? "All" : k}
            </button>
          ))}
        </div>
        <form
          className="flex min-w-[220px] flex-1 flex-wrap items-end gap-2 sm:max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            setAppliedQ(search.trim());
          }}
        >
          <div className="min-w-0 flex-1">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product or customer…"
              aria-label="Search product or customer"
            />
          </div>
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
          {appliedQ ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setSearch("");
                setAppliedQ("");
              }}
            >
              Clear
            </Button>
          ) : null}
        </form>
      </div>

      {!rows.length ? (
        <EmptyState
          title={appliedQ ? "No matching orders" : "No orders yet"}
          detail={
            appliedQ
              ? "Try another product name, customer, or order number."
              : "Orders appear here after you check out at the counter. There is no create button on this page."
          }
          action={
            <Button asChild>
              <Link href="/counter">Open counter</Link>
            </Button>
          }
        />
      ) : (
        <section className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
          <table className="w-full min-w-[760px] text-left text-body">
            <thead className="border-b border-[var(--line)] text-caption font-medium tracking-wide text-[var(--muted)] uppercase">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Products</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Balance</th>
                <th className="px-4 py-3 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f3f7]">
              {paged.slice.map((o) => (
                <tr key={o.id} className="hover:bg-[#f7f9fc]">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/orders/view?id=${o.id}`}
                      className="text-[var(--ink)] hover:underline"
                    >
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <ModeBadge mode={o.kind} />
                  </td>
                  <td className="max-w-[220px] px-4 py-3 text-[var(--muted)]">
                    <p className="line-clamp-2 text-sm text-[var(--ink)]">
                      {o.productSummary ||
                        (o.productNames?.length
                          ? o.productNames.join(", ")
                          : "—")}
                    </p>
                    {o.itemCount != null && o.itemCount > 0 ? (
                      <p className="text-xs text-[var(--muted)]">
                        {o.itemCount} item{o.itemCount === 1 ? "" : "s"}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {o.customer?.fullName ?? "—"}
                  </td>
                  <td className="px-4 py-3 capitalize">{o.status}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {money(o.balanceDue)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setReceiptOrderId(o.id)}
                    >
                      Print
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePager {...paged.pagerProps} />
        </section>
      )}

      {receiptOrderId ? (
        <ReceiptModal
          data={(receiptQ.data as ReceiptData | undefined) ?? null}
          loading={receiptQ.isLoading}
          change={receiptQ.data?.change}
          cashTendered={receiptQ.data?.cashTendered}
          onClose={() => setReceiptOrderId(null)}
        />
      ) : null}
    </div>
  );
}
