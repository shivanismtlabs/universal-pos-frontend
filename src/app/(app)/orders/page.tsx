"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ordersApi, posApi } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { useBootstrap } from "@/lib/bootstrap";
import { useBranchStore } from "@/lib/branch-store";
import { resolveOperatingLocationId } from "@/lib/operating-location";
import { modeLabel } from "@/lib/mode-colors";
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
import { pagerFromMeta } from "@/lib/use-paged-list";

function orderGrandTotal(o: {
  subtotal?: string | number | null;
  taxTotal?: string | number | null;
  discountTotal?: string | number | null;
}) {
  const sub = Number(o.subtotal ?? 0);
  const tax = Number(o.taxTotal ?? 0);
  const disc = Number(o.discountTotal ?? 0);
  const n = sub + tax - disc;
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/**
 * All orders — read-only history. Create tickets only at the counter.
 * Print receipt available without leaving this page.
 */
export default function OrdersPage() {
  const { money, commerceModes, data: boot } = useBootstrap();
  const authStoreId = useAuthStore((s) => s.user?.storeId);
  const currentLocationId = useBranchStore((s) => s.currentLocationId);
  const locationId = resolveOperatingLocationId({
    currentLocationId,
    locations: boot?.locations,
    authStoreId,
  });

  const [kind, setKind] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [receiptOrderId, setReceiptOrderId] = useState<string | null>(null);

  const orders = useQuery({
    queryKey: ["orders", appliedQ, kind, page, locationId],
    queryFn: () =>
      ordersApi.list({
        page,
        limit: pageSize,
        ...(appliedQ ? { q: appliedQ } : {}),
        ...(kind !== "all" ? { kind } : {}),
        ...(locationId ? { locationId } : {}),
      }),
    placeholderData: (prev) => prev,
  });

  const receiptQ = useQuery({
    queryKey: ["order-receipt", receiptOrderId],
    queryFn: () => posApi.receipt(receiptOrderId!),
    enabled: Boolean(receiptOrderId),
  });

  useEffect(() => {
    setPage(1);
  }, [appliedQ, kind, locationId]);

  /** Stable tabs from shop modes — not from the current page of rows. */
  const kinds = useMemo(() => {
    const modes = commerceModes.length
      ? commerceModes
      : ["sale", "rental", "service", "subscription"];
    return ["all", ...modes];
  }, [commerceModes]);

  useEffect(() => {
    if (kind !== "all" && !kinds.includes(kind)) {
      setKind("all");
    }
  }, [kind, kinds]);

  const rows = orders.data?.items ?? [];
  const meta = orders.data?.meta;

  if (orders.isLoading && !orders.data) {
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
          aria-label="Order mode"
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
                "rounded-md px-3 py-1.5 text-[0.8125rem] font-medium transition",
                kind === k
                  ? "bg-white text-[#1a56db] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--ink)]",
              )}
            >
              {k === "all" ? "All" : modeLabel(k)}
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
          <table className="w-full min-w-[860px] text-left text-body">
            <thead className="border-b border-[var(--line)] text-caption font-medium tracking-wide text-[var(--muted)] uppercase">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Products</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f3f7]">
              {rows.map((o) => {
                const total = orderGrandTotal(o);
                const balance = Number(o.balanceDue ?? 0);
                return (
                  <tr key={o.id} className="hover:bg-[#f7f9fc]">
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/orders/view?id=${o.id}`}
                        className="text-[var(--ink)] hover:underline"
                      >
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[0.8125rem] text-[var(--muted)]">
                      {o.createdAt
                        ? new Date(o.createdAt).toLocaleString()
                        : "—"}
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
                    <td className="px-4 py-3 capitalize">
                      {o.rentalExt?.lifecycle
                        ? String(o.rentalExt.lifecycle).replace(/_/g, " ")
                        : String(o.status ?? "").replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-[#0b1f33]">
                      {money(total)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--muted)]">
                      {balance > 0.009 ? money(balance) : "Paid"}
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
                );
              })}
            </tbody>
          </table>
          <TablePager
            {...pagerFromMeta(meta, page, pageSize, setPage, rows.length)}
          />
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
