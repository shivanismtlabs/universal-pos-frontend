import { moneyNumber } from "@/lib/utils";

/** Line input for GST slab grouping (cart preview or receipt items). */
export type BillTaxLine = {
  lineTotal?: string | number | null;
  taxAmount?: string | number | null;
  taxRatePercent?: string | number | null;
};

export type BillFeeRow = {
  feeCode: string;
  reason?: string | null;
  amount: string | number;
};

export type GstSlab = {
  rate: number;
  tax: number;
  halfRate: number;
  cgst: number;
  sgst: number;
};

export type BillSummary = {
  /** Gross MRP across all items (before product discounts) */
  grossMrp: number;
  /** Total product/SKU discounts */
  productDiscountTotal: number;
  /** Product Net (grossMrp - productDiscountTotal) */
  productNet: number;
  /** Items subtotal after product discount */
  itemsSubtotal: number;
  /** Bill-level / Cashier discount (after product net) */
  discount: number;
  /** Alias for bill discount */
  billDiscount: number;
  loyaltyOff: number;
  /** Items − discount − points (before fees / tax add-on). */
  netAmount: number;
  fees: BillFeeRow[];
  feesTotal: number;
  /** Value shown as “Taxable value” (matches receipt: merchandise+fees − discount). */
  taxableValue: number;
  taxTotal: number;
  taxSlabs: GstSlab[];
  taxInclusive: boolean;
  /** Exact grand before payment round-off (original payable). */
  grand: number;
  /** Alias: same as grand — exact amount before cash round-off. */
  originalAmount: number;
  roundOff: number;
  /** Alias: same as roundOff — adjustment for cash-only nearest rupee. */
  roundOffAmount: number;
  roundedTotal: number;
  showRoundOff: boolean;
  /** Amount to collect — finalAmount (exact for digital, rounded for cash). */
  amountDue: number;
  /** Alias: same as amountDue. */
  finalAmount: number;
  hasProductDiscount: boolean;
  productDiscountPercent: number;
};

/**
 * Group line taxes into GST rate slabs (same rules as the thermal receipt).
 * CGST/SGST are halves of each slab for display — matches printed bill.
 */
export function groupGstSlabs(
  items: BillTaxLine[],
  taxTotal: number,
): Array<{ rate: number; tax: number }> {
  const map = new Map<number, number>();
  let summed = 0;
  for (const item of items) {
    const tax = moneyNumber(item.taxAmount);
    if (tax <= 0) continue;
    const line = moneyNumber(item.lineTotal);
    let rate = moneyNumber(item.taxRatePercent ?? 0);
    // HSN codes were once misread as rates (capped at 40) — prefer real math
    if (!rate || rate > 28) {
      if (line > 0) rate = (tax / line) * 100;
    }
    const key = Math.round(rate * 10) / 10;
    map.set(key, (map.get(key) ?? 0) + tax);
    summed += tax;
  }
  if (!map.size && taxTotal > 0) {
    return [{ rate: 0, tax: taxTotal }];
  }
  if (map.size && Math.abs(summed - taxTotal) > 0.05 && taxTotal > summed) {
    map.set(0, (map.get(0) ?? 0) + (taxTotal - summed));
  }
  return [...map.entries()]
    .map(([rate, tax]) => ({ rate, tax }))
    .sort((a, b) => b.rate - a.rate);
}

export function slabsToGstBreakup(
  slabs: Array<{ rate: number; tax: number }>,
): GstSlab[] {
  return slabs.map((s) => {
    const halfRate = Math.round((s.rate / 2) * 100) / 100;
    const half = Math.round(((s.tax / 2) + Number.EPSILON) * 100) / 100;
    const cgst = half;
    const sgst = Math.round(((s.tax - half) + Number.EPSILON) * 100) / 100;
    const tax = Math.round((cgst + sgst) * 100) / 100;
    return {
      rate: s.rate,
      tax,
      halfRate,
      cgst,
      sgst,
    };
  });
}

/**
 * Half-up to nearest rupee (Indian POS round-off):
 * - paisa &lt; 50 → round down (289.40 → 289)
 * - paisa ≥ 50 → round up   (289.50 → 290, 289.60 → 290)
 */
