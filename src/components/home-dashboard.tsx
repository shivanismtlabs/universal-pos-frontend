"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  Package,
  ShoppingBag,
  Truck,
  Plus,
  LayoutGrid,
} from "lucide-react";
import { catalogApi, posApi, reportsApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { ProductThumb } from "@/components/product-thumb";
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
 * Zoho Home → Dashboard: denser summary + product strip + quick links.
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
  const products = useQuery({
    queryKey: ["catalog-products-home"],
    queryFn: () => catalogApi.listProducts({ status: "active" }),
    enabled: hasSale,
  });

  const revenue = moneyNum(sales.data?.totals?.subtotal);
  const orderCount = sales.data?.totals?.orderCount ?? 0;
  const productCount = floor.data?.counts?.products ?? 0;
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
  const productPreview = (products.data?.items ?? []).slice(0, 8);

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
                    : "bg-white text-[#5a6b7d] ring-1 ring-[#e4e9f0] hover:text-[#0b1f33]",
                )}
              >
                {l.label}
              </button>
            ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button asChild size="sm" variant="ghost">
            <Link href="/counter">Open counter</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/transfers">Stock transfer</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/catalog/new">
              <Plus className="size-3.5" />
              Add item
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Sales (period)"
          value={formatMoney(revenue)}
          hint={`${orderCount} order${orderCount === 1 ? "" : "s"}`}
        />
        <Kpi
          label="Catalog items"
          value={String(productCount)}
          hint="Active definitions"
        />
        <Kpi
          label="In stock SKUs"
          value={String(inStock)}
          hint={`${stockRows} stock rows`}
        />
        <Kpi
          label="Payments"
          value={String(payMethods.length)}
          hint={
            payMethods[0]
              ? `${payMethods[0].method} · ${money(payMethods[0].amount)}`
              : "No tender yet"
          }
        />
      </div>

      {lens === "sales" ? (
        <section className="rounded-xl border border-[#e4e9f0] bg-white p-4 shadow-[0_1px_2px_rgba(11,31,51,0.04)] sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-[0.95rem] font-semibold text-[#0b1f33]">
                Sales overview
              </h2>
              <p className="mt-0.5 text-[0.75rem] text-[#8b9bb0]">
                Period totals from closed tickets
              </p>
            </div>
            <Link
              href="/reports"
              className="text-[0.75rem] font-semibold text-[#1a56db] hover:underline"
            >
              Full reports
            </Link>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="relative h-40 overflow-hidden rounded-lg border border-[#eef1f4] bg-[#fafbfc]">
              {spark ? (
                <div className="flex h-full items-end gap-1.5 px-3 pb-3 pt-6">
                  {spark.map((h, i) => (
                    <div
                      key={i}
                      className="flex flex-1 flex-col items-center justify-end"
                    >
                      <div
                        className="w-full max-w-[1.75rem] rounded-t-sm bg-[#1a56db]/85"
                        style={{ height: `${h}%` }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid h-full place-items-center px-4 text-center">
                  <div>
                    <ShoppingBag className="mx-auto h-7 w-7 text-[#cfd8e6]" />
                    <p className="mt-2 text-[0.8rem] text-[#5a6b7d]">
                      No sales in this period yet.
                    </p>
                    <Link
                      href="/counter"
                      className="mt-1 inline-block text-[0.78rem] font-semibold text-[#1a56db] hover:underline"
                    >
                      Open counter →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <ul className="space-y-3 rounded-lg border border-[#eef1f4] bg-[#fafbfc] p-3">
              <ChannelRow
                color="#1a56db"
                label="Point of Sale"
                amount={formatMoney(revenue)}
                orders={orderCount}
              />
              <ChannelRow
                color="#16a34a"
                label="Other channels"
                amount={formatMoney(0)}
                orders={0}
              />
              <ChannelRow
                color="#7c3aed"
                label="Store credit"
                amount={formatMoney(0)}
                orders={0}
              />
            </ul>
          </div>
        </section>
      ) : null}

      {lens === "inventory" ? (
        <section className="rounded-xl border border-[#e4e9f0] bg-white p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-[#1a56db]" />
            <h2 className="text-[0.95rem] font-semibold text-[#0b1f33]">
              Inventory shortcuts
            </h2>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <QuickLink href="/catalog" icon={LayoutGrid} label="Items" />
            <QuickLink href="/inventory" icon={Package} label="Stock levels" />
            <QuickLink
              href="/transfers"
              icon={ArrowRightLeft}
              label="Stock transfer"
            />
            <QuickLink href="/adjustments" icon={Truck} label="Adjustments" />
          </div>
        </section>
      ) : null}

      {lens === "purchase" ? (
        <section className="rounded-xl border border-[#e4e9f0] bg-white p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-[#1a56db]" />
            <h2 className="text-[0.95rem] font-semibold text-[#0b1f33]">
              Purchases
            </h2>
          </div>
          <p className="mt-3 text-[0.85rem] text-[#5a6b7d]">
            Receive stock from suppliers and keep on-hand accurate for any shop
            type.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/suppliers">Suppliers & POs</Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href="/transfers">Stock transfer list</Link>
            </Button>
          </div>
        </section>
      ) : null}

      {hasSale ? (
        <section className="rounded-xl border border-[#e4e9f0] bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[0.95rem] font-semibold text-[#0b1f33]">
                Product gallery
              </h2>
              <p className="text-[0.75rem] text-[#8b9bb0]">
                Recent catalog items with cover images
              </p>
            </div>
            <Button asChild size="sm" variant="ghost">
              <Link href="/catalog">All items</Link>
            </Button>
          </div>

          {productPreview.length ? (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {productPreview.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/catalog/view?id=${p.id}`}
                    className="flex items-center gap-3 rounded-xl border border-[#eef1f4] bg-[#fafbfc] p-2.5 transition hover:border-[#c5d0e0] hover:bg-white"
                  >
                    <ProductThumb
                      src={p.photoUrl || p.images?.[0]}
                      label={p.name}
                      size="lg"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#0b1f33]">
                        {p.name}
                      </p>
                      <p className="truncate font-mono text-[0.7rem] text-[#8b9bb0]">
                        {p.skuCode}
                      </p>
                      <p className="mt-0.5 text-sm font-bold tabular-nums text-[#1341a8]">
                        {formatMoney(Number(p.basePrice))}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-[#d9e0ea] bg-[#fafbfc] px-4 py-6">
              <div>
                <p className="text-sm font-semibold text-[#0b1f33]">
                  No products yet
                </p>
                <p className="mt-0.5 text-[0.8rem] text-[#5a6b7d]">
                  Add items with photos so they show on the counter and home.
                </p>
              </div>
              <Button asChild>
                <Link href="/catalog/new">Add products</Link>
              </Button>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-[#e4e9f0] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(11,31,51,0.03)]">
      <p className="text-[0.7rem] font-semibold tracking-wide text-[#8b9bb0] uppercase">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-[#0b1f33]">
        {value}
      </p>
      <p className="mt-0.5 text-[0.72rem] text-[#5a6b7d]">{hint}</p>
    </div>
  );
}

function ChannelRow({
  color,
  label,
  amount,
  orders,
}: {
  color: string;
  label: string;
  amount: string;
  orders: number;
}) {
  return (
    <li>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="text-[0.8rem] font-medium text-[#0b1f33]">{label}</span>
      </div>
      <p className="mt-0.5 pl-4 text-[0.95rem] font-semibold tabular-nums text-[#0b1f33]">
        {amount}
      </p>
      <p className="pl-4 text-[0.7rem] text-[#8b9bb0]">
        {orders} order{orders === 1 ? "" : "s"}
      </p>
    </li>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Package;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-xl border border-[#eef1f4] bg-[#fafbfc] px-3 py-3 text-sm font-semibold text-[#0b1f33] transition hover:border-[#c5d0e0] hover:bg-white"
    >
      <Icon className="size-4 text-[#1a56db]" />
      {label}
    </Link>
  );
}
