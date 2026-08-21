"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { restaurantApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export default function RestaurantDashboardPage() {
  const { hasCapability } = useBootstrap();
  const allowed =
    hasCapability("TABLE") ||
    hasCapability("KOT") ||
    hasCapability("KITCHEN") ||
    hasCapability("CAPTAIN") ||
    hasCapability("RECIPE") ||
    hasCapability("WASTAGE");

  const tables = useQuery({
    queryKey: ["restaurant-tables"],
    queryFn: () => restaurantApi.tables(),
    enabled: allowed,
    refetchInterval: 15_000,
  });
  const kots = useQuery({
    queryKey: ["restaurant-kots"],
    queryFn: () => restaurantApi.kots(),
    enabled: allowed && (hasCapability("KOT") || hasCapability("KITCHEN")),
    refetchInterval: 10_000,
  });

  const rows = tables.data ?? [];
  const occupied = rows.filter((t) => t.status === "occupied").length;
  const available = rows.filter((t) => t.status === "available").length;
  const openKots = (kots.data ?? []).filter(
    (k) => k.status !== "served" && k.status !== "cancelled",
  );

  if (!allowed) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-[#0b1f33]">Dining</h1>
        <p className="mt-2 text-sm text-[#5a6b7d]">
          Enable Tables or KOT in Settings → Capabilities. Retail, rental, and
          service shops are unchanged.
        </p>
        <Link href="/settings/capabilities" className="mt-3 inline-block text-sm text-[#1a56db]">
          Open capabilities
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Dining pack"
        title="Restaurant floor"
        subtitle="Tables, KOT, and billing on the same Universal POS order and payment engines. Inventory deducts once at checkout — never on KOT."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/restaurant/tables">Tables</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/kitchen">Kitchen / KOT</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/counter">New order</Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Available tables" value={String(available)} />
        <Kpi label="Occupied" value={String(occupied)} />
        <Kpi label="Open KOTs" value={String(openKots.length)} />
        <Kpi
          label="Delayed / critical"
          value={String(
            openKots.filter((k) => k.aging !== "waiting").length,
          )}
        />
      </div>

      <section className="rounded-xl border border-[#e2e8f0] bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#0b1f33]">Live tables</h2>
          <Link href="/restaurant/tables" className="text-xs font-semibold text-[#1a56db]">
            Floor map
          </Link>
        </div>
        {!rows.length ? (
          <p className="mt-3 text-sm text-[#5a6b7d]">
            No dining tables yet. Create a floor and tables in Setup.
          </p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {rows.slice(0, 10).map((t) => (
              <li
                key={t.id}
                className="rounded-lg border border-[#e2e8f0] px-3 py-2"
              >
                <p className="text-sm font-semibold text-[#0b1f33]">{t.name}</p>
                <p className="text-[0.7rem] uppercase tracking-wide text-[#8b9bb0]">
                  {t.status}
                  {t.orderNumber ? ` · ${t.orderNumber}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-3 text-sm">
        {hasCapability("RECIPE") ? (
          <Link href="/restaurant/recipes" className="font-semibold text-[#1a56db]">
            Recipes
          </Link>
        ) : null}
        {hasCapability("WASTAGE") ? (
          <Link href="/restaurant/wastage" className="font-semibold text-[#1a56db]">
            Wastage
          </Link>
        ) : null}
        {hasCapability("RECIPE") ? (
          <Link href="/restaurant/food-cost" className="font-semibold text-[#1a56db]">
            Food cost
          </Link>
        ) : null}
      </div>

      <p className="text-xs text-[#8b9bb0]">
        QR ordering, aggregators, AI, and voice are later phases. Grocery and
        salon tenants never see dining unless those capabilities are on.
      </p>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-white px-4 py-3">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#8b9bb0]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[#0b1f33]">
        {value}
      </p>
    </div>
  );
}
