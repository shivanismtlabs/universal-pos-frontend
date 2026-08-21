"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { catalogApi, restaurantApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { PageHeader } from "@/components/page-header";
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
          unit: unit.trim() || undefined,
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
      <div className="p-6 text-sm text-[#5a6b7d]">
        Recipes need the Recipes / BOM capability.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Recipes"
        subtitle="Bill of materials on catalog items. Checkout consumes ingredients once; KOT never deducts stock."
      />

      <section className="rounded-xl border border-[#e2e8f0] bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-[#0b1f33]">Add ingredient line</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label>Menu item</Label>
            <select
              className="mt-1 h-9 w-full rounded-md border border-[#d9e0ea] px-2 text-sm"
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
              className="mt-1 h-9 w-full rounded-md border border-[#d9e0ea] px-2 text-sm"
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
      </section>

      <section className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#f7f9fc] text-[0.68rem] uppercase tracking-wide text-[#8b9bb0]">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Ingredients</th>
              <th className="px-3 py-2 text-right">Rate</th>
            </tr>
          </thead>
          <tbody>
            {(recipes.data ?? []).map((r) => (
              <tr key={r.productId} className="border-t border-[#eef1f4]">
                <td className="px-3 py-2 font-medium text-[#0b1f33]">{r.name}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.skuCode}</td>
                <td className="px-3 py-2 text-[#5a6b7d]">
                  {r.lines
                    .map((l) => `${l.quantity} ${l.unit} ${l.name}`)
                    .join(", ") || "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.basePrice.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!recipes.data?.length ? (
          <p className="px-3 py-6 text-sm text-[#5a6b7d]">No recipes yet.</p>
        ) : null}
      </section>
    </div>
  );
}
