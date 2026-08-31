export type SaleReturnLineRow = {
  kind?: "return" | "replace" | string;
  name?: string | null;
  sku?: string | null;
  quantity?: number | string;
  condition?: string | null;
  unitPrice?: number | string;
};

/** Split return-event itemsJson into returned vs exchange replacement lines. */
export function parseSaleReturnItems(items: unknown): {
  returned: SaleReturnLineRow[];
  replaced: SaleReturnLineRow[];
  isExchange: boolean;
} {
  const arr = Array.isArray(items)
    ? (items as SaleReturnLineRow[])
    : [];
  const hasKind = arr.some((i) => i.kind != null);
  if (!hasKind) {
    return { returned: arr, replaced: [], isExchange: false };
  }
  const returned = arr.filter((i) => i.kind !== "replace");
  const replaced = arr.filter((i) => i.kind === "replace");
  return {
    returned,
    replaced,
    isExchange: replaced.length > 0,
  };
}

export function formatReturnLine(it: SaleReturnLineRow): string {
  const label = (it.name ?? it.sku ?? "Item").trim() || "Item";
  const qty =
    it.quantity != null && String(it.quantity).trim() !== ""
      ? ` × ${it.quantity}`
      : "";
  const cond = it.condition ? ` (${it.condition})` : "";
  return `${label}${qty}${cond}`;
}
