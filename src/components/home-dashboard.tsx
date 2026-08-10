"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Expand,
  Package,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { posApi, reportsApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { cn } from "@/lib/utils";

function moneyNum(v: string | number | undefined | null) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n: number) {
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

type DashLens = "sales" | "inventory" | "purchase";

/**
 * Zoho Home → Dashboard: lens pills + invoice / stock summary.
 */
export function HomeDashboard() {
  const { money, hasMode } = useBootstrap();
  const hasSale = hasMode("sale");
  const [lens, setLens] = useState<DashLens>("sales");

  const sales = useQuery({
    queryKey: ["reports-sales-summary"],
    queryFn: () => reportsApi.salesSummary(),
  });
  const payments = useQuery({
    queryKey: ["reports-payments-summary"],
    queryFn: () => reportsApi.paymentsSummary(),
  });
  const floor = useQuery({
    queryKey: ["pos-sale-floor"],
    queryFn: () => posApi.saleFloor(),
    enabled: hasSale,
  });
  const recent = useQuery({
    queryKey: ["pos-sale-recent-home-dash"],
    queryFn: () => posApi.listRecentSales(12),
    enabled: hasSale,
  });

  const revenue = moneyNum(sales.data?.totals?.subtotal);
  const orderCount = sales.data?.totals?.orderCount ?? 0;
  const products = floor.data?.counts?.products ?? 0;
  const inStock = floor.data?.counts?.inStock ?? 0;
  const stockRows = floor.data?.counts?.stockRows ?? 0;

  const spark = useMemo(() => {
    const vals = (recent.data?.items ?? [])
      .slice(0, 7)
      .reverse()
      .map((o) => moneyNum(o.subtotal));
    if (vals.length < 2) return null;
    const max = Math.max(...vals, 1);
    return vals.map((v) => Math.max(4, Math.round((v / max) * 100)));
  }, [recent.data]);

  const payMethods = payments.data?.byMethod ?? [];
  const channels = [
    {
      key: "pos",
      label: "Point of Sale",
      color: "#1a56db",
      amount: revenue,
      orders: orderCount,
    },
    {
      key: "commerce",
      label: "Other channels",
      color: "#16a34a",
      amount: 0,
      orders: 0,
    },
    {
      key: "direct",
      label: "Store credit / adjustments",
      color: "#7c3aed",
      amount: 0,
      orders: 0,
    },
  ];

  const lenses: Array<{ id: DashLens; label: string; show: boolean }> = [
    { id: "sales", label: "Sales", show: true },
    { id: "inventory", label: "Inventory", show: hasSale },
    { id: "purchase", label: "Purchase", show: hasSale },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {lenses
            .filter((l) => l.show)
            .map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLens(l.id)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-[0.8rem] font-semibold transition",
                  lens === l.id
                    ? "bg-[#1a56db] text-white shadow-sm"
                    : "bg-white text-[#5a6b7d] ring-1 ring-[#d9e0ea] hover:text-[#0b1f33]",
                )}
              >
                {l.label}
              </button>
            ))}
        </div>
        <span className="rounded-md border border-[#d9e0ea] bg-white px-2.5 py-1 text-[0.75rem] font-medium text-[#5a6b7d]">
          This period
        </span>
      </div>

      {lens === "sales" ? (
        <section className="rounded-xl border border-[#d9e0ea] bg-white p-5 shadow-[0_1px_2px_rgba(11,31,51,0.04)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-[0.95rem] font-semibold text-[#0b1f33]">
                Invoice Summary
              </h2>
              <Expand className="h-3.5 w-3.5 text-[#8b9bb0]" />
            </div>
            <Link
              href="/reports"
              className="text-[0.75rem] font-semibold text-[#1a56db] hover:underline"
            >
              Full reports
            </Link>
          </div>

          <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_14rem]">
            <div>
              <p className="text-[0.8rem] font-medium text-[#5a6b7d]">
                Total Sales
              </p>
              <p className="mt-1 text-[1.75rem] font-semibold tracking-tight text-[#0b1f33] sm:text-[2rem]">
                {formatMoney(revenue)}
              </p>

              <div className="relative mt-6 h-44 rounded-lg border border-[#eef1f4] bg-[#fafbfc]">
                {spark ? (
                  <div className="flex h-full items-end gap-2 px-4 pb-4 pt-8">
                    {spark.map((h, i) => (
                      <div
                        key={i}
                        className="flex flex-1 flex-col items-center justify-end"
                      >
                        <div
                          className="w-full max-w-[2rem] rounded-t-sm bg-[#1a56db]/80"
                          style={{ height: `${h}%` }}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid h-full place-items-center px-6 text-center">
                    <div>
                      <ShoppingBag className="mx-auto h-8 w-8 text-[#cfd8e6]" />
                      <p className="mt-3 text-[0.85rem] text-[#5a6b7d]">
                        No sales invoices were created during this period.
                      </p>
                      <Link
                        href="/counter"
                        className="mt-2 inline-block text-[0.8rem] font-semibold text-[#1a56db] hover:underline"
                      >
                        Open counter →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <ul className="space-y-4 border-t border-[#eef1f4] pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
              {channels.map((c) => (
                <li key={c.key}>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: c.color }}
                    />
                    <span className="text-[0.8rem] font-medium text-[#0b1f33]">
                      {c.label}
                    </span>
                  </div>
                  <p className="mt-1 pl-4 text-[0.95rem] font-semibold tabular-nums text-[#0b1f33]">
                    {formatMoney(c.amount)}
                  </p>
                  <p className="pl-4 text-[0.72rem] text-[#8b9bb0]">
                    {c.orders} Order{c.orders === 1 ? "" : "s"}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {payMethods.length ? (
            <div className="mt-6 border-t border-[#eef1f4] pt-4">
              <p className="text-[0.75rem] font-semibold tracking-wide text-[#8b9bb0] uppercase">
                Payments
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                {payMethods.map((m) => (
                  <span
                    key={m.method}
                    className="rounded-md bg-[#f4f6fa] px-2.5 py-1 text-[0.78rem] text-[#2c3e50]"
                  >
                    <span className="capitalize">{m.method}</span>
                    <span className="ml-1.5 font-semibold tabular-nums">
                      {money(m.amount)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {lens === "inventory" ? (
        <section className="rounded-xl border border-[#d9e0ea] bg-white p-5 shadow-[0_1px_2px_rgba(11,31,51,0.04)] sm:p-6">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-[#1a56db]" />
            <h2 className="text-[0.95rem] font-semibold text-[#0b1f33]">
              Inventory Summary
            </h2>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Stat label="Products" value={String(products)} />
            <Stat label="In-stock SKUs" value={String(inStock)} />
            <Stat label="Stock rows" value={String(stockRows)} />
          </div>
          <div className="mt-5">
            <Link
              href="/catalog"
              className="text-[0.8rem] font-semibold text-[#1a56db] hover:underline"
            >
              Manage products →
            </Link>
          </div>
        </section>
      ) : null}

      {lens === "purchase" ? (
        <section className="rounded-xl border border-[#d9e0ea] bg-white p-5 shadow-[0_1px_2px_rgba(11,31,51,0.04)] sm:p-6">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-[#1a56db]" />
            <h2 className="text-[0.95rem] font-semibold text-[#0b1f33]">
              Purchase Summary
            </h2>
          </div>
          <p className="mt-4 text-[0.875rem] text-[#5a6b7d]">
            Record bills and orders from suppliers to restock inventory.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/suppliers"
              className="rounded-md bg-[#1a56db] px-3.5 py-2 text-[0.8rem] font-semibold text-white"
            >
              Suppliers
            </Link>
            <Link
              href="/catalog"
              className="rounded-md border border-[#1a56db] px-3.5 py-2 text-[0.8rem] font-semibold text-[#1a56db]"
            >
              View stock
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#eef1f4] bg-[#fafbfc] px-4 py-3">
      <p className="text-[0.72rem] font-medium text-[#8b9bb0]">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-[#0b1f33]">
        {value}
      </p>
    </div>
  );
}
