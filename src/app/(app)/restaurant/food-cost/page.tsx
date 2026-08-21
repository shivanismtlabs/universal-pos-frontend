"use client";

import { useQuery } from "@tanstack/react-query";
import { restaurantApi } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { useBootstrap } from "@/lib/bootstrap";
import { DiningPanel, DiningShell } from "@/components/dining-chrome";

export default function FoodCostPage() {
  const { hasCapability } = useBootstrap();
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const canSee =
    hasCapability("RECIPE") &&
    (roles.includes("admin") ||
      roles.includes("manager") ||
      roles.includes("accountant"));
  const q = useQuery({
    queryKey: ["restaurant-food-cost"],
    queryFn: () => restaurantApi.foodCost(),
    enabled: canSee,
  });

  if (!canSee) {
    return (
      <DiningShell
        title="Food cost"
        subtitle="Food cost is available to owners, managers, and accountants only."
      >
        <p className="text-sm text-[#5a6b7d]">Captain and kitchen roles cannot see this.</p>
      </DiningShell>
    );
  }

  const rows = Array.isArray(q.data) ? q.data : q.data ? [q.data] : [];

  return (
    <DiningShell
      title="Food cost"
      subtitle="Theoretical recipe cost vs selling rate. Captain and kitchen roles cannot see this."
    >
      <DiningPanel title="By item">
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
              <tr key={r.productId}>
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
          <p className="py-4 text-sm text-[#5a6b7d]">
            Add recipes and ingredient cost prices to see food cost.
          </p>
        ) : null}
      </DiningPanel>
    </DiningShell>
  );
}
