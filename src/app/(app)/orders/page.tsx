"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ordersApi, paymentsApi, posApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { useBootstrap } from "@/lib/bootstrap";
import { useBranchStore } from "@/lib/branch-store";
import { resolveOperatingLocationId } from "@/lib/operating-location";
import { modeLabel } from "@/lib/mode-colors";
import { cn, newIdempotencyKey } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
 * All orders — view sales and collect due balances.
 * Print receipt available without leaving this page.
 */
export default function OrdersPage() {
  const qc = useQueryClient();
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

  const [payOrder, setPayOrder] = useState<{
    id: string;
    orderNumber: string;
    balanceDue: number;
  } | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");

  const collectPay = useMutation({
    mutationFn: () =>
      paymentsApi.create({
        orderId: payOrder!.id,
        amount: Number(payAmount),
        method: payMethod,
        type: "payment",
        idempotencyKey: newIdempotencyKey("collect-due"),
      }),
    onSuccess: () => {
      toast.success("Payment collected successfully!");
      setPayOrder(null);
      void qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Payment failed",
      ),
  });

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
                    <td className="px-4 py-3 text-right tabular-nums">
                      {balance > 0.009 ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-semibold text-[#dc2626]">
                            {money(balance)}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            className="h-6 px-2 text-[0.7rem] font-semibold bg-[#16a34a] hover:bg-[#15803d] text-white shadow-sm"
                            onClick={() => {
                              setPayOrder({
                                id: o.id,
                                orderNumber: o.orderNumber,
                                balanceDue: balance,
                              });
                              setPayAmount(String(balance));
                              setPayMethod("cash");
                            }}
                          >
                            Pay Due
                          </Button>
                        </div>
                      ) : (
                        <span className="inline-flex rounded-md bg-[#dcfce7] px-2 py-0.5 text-xs font-semibold text-[#15803d]">
                          Paid
                        </span>
                      )}
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

      {payOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-3">
              <h3 className="text-base font-bold text-[#0b1f33]">
                Collect Due Balance — {payOrder.orderNumber}
              </h3>
              <button
                type="button"
                className="text-[#6b7280] hover:text-[#0b1f33] text-sm font-bold"
                onClick={() => setPayOrder(null)}
              >
                ✕
              </button>
            </div>

            <div className="rounded-lg bg-[#fee2e2] p-3 text-xs space-y-1 text-[#991b1b]">
              <div className="flex justify-between font-bold text-sm">
                <span>Unpaid Balance Due:</span>
                <span>{money(payOrder.balanceDue)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label>Amount to Collect</Label>
                <Input
                  className="mt-1"
                  type="number"
                  inputMode="decimal"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </div>
              <div>
                <Label>Payment Method</Label>
                <Select
                  className="mt-1 w-full"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="upi">UPI / Online</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPayOrder(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-[#16a34a] hover:bg-[#15803d] text-white"
                disabled={collectPay.isPending || !Number(payAmount)}
                onClick={() => collectPay.mutate()}
              >
                {collectPay.isPending ? "Collecting…" : "Confirm Payment"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

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