export function roundToNearestRupee(amount: number): number {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

export function roundOffForDisplay(grand: number): {
  roundedTotal: number;
  roundOff: number;
  showRoundOff: boolean;
  originalAmount: number;
  finalAmount: number;
} {
  const exact = Math.max(0, Number(grand) || 0);
  const roundedTotal = roundToNearestRupee(exact);
  const roundOff = Number((roundedTotal - exact).toFixed(2));
  return {
    originalAmount: exact,
    roundedTotal,
    roundOff,
    finalAmount: roundedTotal,
    showRoundOff: roundOff !== 0,
  };
}

/** Nearest-rupee round-off applies only to full cash collection (not split/digital). */
export function shouldApplyCashRoundOff(
  payMethod: string,
  opts?: { splitPay?: boolean; splitSession?: boolean },
): boolean {
  if (opts?.splitPay || opts?.splitSession) return false;
  return payMethod === "cash";
}

/**
 * Build a bill summary for payment panel and receipt.
 * Cash: amountDue defaults to nearest-rupee half-up (applyRoundOff true).
 * UPI / QR / card / other digital: exact paise (applyRoundOff false).
 */
export function buildBillSummary(input: {
  itemsSubtotal: number;
  taxTotal: number;
  grossMrp?: number;
  productDiscountTotal?: number;
  discount?: number;
  billDiscount?: number;
  loyaltyOff?: number;
  fees?: BillFeeRow[];
  taxInclusive?: boolean;
  lines?: BillTaxLine[];
  /**
   * Collectable total. When omitted, uses finalAmount from round-off rules.
   */
  amountDue?: number;
  /** When true, amountDue = roundedTotal (cash-only). Default false = exact paise. */
  applyRoundOff?: boolean;
  /** When set, show this round-off line instead of recomputing from grand. */
  roundOffOverride?: number;
}): BillSummary {
  const itemsSubtotal = Math.max(0, Number(input.itemsSubtotal) || 0);
  const taxTotal = Math.max(0, Math.round((Number(input.taxTotal) || 0) * 100) / 100);
  const productDiscountTotal = Math.max(0, Number(input.productDiscountTotal) || 0);
  const grossMrp = Math.max(itemsSubtotal, Number(input.grossMrp) || (itemsSubtotal + productDiscountTotal));
  const productNet = itemsSubtotal;
  const discount = Math.max(0, Number(input.discount ?? input.billDiscount) || 0);
  const loyaltyOff = Math.max(0, Number(input.loyaltyOff) || 0);
  const fees = input.fees ?? [];
  const feesTotal = fees.reduce((s, f) => s + moneyNumber(f.amount), 0);
  const taxInclusive = Boolean(input.taxInclusive);
  const applyRoundOff = input.applyRoundOff === true;

  // Display order (payment + print): Total → Taxable value → CGST/SGST → Discount → Net Payable
  // Charge math: Items → Discount → Net → (+fees) → Taxable → Tax → Grand → Round off
  const merchandiseAndFees = itemsSubtotal + feesTotal;
  const discountAll = discount + loyaltyOff;
  const netAmount = Math.max(0, itemsSubtotal - discountAll);
  const taxableValue = taxInclusive
    ? Math.max(0, merchandiseAndFees - discountAll - taxTotal)
    : Math.max(0, merchandiseAndFees - discountAll);

  // Exclusive: grand adds tax on top of net; inclusive: tax already in item prices.
  const grand = taxInclusive
    ? Math.max(0, merchandiseAndFees - discountAll)
    : Math.max(0, merchandiseAndFees - discountAll + taxTotal);

  const computedRound = roundOffForDisplay(grand);
  const roundOff =
    input.roundOffOverride != null
      ? Number(input.roundOffOverride)
      : applyRoundOff
        ? computedRound.roundOff
        : 0;
  const showRoundOff = Math.abs(roundOff) >= 0.005;
  const roundedTotal = applyRoundOff
    ? computedRound.roundedTotal
    : Number(grand.toFixed(2));

  const amountDue =
    input.amountDue != null && Number.isFinite(Number(input.amountDue))
      ? Math.max(0, Number(input.amountDue))
      : applyRoundOff
        ? roundedTotal
        : Number(grand.toFixed(2));

  const rawSlabs = groupGstSlabs(input.lines ?? [], taxTotal);
  const taxSlabs = slabsToGstBreakup(rawSlabs);

  return {
    grossMrp,
    productDiscountTotal,
    productNet,
    itemsSubtotal,
    discount,
    billDiscount: discount,
    loyaltyOff,
    netAmount,
    fees,
    feesTotal,
    taxableValue,
    taxTotal,
    taxSlabs,
    taxInclusive,
    grand,
    originalAmount: Number(grand.toFixed(2)),
    roundOff,
    roundOffAmount: roundOff,
    roundedTotal,
    showRoundOff,
    amountDue,
    finalAmount: amountDue,
    hasProductDiscount: productDiscountTotal > 0,
    productDiscountPercent:
      grossMrp > 0
        ? Math.round(((productDiscountTotal / grossMrp) * 100) * 10) / 10
        : 0,
  };
}

/** Per-line tax for cart preview (mirrors Sale POS tax loop). */
export function lineTaxAmount(
  lineGross: number,
  taxRateFraction: number,
  inclusive: boolean,
): number {
  if (taxRateFraction <= 0 || lineGross <= 0) return 0;
  if (inclusive) {
    const net = lineGross / (1 + taxRateFraction);
    return lineGross - net;
  }
  return lineGross * taxRateFraction;
}

/** Cash change: tendered − amount due (never negative). */
export function cashChangeDue(tendered: number, amountDue: number): number {
  const t = Math.max(0, Number(tendered) || 0);
  const due = Math.max(0, Number(amountDue) || 0);
  return Math.max(0, Math.round((t - due) * 100) / 100);
}
