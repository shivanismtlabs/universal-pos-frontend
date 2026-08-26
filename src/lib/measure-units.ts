export type MeasureUnitRow = {
  code: string;
  name: string;
  decimalQty: boolean;
  active: boolean;
  system?: boolean;
};

export const FALLBACK_UNITS: MeasureUnitRow[] = [
  { code: "pcs", name: "Piece", decimalQty: false, active: true, system: true },
  { code: "pack", name: "Pack / box", decimalQty: false, active: true, system: true },
  { code: "box", name: "Box", decimalQty: false, active: true, system: true },
  { code: "dozen", name: "Dozen", decimalQty: false, active: true, system: true },
  { code: "kg", name: "Kilogram", decimalQty: true, active: true, system: true },
  { code: "g", name: "Gram", decimalQty: false, active: true, system: true },
  { code: "L", name: "Litre", decimalQty: true, active: true, system: true },
  { code: "ml", name: "Millilitre", decimalQty: false, active: true, system: true },
  { code: "lb", name: "Pound", decimalQty: true, active: true, system: true },
  { code: "m", name: "Metre", decimalQty: true, active: true, system: true },
  { code: "hour", name: "Hour", decimalQty: true, active: true, system: true },
  { code: "day", name: "Day", decimalQty: false, active: true, system: true },
  { code: "service", name: "Service", decimalQty: false, active: true, system: true },
];

function asUnit(raw: unknown): MeasureUnitRow | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const code = String(o.code ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,15}$/.test(code)) return null;
  return {
    code,
    name: String(o.name ?? code).trim().slice(0, 80) || code,
    decimalQty: o.decimalQty === true,
    active: o.active !== false,
    system: o.system === true,
  };
}

/** Merge tenant.settings.units with built-in defaults (same as backend). */
export function parseUnitsFromSettings(settings: unknown): MeasureUnitRow[] {
  const root =
    settings && typeof settings === "object"
      ? (settings as Record<string, unknown>)
      : {};
  const custom: MeasureUnitRow[] = [];
  if (Array.isArray(root.units)) {
    for (const row of root.units) {
      const u = asUnit(row);
      if (u) custom.push(u);
    }
  }
  const byCode = new Map<string, MeasureUnitRow>();
  for (const d of FALLBACK_UNITS) byCode.set(d.code, { ...d });
  for (const u of custom) {
    const prev = byCode.get(u.code);
    if (prev?.system) {
      byCode.set(u.code, {
        ...prev,
        name: u.name || prev.name,
        decimalQty: u.decimalQty,
        active: u.active,
        system: true,
      });
    } else {
      byCode.set(u.code, { ...u, system: prev?.system ?? false });
    }
  }
  return [...byCode.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export function unwrapUnits(raw: unknown): MeasureUnitRow[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as MeasureUnitRow[];
  if (typeof raw === "object") {
    const rec = raw as { items?: unknown; data?: unknown };
    if (Array.isArray(rec.items)) return rec.items as MeasureUnitRow[];
    if (Array.isArray(rec.data)) return rec.data as MeasureUnitRow[];
  }
  return [];
}

/** Grocery / weigh-scale first, then piece packs — matches real shop unit pickers. */
const UNIT_SORT_ORDER = [
  "pcs",
  "pack",
  "box",
  "dozen",
  "kg",
  "g",
  "L",
  "ml",
  "lb",
  "m",
  "hour",
  "day",
  "service",
];

function unitSortRank(code: string): number {
  const i = UNIT_SORT_ORDER.indexOf(code);
  return i >= 0 ? i : 100 + code.localeCompare(code);
}

export function activeUnitOptions(raw: unknown): MeasureUnitRow[] {
  const rows = unwrapUnits(raw).filter((u) => u.active !== false);
  const list = rows.length ? rows : FALLBACK_UNITS;
  return [...list].sort((a, b) => {
    const ra = unitSortRank(a.code);
    const rb = unitSortRank(b.code);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

/** Sensible default UOM for new catalog items — every business type. */
export function defaultUnitForBusinessType(
  businessType?: string | null,
  kind?: string | null,
): string {
  const k = (kind ?? "").toLowerCase();
  if (k === "service") return "service";
  if (k === "digital") return "pcs";
  if (k === "rental") return "pcs";
  if (k === "bundle") return "pcs";

  const t = (businessType ?? "").toLowerCase().replace(/\s+/g, "_");
  // Weight / bulk retail
  if (
    t === "grocery" ||
    t === "fb" ||
    t === "f&b" ||
    t.includes("grocery") ||
    t.includes("kirana")
  ) {
    return "kg";
  }
  // Piece-sold goods
  if (
    t === "retail" ||
    t === "restaurant" ||
    t === "salon" ||
    t === "service" ||
    t === "rental" ||
    t === "hybrid" ||
    t === "general" ||
    t === "other"
  ) {
    return "pcs";
  }
  return "pcs";
}
