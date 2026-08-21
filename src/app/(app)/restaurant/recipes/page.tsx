"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { catalogApi, restaurantApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { DiningPanel, DiningShell, diningSelectClass } from "@/components/dining-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RecipesPage() {
  const qc = useQueryClient();
  const { hasCapability } = useBootstrap();
  const allowed = hasCapability("RECIPE") || hasCapability("KITCHEN");
  const recipes = useQuery({
    queryKey: ["restaurant-recipes"],
    queryFn: () => restaurantApi.recipes(),
    enabled: allowed,
  });
  const items = useQuery({
    queryKey: ["catalog-products-all"],
    queryFn: () => catalogApi.listProducts({ limit: 200 }),
    enabled: allowed,
  });
  const [parentId, setParentId] = useState("");
  const [compId, setCompId] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("");
  const [waste, setWaste] = useState("0");

  const catalog = items.data?.items ?? [];
  const draft = useMemo(() => {
    const existing = recipes.data?.find((r) => r.productId === parentId);
    return existing?.lines ?? [];
  }, [recipes.data, parentId]);

  const save = useMutation({
    mutationFn: () => {
      if (!parentId) throw new Error("Select a menu item");
      const lines = draft.map((l) => ({
        componentProductId: l.componentProductId,
        quantity: l.quantity,
        unit: l.unit,
        wastagePercent: l.wastagePercent,
      }));
      if (compId) {
        lines.push({
          componentProductId: compId,
          quantity: Number(qty) || 1,
          unit: unit.trim(),
          wastagePercent: Number(waste) || 0,
        });
      }
      return restaurantApi.saveRecipe(parentId, lines);
    },
    onSuccess: () => {
      setCompId("");
      void qc.invalidateQueries({ queryKey: ["restaurant-recipes"] });
      toast.success("Recipe saved — ingredients deduct at checkout, not on KOT");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!allowed) {
    return (
      <DiningShell title="Recipes" subtitle="Recipes need the Recipes / BOM capability.">
        <p className="text-sm text-[#5a6b7d]">This shop does not have Recipes enabled.</p>
      </DiningShell>
    );
  }

  return (
    <DiningShell
      title="Recipes"
      subtitle="Bill of materials on catalog items. Checkout consumes ingredients once; KOT never deducts stock."
    >
      <DiningPanel title="Add ingredient line">
        <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label>Menu item</Label>
            <select
              className={`${diningSelectClass} mt-1`}
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">Select…</option>
              {catalog.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.skuCode})
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Ingredient</Label>
            <select
              className={`${diningSelectClass} mt-1`}
              value={compId}
              onChange={(e) => setCompId(e.target.value)}
            >
              <option value="">Select…</option>
              {catalog
                .filter((p) => p.id !== parentId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.skuCode})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <Label>Qty per sale</Label>
            <Input value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <Label>Unit</Label>
            <Input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="g / ml / pcs"
            />
          </div>
          <div>
            <Label>Wastage %</Label>
            <Input value={waste} onChange={(e) => setWaste(e.target.value)} />
          </div>
        </div>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          Save recipe
        </Button>
        {parentId && draft.length ? (
          <ul className="text-sm text-[#334155] space-y-1">
            {draft.map((l) => (
              <li key={l.id}>
                {l.quantity} {l.unit} × {l.name}
                {l.wastagePercent ? ` (+${l.wastagePercent}% waste)` : ""}
              </li>
            ))}
          </ul>
        ) : null}
        </div>
      </DiningPanel>

      <DiningPanel title="Recipes">
        <table className="w-full text-left text-sm">
          <thead className="text-[0.68rem] uppercase tracking-wide text-[#8b9bb0]">
            <tr>
              <th className="pb-2 font-semibold">Item</th>
              <th className="pb-2 font-semibold">SKU</th>
              <th className="pb-2 font-semibold">Ingredients</th>
              <th className="pb-2 text-right font-semibold">Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef1f4]">
            {(recipes.data ?? []).map((r) => (
              <tr key={r.productId}>
                <td className="py-2 font-medium text-[#0b1f33]">{r.name}</td>
                <td className="py-2 font-mono text-xs">{r.skuCode}</td>
                <td className="py-2 text-[#5a6b7d]">
                  {r.lines
                    .map((l) => `${l.quantity} ${l.unit} ${l.name}`)
                    .join(", ") || "—"}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {r.basePrice.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!recipes.data?.length ? (
          <p className="py-4 text-sm text-[#5a6b7d]">No recipes yet.</p>
        ) : null}
      </DiningPanel>
    </DiningShell>
  );
}
