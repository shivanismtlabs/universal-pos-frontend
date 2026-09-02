import { moneyNumber } from "@/lib/utils";

export const RETURN_CONDITIONS = [
  "good",
  "damaged",
  "defective",
  "opened",
  "used",
  "quarantine",
  "scrap",
] as const;

export type ReturnCondition = (typeof RETURN_CONDITIONS)[number];

/** Parse qty text; null = not a finite number. */
export function parseReturnQty(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const n = moneyNumber(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Clamp qty to [min, max]; whole units when max is a whole number. */
export function clampQtyInput(
  raw: string,
  max: number,
  opts?: { min?: number },
): string {
  const min = opts?.min ?? 0;
  const trimmed = raw.trim();
  if (!trimmed) return "0";
  const n = moneyNumber(trimmed);
  if (!Number.isFinite(n)) return "0";
  let capped = Math.min(max, Math.max(min, n));
  if (max > 0 && Number.isInteger(max)) {
    capped = Math.floor(capped);
  } else {
    capped = Math.round(capped * 1000) / 1000;
  }
  return String(capped);
}

/** Validate return line qty against remaining returnable on the original sale. */
export function returnQtyError(raw: string, max: number): string | undefined {
  if (max <= 0) {
    const n = parseReturnQty(raw);
    if (n != null && n > 0) return "Nothing left to return for this item";
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "0") return undefined;
  const n = parseReturnQty(raw);
  if (n === null) return "Enter a valid quantity";
  if (n < 0) return "Quantity cannot be negative";
  if (n > max + 1e-9) {
    return `Max ${max} — only ${max} left to return`;
  }
  if (n > 0 && n < 1 - 1e-9) {
    return "Minimum return quantity is 1";
  }
  return undefined;
}

/** Validate exchange replacement qty against stock on hand. */
export function replaceQtyError(raw: string, maxSoh: number): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "0") return undefined;
  const n = parseReturnQty(raw);
  if (n === null) return "Enter a valid quantity";
  if (n < 0) return "Quantity cannot be negative";
  if (maxSoh <= 0) return "Out of stock";
  if (n > maxSoh + 1e-9) {
    return `Max ${maxSoh} in stock`;
  }
  if (n > 0 && n < 0.001 - 1e-9) {
    return "Minimum quantity is 0.001";
  }
  return undefined;
}

export function qtyExceedsMax(raw: string, max: number): boolean {
  const n = parseReturnQty(raw);
  return n !== null && n > max + 1e-9;
}
