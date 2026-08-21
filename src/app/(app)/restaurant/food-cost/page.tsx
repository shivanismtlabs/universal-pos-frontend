"use client";

import { useQuery } from "@tanstack/react-query";
import { restaurantApi } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { useBootstrap } from "@/lib/bootstrap";
import { PageHeader } from "@/components/page-header";

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
      <div className="p-6 text-sm text-[#5a6b7d]">
        Food cost is available to owners, managers, and accountants only.
      </div>
    );
  }

  const rows = Array.isArray(q.data) ? q.data : q.data ? [q.data] : [];

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Food cost"
        subtitle="Theoretical recipe cost vs selling rate. Captain and kitchen roles cannot see this."
      />
      <section className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#f7f9fc] text-[0.68rem] uppercase tracking-wide text-[#8b9bb0]">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">Rate</th>
              <th className="px-3 py-2 text-right">Recipe cost</th>
              <th className="px-3 py-2 text-right">Food cost %</th>
              <th className="px-3 py-2 text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.productId} className="border-t border-[#eef1f4]">
                <td className="px-3 py-2 font-medium text-[#0b1f33]">
                  {r.name}
                  {"skuCode" in r && r.skuCode ? (
                    <span className="ml-1 font-mono text-xs text-[#8b9bb0]">
                      {r.skuCode}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {"basePrice" in r ? Number(r.basePrice).toFixed(2) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {Number(r.recipeCost ?? 0).toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.foodCostPercent != null
                    ? `${r.foodCostPercent.toFixed(1)}%`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
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
          <p className="px-3 py-6 text-sm text-[#5a6b7d]">
            Add recipes and ingredient cost prices to see food cost.
          </p>
        ) : null}
      </section>
    </div>
  );
}
