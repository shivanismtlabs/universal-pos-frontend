import { formatQtyWithUnit } from "@/lib/sell-units";

/** Plain-language labels so cashier / shop staff can tell product types apart. */

export function productKindLabel(kind?: string | null): string {
  switch ((kind ?? "").toLowerCase()) {
    case "physical":
      return "Goods";
    case "bundle":
      return "Combo pack";
    case "service":
      return "Service";
    case "digital":
      return "Digital";
    case "rental":
      return "Rental";
    default:
      return "";
  }
}

/** Items list Type column — rental outfits use fulfillmentMode, not kind alone. */
export function catalogTypeLabel(
  kind?: string | null,
  fulfillmentMode?: string | null,
  meta?: Record<string, unknown> | null,
  skuCode?: string | null,
): string {
  const metaType = typeof meta?.itemType === "string" ? meta.itemType.toLowerCase() : "";
  if (metaType === "rental") return "Rental";
  if (metaType === "service") return "Service";
  if (metaType === "goods") return "Goods";
  const fm = (fulfillmentMode ?? "").toLowerCase();
  if (fm === "rental") return "Rental";
  if (fm === "service") return "Service";
  const k = (kind ?? "").toLowerCase();
  if (k === "rental") return "Rental";
  if (k === "service") return "Service";
  if (skuCode && skuCode.toUpperCase().startsWith("RNT-")) return "Rental";
  return productKindLabel(kind) || "Goods";
}

export type StockHintTone = "ok" | "low" | "out" | "info";

export function productStockHint(opts: {
  kind?: string | null;
  trackQty?: boolean;
  /** When true, finished item stock is driven by recipe / ingredients */
  recipeTracked?: boolean;
  available: number;
  qtyLeftLabel: string;
}): { label: string; tone: StockHintTone } {
  const kind = (opts.kind ?? "").toLowerCase();
  const tracks = opts.trackQty !== false && opts.recipeTracked !== true;

  if (opts.recipeTracked) {
    return {
      label: "From recipe · can sell",
      tone: "info",
    };
  }

  if (tracks) {
    if (opts.available <= 0) {
      return { label: "None left to add", tone: "out" };
    }
    return {
      label: `${opts.qtyLeftLabel} left`,
      tone: opts.available < 5 ? "low" : "ok",
    };
  }

  if (kind === "bundle") {
    return {
      label: "Stock comes from items inside",
      tone: "info",
    };
  }
  if (kind === "service") {
    return { label: "No stock needed (service)", tone: "info" };
  }
  if (kind === "digital") {
    return { label: "No stock needed (digital)", tone: "info" };
  }
  return { label: "Stock not counted · can sell", tone: "info" };
}

export function catalogStockOnHandLabel(opts: {
  kind?: string | null;
  trackInventory?: boolean;
  stockOnHand?: number | null;
  /** Always pass unit so grocery kg/L show as "12.5 kg" */
  unit?: string | null;
}): string {
  const unit = opts.unit?.trim() || "pcs";
  if (opts.trackInventory === false) {
    const kind = (opts.kind ?? "").toLowerCase();
    if (kind === "bundle") return "From items inside";
    if (kind === "service") return "No stock (service)";
    if (kind === "digital") return "No stock (digital)";
    // Prefer a real On Hand figure when a stock row exists (e.g. CSV set track off by mistake).
    if (opts.stockOnHand != null) {
      return formatQtyWithUnit(Number(opts.stockOnHand), unit);
    }
    return "Stock off";
  }
  if (opts.stockOnHand == null) return "—";
  return formatQtyWithUnit(Number(opts.stockOnHand), unit);
}
