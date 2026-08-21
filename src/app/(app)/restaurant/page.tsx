"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { restaurantApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import {
  DiningEmpty,
  DiningPanel,
  DiningShell,
  DiningStatusBadge,
} from "@/components/dining-chrome";
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
      <DiningShell
        title="Floor"
        subtitle="Enable Tables or KOT in Settings → Capabilities."
      >
        <DiningEmpty
          title="Dining pack is off for this shop"
          detail="Retail, rental, and service shops are unchanged until those capabilities are turned on."
        />
        <Button asChild>
          <Link href="/settings/capabilities">Open capabilities</Link>
        </Button>
      </DiningShell>
    );
  }

  return (
    <DiningShell
      title="Floor"
      subtitle="Live tables and kitchen tickets. Inventory deducts once at checkout — never on KOT."
      action={
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/restaurant/tables">Open floor</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/kitchen">Kitchen</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/counter">New order</Link>
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Available" value={String(available)} />
        <Kpi label="Occupied" value={String(occupied)} accent />
        <Kpi label="Open KOTs" value={String(openKots.length)} />
        <Kpi
          label="Delayed"
          value={String(openKots.filter((k) => k.aging !== "waiting").length)}
        />
      </div>

      <DiningPanel
        title="Live tables"
        action={
          <Link
            href="/restaurant/tables"
            className="text-xs font-semibold text-[#1a56db] hover:underline"
          >
            Floor map
          </Link>
        }
      >
        {!rows.length ? (
          <DiningEmpty
            title="No dining tables yet"
            detail="Create a floor and tables, then tap a table to open a ticket."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[0.68rem] uppercase tracking-wide text-[#8b9bb0]">
                <tr>
                  <th className="pb-2 font-semibold">Table</th>
                  <th className="pb-2 font-semibold">Floor</th>
                  <th className="pb-2 font-semibold">Status</th>
                  <th className="pb-2 font-semibold">Order</th>
                  <th className="pb-2 font-semibold">Guest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef1f4]">
                {rows.slice(0, 12).map((t) => (
                  <tr key={t.id}>
                    <td className="py-2 font-semibold text-[#0b1f33]">
                      {t.name}
                    </td>
                    <td className="py-2 text-[#5a6b7d]">
                      {t.floorName ?? "—"}
                    </td>
                    <td className="py-2">
                      <DiningStatusBadge value={t.status} />
                    </td>
                    <td className="py-2 font-mono text-xs text-[#1a56db]">
                      {t.orderNumber ?? "—"}
                    </td>
                    <td className="py-2 text-[#5a6b7d]">
                      {t.guestName ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DiningPanel>
    </DiningShell>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        accent
          ? "rounded-xl border border-[#bfdbfe] bg-[#f8fbff] px-4 py-3"
          : "rounded-xl border border-[#e2e8f0] bg-white px-4 py-3"
      }
    >
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#8b9bb0]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[#0b1f33]">
        {value}
      </p>
    </div>
  );
}
