"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { catalogApi, restaurantApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { useBranchStore } from "@/lib/branch-store";
import {
  DiningEmpty,
  DiningShell,
  diningSelectClass,
} from "@/components/dining-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModalFrame } from "@/components/modal-frame";
import { cn } from "@/lib/utils";

type Recipe = Awaited<ReturnType<typeof restaurantApi.recipes>>[number];
type LineDraft = {
  componentProductId: string;
  quantity: number;
  unit: string;
  wastagePercent: number;
  stageId?: string;
};

export default function RecipesPage() {
  const qc = useQueryClient();
  const { hasCapability, data: boot } = useBootstrap();
  const locationId =
    useBranchStore((s) => s.currentLocationId) || boot?.locations?.[0]?.id;
  const allowed = hasCapability("RECIPE") || hasCapability("KITCHEN");
  const [modal, setModal] = useState<
    | { kind: "edit"; productId?: string }
    | { kind: "produce"; productId: string }
    | null
  >(null);

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

  const catalog = items.data?.items ?? [];
  const list = recipes.data ?? [];
  const recipeIds = useMemo(
    () => new Set(list.map((r) => r.productId)),
    [list],
  );

  if (!allowed) {
    return (
      <DiningShell
        title="Recipes"
        subtitle="Enable Recipes in Capabilities. Same BOM model as any shop that makes goods from parts."
      >
        <DiningEmpty title="Recipes are off for this shop" />
      </DiningShell>
    );
  }

  return (
    <DiningShell
      title="Recipes"
      subtitle="Bill of materials on catalog items. Checkout consumes sale lines; stages consume when you produce. KOT never deducts stock."
      action={
        <Button type="button" onClick={() => setModal({ kind: "edit" })}>
          New recipe
        </Button>
      }
    >
      {!list.length ? (
        <DiningEmpty
          title="No recipes yet"
          detail="Map ingredients (or another recipe) onto a finished item. Cost shows on Food cost."
        />
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-[0.68rem] uppercase tracking-wide text-[#8b9bb0]">
            <tr>
              <th className="pb-2 font-semibold">Finished item</th>
              <th className="pb-2 font-semibold">Ingredients</th>
              <th className="pb-2 font-semibold">Stages</th>
              <th className="pb-2 text-right font-semibold">Rate</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef1f4]">
            {list.map((r) => (
              <tr key={r.productId}>
                <td className="py-2 font-medium text-[#0b1f33]">
                  {r.name}
                  <span className="ml-1 font-mono text-xs text-[#8b9bb0]">
                    {r.skuCode}
                  </span>
                </td>
                <td className="py-2 text-[#5a6b7d]">
                  {r.lines.length
                    ? r.lines
                        .map((l) => `${l.quantity} ${l.unit} ${l.name}`)
                        .join(", ")
                    : "—"}
                </td>
                <td className="py-2 text-[#5a6b7d]">
                  {r.stages.length
                    ? r.stages.map((s) => s.name).join(" → ")
                    : "Single step"}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {r.basePrice.toFixed(2)}
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    className="text-xs font-semibold text-[#1a56db]"
                    onClick={() =>
                      setModal({ kind: "edit", productId: r.productId })
                    }
                  >
                    Edit
                  </button>
                  {r.stages.length ? (
                    <button
                      type="button"
                      className="ml-3 text-xs font-semibold text-[#1a56db]"
                      onClick={() =>
                        setModal({ kind: "produce", productId: r.productId })
                      }
                    >
                      Produce
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modal?.kind === "edit" ? (
        <RecipeModal
          recipe={list.find((r) => r.productId === modal.productId) ?? null}
          catalog={catalog}
          recipeIds={recipeIds}
          onClose={() => setModal(null)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["restaurant-recipes"] });
            setModal(null);
          }}
        />
      ) : null}
      {modal?.kind === "produce" ? (
        <ProduceModal
          recipe={list.find((r) => r.productId === modal.productId)!}
          locationId={locationId}
          onClose={() => setModal(null)}
          onDone={() => setModal(null)}
        />
      ) : null}
    </DiningShell>
  );
}

function RecipeModal({
  recipe,
  catalog,
  recipeIds,
  onClose,
  onSaved,
}: {
  recipe: Recipe | null;
  catalog: Array<{
    id: string;
    name: string;
    skuCode: string;
    unitOfMeasure?: string;
  }>;
  recipeIds: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [productId, setProductId] = useState(recipe?.productId ?? "");
  const [lines, setLines] = useState<LineDraft[]>(
    () =>
      recipe?.lines.map((l) => ({
        componentProductId: l.componentProductId,
        quantity: l.quantity,
        unit: l.unit,
        wastagePercent: l.wastagePercent,
        stageId: l.stageId ?? undefined,
      })) ?? [],
  );
  const [compId, setCompId] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("");
  const [waste, setWaste] = useState("0");
  const [stageId, setStageId] = useState("");
  const [stageName, setStageName] = useState("");
  const stages = recipe?.stages ?? [];

  const addStage = useMutation({
    mutationFn: () =>
      restaurantApi.createRecipeStage(productId, {
        name: stageName.trim(),
        sortOrder: stages.length,
      }),
    onSuccess: () => {
      setStageName("");
      void qc.invalidateQueries({ queryKey: ["restaurant-recipes"] });
      toast.success("Stage added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: () => {
      if (!productId) throw new Error("Select a finished item");
      return restaurantApi.saveRecipe(productId, lines);
    },
    onSuccess: () => {
      toast.success("Recipe saved — stock deducts at checkout or Produce, not KOT");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function addLine() {
    if (!compId) return;
    const item = catalog.find((p) => p.id === compId);
    setLines((cur) => [
      ...cur,
      {
        componentProductId: compId,
        quantity: Number(qty) || 1,
        unit: unit.trim() || item?.unitOfMeasure || "pcs",
        wastagePercent: Number(waste) || 0,
        stageId: stageId || undefined,
      },
    ]);
    setCompId("");
  }

  return (
    <ModalFrame
      title={recipe ? `Edit · ${recipe.name}` : "New recipe"}
      subtitle="Ingredients can be raw items or another recipe (sub-recipe). Stages are for WIP / semi-finished."
      onClose={onClose}
      className="max-w-xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!productId || !lines.length || save.isPending}
            onClick={() => save.mutate()}
          >
            Save recipe
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <div>
          <Label>Finished item</Label>
          <select
            className={cn(diningSelectClass, "mt-1 w-full")}
            value={productId}
            disabled={Boolean(recipe)}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">Select…</option>
            {catalog.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.skuCode})
              </option>
            ))}
          </select>
        </div>

        {productId ? (
          <div>
            <Label>Stages (optional)</Label>
            <div className="mt-1 flex gap-2">
              <Input
                placeholder="Prep / cook / finish"
                value={stageName}
                onChange={(e) => setStageName(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={!stageName.trim() || addStage.isPending || !recipe}
                onClick={() => addStage.mutate()}
              >
                Add stage
              </Button>
            </div>
            {!recipe ? (
              <p className="mt-1 text-xs text-[#8b9bb0]">
                Save the recipe once, then reopen to add stages.
              </p>
            ) : null}
            {stages.length ? (
              <p className="mt-1 text-xs text-[#5a6b7d]">
                {stages.map((s) => s.name).join(" → ")}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Ingredient / raw / sub-recipe</Label>
            <select
              className={cn(diningSelectClass, "mt-1 w-full")}
              value={compId}
              onChange={(e) => setCompId(e.target.value)}
            >
              <option value="">Select…</option>
              {catalog
                .filter((p) => p.id !== productId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {recipeIds.has(p.id) ? " · sub-recipe" : ""}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <Label>Qty</Label>
            <Input
              className="mt-1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div>
            <Label>Unit</Label>
            <Input
              className="mt-1"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="g / ml / pcs"
            />
          </div>
          <div>
            <Label>Wastage %</Label>
            <Input
              className="mt-1"
              value={waste}
              onChange={(e) => setWaste(e.target.value)}
            />
          </div>
          {stages.length ? (
            <div>
              <Label>Stage</Label>
              <select
                className={cn(diningSelectClass, "mt-1 w-full")}
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
              >
                <option value="">At sale (finished)</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="flex items-end">
            <Button type="button" variant="secondary" onClick={addLine}>
              Add line
            </Button>
          </div>
        </div>

        <ul className="space-y-1 rounded-lg border border-[#e2e8f0] p-2 text-sm">
          {lines.map((l, i) => {
            const name =
              catalog.find((p) => p.id === l.componentProductId)?.name ??
              "Item";
            const stage = stages.find((s) => s.id === l.stageId);
            return (
              <li
                key={`${l.componentProductId}-${i}`}
                className="flex items-center justify-between gap-2"
              >
                <span>
                  {l.quantity} {l.unit} × {name}
                  {l.wastagePercent ? ` (+${l.wastagePercent}% waste)` : ""}
                  {recipeIds.has(l.componentProductId) ? " · sub-recipe" : ""}
                  {stage ? ` · ${stage.name}` : ""}
                </span>
                <button
                  type="button"
                  className="text-xs text-[#c81e1e]"
                  onClick={() => setLines((cur) => cur.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </li>
            );
          })}
          {!lines.length ? (
            <li className="text-[#8b9bb0]">No ingredients yet.</li>
          ) : null}
        </ul>
      </div>
    </ModalFrame>
  );
}

function ProduceModal({
  recipe,
  locationId,
  onClose,
  onDone,
}: {
  recipe: Recipe;
  locationId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [stageId, setStageId] = useState(recipe.stages[0]?.id ?? "");
  const [qty, setQty] = useState("1");
  const run = useMutation({
    mutationFn: () => {
      if (!locationId) throw new Error("Select a location / branch");
      return restaurantApi.completeRecipeStage({
        locationId,
        productId: recipe.productId,
        stageId,
        qty: Number(qty) || 1,
      });
    },
    onSuccess: () => {
      toast.success("Stage produced — ingredients consumed, output stocked");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ModalFrame
      title={`Produce · ${recipe.name}`}
      subtitle="Consumes this stage’s ingredients. Output item is stocked if the stage has one."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!stageId || run.isPending}
            onClick={() => run.mutate()}
          >
            Complete stage
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <div>
          <Label>Stage</Label>
          <select
            className={cn(diningSelectClass, "mt-1 w-full")}
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
          >
            {recipe.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Batches / qty</Label>
          <Input
            className="mt-1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
      </div>
    </ModalFrame>
  );
}
