/**
 * Country-aware UOM helpers for catalog create (config-driven, not POS branches).
 */

import type { MeasureUnitRow } from "@/lib/measure-units";

/** Default unit symbol when creating a new item. */
export function defaultUnitForCreate(
  countryCode: string | null | undefined,
  businessType: string | null | undefined,
  kind: string | null | undefined,
): string {
  const k = (kind ?? "").toLowerCase();
  if (k === "service") return "service";
  if (k === "digital" || k === "bundle" || k === "rental") return "pcs";

  const cc = (countryCode ?? "IN").trim().toUpperCase();
  const t = (businessType ?? "").toLowerCase().replace(/\s+/g, "_");
  const isGrocery =
    t === "grocery" ||
    t === "fb" ||
    t === "f&b" ||
    t.includes("grocery") ||
    t.includes("kirana");

  if (isGrocery) {
    if (cc === "US") return "lb";
    return "kg";
  }
  return "pcs";
}

/** Put country-suggested units at the top of the dropdown; keep all tenant units. */
export function orderUnitsForCountry(
  units: MeasureUnitRow[],
  suggestedSymbols: string[] | undefined,
): MeasureUnitRow[] {
  if (!suggestedSymbols?.length) return units;
  const rank = new Map(
    suggestedSymbols.map((s, i) => [s.trim().toLowerCase(), i]),
  );
  return [...units].sort((a, b) => {
    const ra = rank.get(a.code.toLowerCase()) ?? 999;
    const rb = rank.get(b.code.toLowerCase()) ?? 999;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export type CatalogUnitGroupRow = {
  id: string;
  code: string;
  units: Array<{
    id: string;
    symbol: string;
    name: string;
    isBaseUnit: boolean;
  }>;
};

export function findUnitInGroups(
  groups: CatalogUnitGroupRow[] | undefined,
  symbol: string | null | undefined,
): { unitId: string; groupId: string; symbol: string } | null {
  const want = (symbol ?? "").trim().toLowerCase();
  if (!want || !groups?.length) return null;
  for (const g of groups) {
    for (const u of g.units) {
      if (u.symbol.toLowerCase() === want) {
        return { unitId: u.id, groupId: g.id, symbol: u.symbol };
      }
    }
  }
  return null;
}
