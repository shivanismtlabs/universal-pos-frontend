"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ordersApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { cn } from "@/lib/utils";

/**
 * Order history only — create tickets via Counter (POS checkout).
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
      (orders.data?.items ?? []).map((o) => o.kind).filter(Boolean),
    );
    commerceModes.forEach((m) => fromData.add(m));
    return ["all", ...[...fromData].sort()];
  }, [orders.data?.items, commerceModes]);

  const rows = (orders.data?.items ?? []).filter(
    (o) => kind === "all" || o.kind === kind,
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-2xl sm:text-3xl">Orders</h1>
          <p className="mt-1 text-sm text-[#5a6b7d]">
            History and filters. New orders are created at the Counter.
          </p>
        </div>
        <Link
          href="/pos"
          className="inline-flex h-10 items-center rounded-[10px] bg-[#1a56db] px-4 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(26,86,219,0.28)] hover:bg-[#1341a8]"
        >
          Open counter
        </Link>
      </header>

      <div
        role="tablist"
        className="inline-flex flex-wrap rounded-lg border border-[#d9e0ea] bg-[#eef2f7] p-0.5"
      >
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              "rounded-md px-3 py-1.5 text-[0.8125rem] font-semibold capitalize transition",
              kind === k
                ? "bg-white text-[#1a56db] shadow-sm"
                : "text-[#5a6b7d] hover:text-[#0b1f33]",
            )}
          >
            {k}
          </button>
        ))}
      </div>

      <section className="overflow-x-auto rounded-xl border border-[#d9e0ea] bg-white">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="border-b border-[#e8ebf0] text-[0.65rem] font-semibold tracking-wide text-[#8b9bb0] uppercase">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Kind</th>
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
                    className="text-[#0b1f33] hover:underline"
                  >
                    {o.orderNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 capitalize text-[#5a6b7d]">
                  {o.kind ?? "—"}
                </td>
                <td className="px-4 py-3 text-[#374151]">
                  {o.customer?.fullName ?? "—"}
                </td>
                <td className="px-4 py-3">{o.status}</td>
                <td className="px-4 py-3 tabular-nums">{money(o.balanceDue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && !orders.isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-[#5a6b7d]">
            No orders in this filter
          </p>
        ) : null}
      </section>
    </div>
  );
}
