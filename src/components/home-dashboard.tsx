"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  Package,
  Truck,
  Plus,
  LayoutGrid,
} from "lucide-react";
import {
  catalogApi,
  posApi,
  reportsApi,
} from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { ProductThumb } from "@/components/product-thumb";
import { TablePager } from "@/components/table-pager";
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
  const [ticketPage, setTicketPage] = useState(1);
  const ticketPageSize = 5;

  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(Date.now() - 6 * 86400000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return { from: iso(from), to: iso(to) };
  }, []);

  const sales = useQuery({
    queryKey: ["reports-sales-summary", range.from, range.to],
    queryFn: () => reportsApi.salesSummary(range.from, range.to),
  });
  const monthly = useQuery({
    queryKey: ["reports-monthly-home-spark"],
    queryFn: () => reportsApi.monthlySales({}),
  });
  const payments = useQuery({
    queryKey: ["reports-payments-summary", range.from, range.to],
    queryFn: () => reportsApi.paymentsSummary(range.from, range.to),
  });
  const recent = useQuery({
    queryKey: ["pos-sale-recent-home"],
    queryFn: () => posApi.listRecentSales(25),
    enabled: hasSale,
  });
  const floor = useQuery({
    queryKey: ["pos-sale-floor"],
    queryFn: () => posApi.saleFloor(),
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
    const days = (monthly.data?.daily ?? []).filter(
      (d) => Number(d.sales) > 0 || Number(d.orders) > 0,
    );
    const slice = days.slice(-7);
    if (!slice.length) return [];
    const max = Math.max(...slice.map((d) => Number(d.sales) || 0), 1);
    return slice.map((d) => {
      const salesN = Number(d.sales) || 0;
      return {
        label: d.date ? d.date.slice(8) : "",
        sales: salesN,
        orders: d.orders ?? 0,
        pct: Math.max(12, Math.round((salesN / max) * 100)),
      };
    });
  }, [monthly.data]);

  const payMethods = payments.data?.byMethod ?? [];
  const productPreview = (products.data?.items ?? []).slice(0, 8);
  const kindRows = (sales.data?.byKind ?? []).filter(
    (k) => moneyNum(k.subtotal) > 0 || k.count > 0,
  );
  const tickets = useMemo(() => {
    const raw = recent.data as unknown;
    if (Array.isArray(raw)) return raw as NonNullable<typeof recent.data>["items"];
    if (raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items)) {
      return (raw as { items: NonNullable<typeof recent.data>["items"] }).items;
    }
    return [];
  }, [recent.data]);
  const ticketPages = Math.max(1, Math.ceil(tickets.length / ticketPageSize));
  const ticketSlice = tickets.slice(
    (ticketPage - 1) * ticketPageSize,
    ticketPage * ticketPageSize,
  );

  const hasSalesActivity =
    orderCount > 0 ||
    tickets.length > 0 ||
    kindRows.length > 0 ||
    spark.some((b) => b.sales > 0);

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
          value={money(revenue)}
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

      {lens === "sales" && hasSalesActivity ? (
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

          <div
            className={cn(
              "mt-4 grid gap-4",
              spark.length ? "lg:grid-cols-[1.15fr_1fr]" : "",
            )}
          >
            {spark.length ? (
              <div className="rounded-lg border border-[#eef1f4] bg-[#fafbfc] px-3 pb-2 pt-3">
                <div className="flex h-36 items-end gap-1.5">
                  {spark.map((bar, i) => (
                    <div
                      key={`${bar.label}-${i}`}
                      className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
                    >
                      <span className="text-[0.6rem] tabular-nums text-[#6b7280]">
                        {bar.sales > 0 ? Math.round(bar.sales) : ""}
                      </span>
                      <div
                        className="w-full max-w-[1.75rem] rounded-t-sm bg-[#1a56db]"
                        style={{ height: `${bar.pct}%` }}
                        title={`${bar.label}: ${money(bar.sales)}`}
                      />
                      <span className="text-[0.65rem] tabular-nums text-[#8b9bb0]">
                        {bar.label}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-center text-[0.7rem] text-[#8b9bb0]">
                  Last 7 days · {orderCount} ticket{orderCount === 1 ? "" : "s"}
                </p>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-lg border border-[#eef1f4] bg-[#fafbfc]">
              {kindRows.length ? (
                <ul className="space-y-2 p-3">
                  {kindRows.map((row) => (
                    <ChannelRow
                      key={row.kind}
                      color={
                        row.kind === "sale"
                          ? "#1a56db"
                          : row.kind === "service"
                            ? "#16a34a"
                            : "#7c3aed"
                      }
                      label={
                        row.kind === "sale"
                          ? "Point of Sale"
                          : row.kind.charAt(0).toUpperCase() + row.kind.slice(1)
                      }
                      amount={money(moneyNum(row.subtotal))}
                      orders={row.count}
                    />
                  ))}
                </ul>
              ) : tickets.length ? (
                <>
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-[#e5e7eb] text-xs uppercase text-[#6b7280]">
                      <tr>
                        <th className="px-3 py-1.5 font-medium">Ticket</th>
                        <th className="px-3 py-1.5 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ticketSlice.map((t) => (
                        <tr
                          key={t.id}
                          className="border-b border-[#f3f4f6] last:border-0"
                        >
                          <td className="px-3 py-1.5">
                            <p className="font-medium text-[#111827]">
                              {t.orderNumber}
                            </p>
                            <p className="text-[0.7rem] text-[#8b9bb0]">
                              {t.customerName || "Walk-in"} · {t.itemCount} item
                              {t.itemCount === 1 ? "" : "s"}
                            </p>
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-[#0b1f33]">
                            {money(moneyNum(t.subtotal))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <TablePager
                    page={ticketPage}
                    totalPages={ticketPages}
                    total={tickets.length}
                    pageSize={ticketPageSize}
                    onPage={setTicketPage}
                  />
                </>
              ) : (
                <ul className="space-y-2 p-3">
                  <ChannelRow
                    color="#1a56db"
                    label="Point of Sale"
                    amount={money(revenue)}
                    orders={orderCount}
                  />
                </ul>
              )}
            </div>
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

      {hasSale && productPreview.length ? (
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
          ) : null}
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
