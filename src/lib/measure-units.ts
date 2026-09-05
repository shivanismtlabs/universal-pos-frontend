export type MeasureUnitRow = {
  code: string;
  name: string;
  decimalQty: boolean;
  active: boolean;
  system?: boolean;
};

export type MeasureUnit = MeasureUnitRow;

export const FALLBACK_UNITS: MeasureUnitRow[] = [
  { code: "pcs", name: "Piece", decimalQty: false, active: true, system: true },
  { code: "pack", name: "Pack / box", decimalQty: true, active: true, system: true },
  { code: "box", name: "Box", decimalQty: true, active: true, system: true },
  { code: "dozen", name: "Dozen", decimalQty: true, active: true, system: true },
  { code: "kg", name: "Kilogram", decimalQty: true, active: true, system: true },
  { code: "g", name: "Gram", decimalQty: true, active: true, system: true },
  { code: "L", name: "Litre", decimalQty: true, active: true, system: true },
  { code: "ml", name: "Millilitre", decimalQty: true, active: true, system: true },
  { code: "lb", name: "Pound", decimalQty: true, active: true, system: true },
  { code: "oz", name: "Ounce", decimalQty: true, active: true, system: true },
  { code: "gal", name: "Gallon (US)", decimalQty: true, active: true, system: true },
  { code: "fl oz", name: "Fluid ounce (US)", decimalQty: true, active: true, system: true },
  { code: "m", name: "Metre", decimalQty: true, active: true, system: true },
  { code: "min", name: "Minute", decimalQty: false, active: true, system: true },
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
  "oz",
  "gal",
  "fl oz",
  "m",
  "min",
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

/** Pack-style units: 1 box/pack holds a count of a smaller unit. */
const PACKED_UNIT_CODES = new Set([
  "box",
  "pack",
  "dozen",
  "carton",
  "case",
  "crate",
  "bag",
  "bundle",
]);

/** Piece / weight / time units that are not a pack of something else. */
const NEVER_PACKED_UNIT_CODES = new Set([
  "pcs",
  "kg",
  "g",
  "L",
  "ml",
  "lb",
  "m",
  "min",
  "hour",
  "day",
  "service",
  "gal",
]);

export type MultiUnitMeta = { baseQty: number; baseUnit: string };

export function isPackedMeasureUnit(code: string | null | undefined): boolean {
  const c = (code ?? "").trim().toLowerCase();
  if (!c || NEVER_PACKED_UNIT_CODES.has(c)) return false;
  if (PACKED_UNIT_CODES.has(c)) return true;
  return /(box|pack|carton|crate|case|dozen)/i.test(c);
}

/** Services / digital / combo don't store “qty in box”. */
export function catalogNeedsPackedContents(
  kind: string | null | undefined,
  unit: string | null | undefined,
): boolean {
  const k = (kind ?? "").toLowerCase();
  if (k === "service" || k === "digital" || k === "bundle") return false;
  return isPackedMeasureUnit(unit);
}

export function defaultPackedContentsQty(unit: string | null | undefined): string {
  return (unit ?? "").trim().toLowerCase() === "dozen" ? "12" : "";
}

export function parseMultiUnitMeta(meta: unknown): MultiUnitMeta | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const m = (meta as Record<string, unknown>).multiUnit;
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  const rec = m as Record<string, unknown>;
  const qty = Number(rec.baseQty);
  const unit = String(rec.baseUnit ?? "pcs").trim() || "pcs";
  if (!Number.isFinite(qty) || qty <= 0) return null;
  return { baseQty: qty, baseUnit: unit };
}

export function formatPackedContents(
  packUnit: string,
  qty: number,
  baseUnit: string,
): string {
  const n = Number.isInteger(qty) ? String(qty) : String(qty);
  return `1 ${packUnit} = ${n} ${baseUnit}`;
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

export function decimalQtyForUnit(
  unit: string,
  units: MeasureUnitRow[] = FALLBACK_UNITS,
): boolean {
  const code = unit.trim().toLowerCase();
  const found = units.find((u) => u.code.toLowerCase() === code);
  if (found) return found.decimalQty;
  return FALLBACK_UNITS.some((u) => u.code.toLowerCase() === code && u.decimalQty);
}
