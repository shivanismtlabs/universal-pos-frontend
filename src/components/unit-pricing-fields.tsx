"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { catalogApi } from "@/lib/api";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

export type SellingUnitRow = {
  unitId: string;
  conversionToBase: string;
  fixedPrice: string;
  isDefaultSellingUnit: boolean;
  isPurchaseUnit: boolean;
};

export type UnitPricingValue = {
  unitGroupId: string;
  baseUnitId: string;
  pricingUnitId: string;
  pricingStrategy: "converted" | "fixed_tier";
  pricePerPricingUnit: string;
  sellingUnits: SellingUnitRow[];
};

type Props = {
  value: UnitPricingValue;
  onChange: (next: UnitPricingValue) => void;
  /** Sync legacy unitOfMeasure symbol when base unit changes */
  onBaseUnitSymbol?: (symbol: string) => void;
};

export function UnitPricingFields({
  value,
  onChange,
  onBaseUnitSymbol,
}: Props) {
  const [seeded, setSeeded] = useState(false);

  const groups = useQuery({
    queryKey: ["catalog-unit-groups"],
    queryFn: async () => {
      let rows = await catalogApi.listUnitGroups();
      if (!rows?.length) {
        await catalogApi.seedUnitGroups();
        rows = await catalogApi.listUnitGroups();
      }
      return rows;
    },
  });

  useEffect(() => {
    if (seeded || groups.data?.length) return;
    if (groups.isError) {
      void catalogApi.seedUnitGroups().then(() => {
        setSeeded(true);
        void groups.refetch();
      });
    }
  }, [groups, seeded]);

  const group = useMemo(
    () => groups.data?.find((g) => g.id === value.unitGroupId),
    [groups.data, value.unitGroupId],
  );
  const units = group?.units ?? [];

  function patch(partial: Partial<UnitPricingValue>) {
    onChange({ ...value, ...partial });
  }

  function setBaseUnit(unitId: string) {
    const u = units.find((x) => x.id === unitId);
    patch({
      baseUnitId: unitId,
      pricingUnitId: value.pricingUnitId || unitId,
    });
    if (u?.symbol) onBaseUnitSymbol?.(u.symbol);
  }

  return (
    <div className="space-y-3 rounded-lg border border-[#e4e9f0] bg-[#fafbfc] p-3">
      <p className="text-[0.7rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
        Unit &amp; pricing
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Unit group *</Label>
          <Select
            className="mt-1 h-9 w-full rounded-md border border-[#d9e0ea] bg-white px-2 text-sm"
            value={value.unitGroupId}
            onChange={(e) =>
              patch({
                unitGroupId: e.target.value,
                baseUnitId: "",
                pricingUnitId: "",
                sellingUnits: [],
              })
            }
          >
            <option value="">Select group…</option>
            {(groups.data ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Base unit * (inventory)</Label>
          <Select
            className="mt-1 h-9 w-full rounded-md border border-[#d9e0ea] bg-white px-2 text-sm"
            value={value.baseUnitId}
            disabled={!value.unitGroupId}
            onChange={(e) => setBaseUnit(e.target.value)}
          >
            <option value="">Select…</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.symbol} — {u.name}
                {u.isBaseUnit ? " (group base)" : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Pricing strategy *</Label>
          <Select
            className="mt-1 h-9 w-full rounded-md border border-[#d9e0ea] bg-white px-2 text-sm"
            value={value.pricingStrategy}
            onChange={(e) =>
              patch({
                pricingStrategy: e.target.value as "converted" | "fixed_tier",
              })
            }
          >
            <option value="converted">Converted (proportional)</option>
            <option value="fixed_tier">Fixed tier (pack prices)</option>
          </Select>
        </div>
        <div>
          <Label>Pricing unit</Label>
          <Select
            className="mt-1 h-9 w-full rounded-md border border-[#d9e0ea] bg-white px-2 text-sm"
            value={value.pricingUnitId || value.baseUnitId}
            disabled={!value.unitGroupId}
            onChange={(e) => patch({ pricingUnitId: e.target.value })}
          >
            <option value="">Same as base</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.symbol} — {u.name}
              </option>
            ))}
          </Select>
        </div>
        {value.pricingStrategy === "converted" ? (
          <div className="sm:col-span-2">
            <Label>Price per pricing unit *</Label>
            <Input
              className="mt-1"
              inputMode="decimal"
              value={value.pricePerPricingUnit}
              onChange={(e) => patch({ pricePerPricingUnit: e.target.value })}
              placeholder="e.g. 100"
            />
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Selling units</Label>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!value.baseUnitId}
            onClick={() =>
              patch({
                sellingUnits: [
                  ...value.sellingUnits,
                  {
                    unitId: value.baseUnitId,
                    conversionToBase: "1",
                    fixedPrice: "",
                    isDefaultSellingUnit: value.sellingUnits.length === 0,
                    isPurchaseUnit: false,
                  },
                ],
              })
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add unit
          </Button>
        </div>
        {value.sellingUnits.map((row, idx) => (
          <div
            key={idx}
            className="grid gap-2 rounded-md border border-[#eef1f4] bg-white p-2 sm:grid-cols-6"
          >
            <Select
              className="h-8 rounded-md border border-[#d9e0ea] px-1 text-xs sm:col-span-2"
              value={row.unitId}
              onChange={(e) => {
                const next = [...value.sellingUnits];
                next[idx] = { ...row, unitId: e.target.value };
                patch({ sellingUnits: next });
              }}
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.symbol}
                </option>
              ))}
            </Select>
            <Input
              className="h-8 text-xs"
              placeholder="Conv → base"
              value={row.conversionToBase}
              onChange={(e) => {
                const next = [...value.sellingUnits];
                next[idx] = { ...row, conversionToBase: e.target.value };
                patch({ sellingUnits: next });
              }}
            />
            {value.pricingStrategy === "fixed_tier" ? (
              <Input
                className="h-8 text-xs"
                placeholder="Fixed price"
                value={row.fixedPrice}
                onChange={(e) => {
                  const next = [...value.sellingUnits];
                  next[idx] = { ...row, fixedPrice: e.target.value };
                  patch({ sellingUnits: next });
                }}
              />
            ) : (
              <Input
                className="h-8 text-xs"
                placeholder="Unit price (optional)"
                value={row.fixedPrice}
                onChange={(e) => {
                  const next = [...value.sellingUnits];
                  next[idx] = { ...row, fixedPrice: e.target.value };
                  patch({ sellingUnits: next });
                }}
              />
            )}
            <label className="flex items-center gap-1 text-[0.65rem]">
              <input
                type="checkbox"
                checked={row.isDefaultSellingUnit}
                onChange={(e) => {
                  const next = value.sellingUnits.map((r, i) => ({
                    ...r,
                    isDefaultSellingUnit:
                      i === idx ? e.target.checked : false,
                  }));
                  patch({ sellingUnits: next });
                }}
              />
              Default
            </label>
            <div className="flex items-center justify-between gap-1">
              <label className="flex items-center gap-1 text-[0.65rem]">
                <input
                  type="checkbox"
                  checked={row.isPurchaseUnit}
                  onChange={(e) => {
                    const next = [...value.sellingUnits];
                    next[idx] = { ...row, isPurchaseUnit: e.target.checked };
                    patch({ sellingUnits: next });
                  }}
                />
                Purchase
              </label>
              <button
                type="button"
                className="text-[#c81e1e]"
                onClick={() =>
                  patch({
                    sellingUnits: value.sellingUnits.filter((_, i) => i !== idx),
                  })
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
        {!value.sellingUnits.length ? (
          <p className="text-[0.7rem] text-[#8b9bb0]">
            Optional — add pack/box rows for COUNT packaging or fixed-tier
            prices.
          </p>
        ) : null}
      </div>
    </div>
  );
}
