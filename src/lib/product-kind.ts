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

export type StockHintTone = "ok" | "low" | "out" | "info";

export function productStockHint(opts: {
  kind?: string | null;
  trackQty?: boolean;
  available: number;
  qtyLeftLabel: string;
}): { label: string; tone: StockHintTone } {
  const kind = (opts.kind ?? "").toLowerCase();
  const tracks = opts.trackQty !== false;

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
  return { label: "Stock not counted", tone: "info" };
}

export function catalogStockOnHandLabel(opts: {
  kind?: string | null;
  trackInventory?: boolean;
  stockOnHand?: number | null;
}): string {
  if (opts.trackInventory === false) {
    const kind = (opts.kind ?? "").toLowerCase();
    if (kind === "bundle") return "From items inside";
    if (kind === "service") return "No stock (service)";
    if (kind === "digital") return "No stock (digital)";
    return "Not counted";
  }
  if (opts.stockOnHand == null) return "—";
  return String(opts.stockOnHand);
}
