"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ordersApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ModeBadge } from "@/components/mode-badge";
import {
  EmptyState,
  PageHeader,
  PageSkeleton,
} from "@/components/page-header";

/**
 * All orders — read-only history. Create tickets only at the counter.
 */
export default function OrdersPage() {
  const { money, commerceModes } = useBootstrap();
  const [kind, setKind] = useState<string>("all");

  const orders = useQuery({
    queryKey: ["orders"],
    queryFn: () => ordersApi.list({ limit: 80 }),
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

  if (orders.isLoading) {
    return <PageSkeleton rows={6} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="All orders"
        subtitle="History and lookup only — new orders are created at the counter, not here."
        action={
          <Button asChild>
            <Link href="/pos">Open counter</Link>
          </Button>
        }
      />

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

      {!rows.length ? (
        <EmptyState
          title="No orders yet"
          detail="Orders appear here after you check out at the counter. There is no create button on this page."
          action={
            <Button asChild>
              <Link href="/pos">Open counter</Link>
            </Button>
          }
        />
      ) : (
        <section className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
          <table className="w-full min-w-[560px] text-left text-body">
            <thead className="border-b border-[var(--line)] text-caption font-medium tracking-wide text-[var(--muted)] uppercase">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f3f7]">
              {rows.map((o) => (
                <tr key={o.id} className="hover:bg-[#f7f9fc]">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/orders/${o.id}`}
                      className="text-[var(--ink)] hover:underline"
                    >
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <ModeBadge mode={o.kind} />
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {o.customer?.fullName ?? "—"}
                  </td>
                  <td className="px-4 py-3 capitalize">{o.status}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {money(o.balanceDue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
