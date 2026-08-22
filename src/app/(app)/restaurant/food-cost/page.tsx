"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { restaurantApi } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { useBootstrap } from "@/lib/bootstrap";
import { DiningEmpty, DiningPanel, DiningShell } from "@/components/dining-chrome";
import { Button } from "@/components/ui/button";
import { ModalFrame } from "@/components/modal-frame";
import { downloadCsv } from "@/lib/csv";

export default function FoodCostPage() {
  const { hasCapability } = useBootstrap();
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const canSee =
    hasCapability("RECIPE") &&
    (roles.includes("admin") ||
      roles.includes("manager") ||
      roles.includes("accountant"));
  const [detailId, setDetailId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["restaurant-food-cost"],
    queryFn: () => restaurantApi.foodCost(),
    enabled: canSee,
  });
  const detail = useQuery({
    queryKey: ["restaurant-food-cost", detailId],
    queryFn: () => restaurantApi.foodCost(detailId!),
    enabled: canSee && Boolean(detailId),
  });

  if (!canSee) {
    return (
      <DiningShell
        title="Food cost"
        subtitle="Food cost is available to owners, managers, and accountants only."
      >
        <p className="text-sm text-[#5a6b7d]">
          Captain and kitchen roles cannot see this.
        </p>
      </DiningShell>
    );
  }

  const rows = Array.isArray(q.data) ? q.data : q.data ? [q.data] : [];
  const one =
    detail.data && !Array.isArray(detail.data) ? detail.data : null;

  return (
    <DiningShell
      title="Food cost"
      subtitle="Theoretical recipe cost vs selling rate. Ingredient consumption is at checkout or Produce, not on KOT."
      action={
        <Button
          type="button"
          variant="secondary"
          disabled={!rows.length}
          onClick={() =>
            downloadCsv(
              "food-cost.csv",
              ["Item", "SKU", "Rate", "Recipe cost", "Food cost %", "Margin"],
              rows.map((r) => [
                r.name,
                "skuCode" in r ? r.skuCode : "",
                "basePrice" in r ? Number(r.basePrice) : "",
                Number(r.recipeCost ?? 0),
                r.foodCostPercent != null ? r.foodCostPercent.toFixed(1) : "",
                Number(r.marginAmount ?? 0),
              ]),
            )
          }
        >
          Export CSV
        </Button>
      }
    >
      <DiningPanel title="By item" hint="Tap a row for ingredient cost.">
        <table className="w-full text-left text-sm">
          <thead className="text-[0.68rem] uppercase tracking-wide text-[#8b9bb0]">
            <tr>
              <th className="pb-2 font-semibold">Item</th>
              <th className="pb-2 text-right font-semibold">Rate</th>
              <th className="pb-2 text-right font-semibold">Recipe cost</th>
              <th className="pb-2 text-right font-semibold">Food cost %</th>
              <th className="pb-2 text-right font-semibold">Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef1f4]">
            {rows.map((r) => (
              <tr
                key={r.productId}
                className="cursor-pointer hover:bg-[#f8fafc]"
                onClick={() => setDetailId(r.productId)}
              >
                <td className="py-2 font-medium text-[#0b1f33]">
                  {r.name}
                  {"skuCode" in r && r.skuCode ? (
                    <span className="ml-1 font-mono text-xs text-[#8b9bb0]">
                      {r.skuCode}
                    </span>
                  ) : null}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {"basePrice" in r ? Number(r.basePrice).toFixed(2) : "—"}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {Number(r.recipeCost ?? 0).toFixed(2)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {r.foodCostPercent != null
                    ? `${r.foodCostPercent.toFixed(1)}%`
                    : "—"}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {Number(r.marginAmount ?? 0).toFixed(2)}
                  {r.marginPercent != null
                    ? ` (${r.marginPercent.toFixed(1)}%)`
                    : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? (
          <DiningEmpty
            title="No food cost yet"
            detail="Add recipes and ingredient cost prices on catalog items."
          />
        ) : null}
      </DiningPanel>

      {detailId ? (
        <ModalFrame
          title={one?.name ?? "Recipe cost"}
          subtitle="Unit cost × qty including wastage %."
          onClose={() => setDetailId(null)}
        >
          {one?.lines?.length ? (
            <table className="w-full text-left text-sm">
              <thead className="text-[0.68rem] uppercase tracking-wide text-[#8b9bb0]">
                <tr>
                  <th className="pb-2 font-semibold">Ingredient</th>
                  <th className="pb-2 text-right font-semibold">Qty</th>
                  <th className="pb-2 text-right font-semibold">Unit cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef1f4]">
                {one.lines.map((l, i) => (
                  <tr key={`${l.name}-${i}`}>
                    <td className="py-2">
                      {l.name}
                      {l.wastagePercent
                        ? ` (+${l.wastagePercent}% waste)`
                        : ""}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {l.quantity}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {Number(l.unitCost ?? 0).toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-[#5a6b7d]">Loading…</p>
          )}
          {one ? (
            <p className="mt-3 text-sm text-[#5a6b7d]">
              Recipe cost {Number(one.recipeCost).toFixed(2)}
              {one.foodCostPercent != null
                ? ` · ${one.foodCostPercent.toFixed(1)}% of rate`
                : ""}
            </p>
          ) : null}
        </ModalFrame>
      ) : null}
    </DiningShell>
  );
}
