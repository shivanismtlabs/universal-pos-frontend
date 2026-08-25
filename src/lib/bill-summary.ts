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
  itemsSubtotal: number;
  discount: number;
  loyaltyOff: number;
  fees: BillFeeRow[];
  feesTotal: number;
  /** Value shown as “Taxable value” (matches receipt: merchandise+fees − discount). */
  taxableValue: number;
  taxTotal: number;
  taxSlabs: GstSlab[];
  taxInclusive: boolean;
  /** Exact grand before round-off display (matches charge settle base when fees/discount applied). */
  grand: number;
  roundOff: number;
  roundedTotal: number;
  showRoundOff: boolean;
  /** Amount to collect / Charge — not forced to roundedTotal. */
  amountDue: number;
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
    const half = Math.round((s.tax / 2) * 100) / 100;
    const halfRate = Math.round((s.rate / 2) * 100) / 100;
    // Keep second half absorbing 0.01 drift so CGST+SGST = tax
    const cgst = half;
    const sgst = Math.round((s.tax - cgst) * 100) / 100;
    return {
      rate: s.rate,
      tax: s.tax,
      halfRate,
      cgst,
      sgst,
    };
  });
}

export function roundOffForDisplay(grand: number): {
  roundedTotal: number;
  roundOff: number;
  showRoundOff: boolean;
} {
  const roundedTotal = Math.round(grand);
  const roundOff = Number((roundedTotal - grand).toFixed(2));
  return {
    roundedTotal,
    roundOff,
    showRoundOff: roundOff !== 0,
  };
}

/**
 * Build a bill summary for payment panel and receipt.
 * Charge / settle must keep using `amountDue` (exact), not `roundedTotal`.
 */
export function buildBillSummary(input: {
  itemsSubtotal: number;
  taxTotal: number;
  discount?: number;
  loyaltyOff?: number;
  fees?: BillFeeRow[];
  taxInclusive?: boolean;
  lines?: BillTaxLine[];
  /** Exact collectable total (ticket after discount/fees). Defaults to computed grand. */
  amountDue?: number;
}): BillSummary {
  const itemsSubtotal = Math.max(0, Number(input.itemsSubtotal) || 0);
  const taxTotal = Math.max(0, Math.round((Number(input.taxTotal) || 0) * 100) / 100);
  const discount = Math.max(0, Number(input.discount) || 0);
  const loyaltyOff = Math.max(0, Number(input.loyaltyOff) || 0);
  const fees = input.fees ?? [];
  const feesTotal = fees.reduce((s, f) => s + moneyNumber(f.amount), 0);
  const taxInclusive = Boolean(input.taxInclusive);

  // Receipt: Taxable Value = (items + fees) − cash discount. Loyalty treated like discount for display.
  const merchandiseAndFees = itemsSubtotal + feesTotal;
  const discountAll = discount + loyaltyOff;
  const taxableValue = Math.max(0, merchandiseAndFees - discountAll);

  // Exclusive: grand adds tax on top of net; inclusive: tax already in item prices.
  const grand = taxInclusive
    ? Math.max(0, merchandiseAndFees - discountAll)
    : Math.max(0, merchandiseAndFees - discountAll + taxTotal);

  const amountDue =
    input.amountDue != null && Number.isFinite(Number(input.amountDue))
      ? Math.max(0, Number(input.amountDue))
      : grand;

  const { roundedTotal, roundOff, showRoundOff } = roundOffForDisplay(grand);
  const rawSlabs = groupGstSlabs(input.lines ?? [], taxTotal);
  const taxSlabs = slabsToGstBreakup(rawSlabs);

  return {
    itemsSubtotal,
    discount,
    loyaltyOff,
    fees,
    feesTotal,
    taxableValue,
    taxTotal,
    taxSlabs,
    taxInclusive,
    grand,
    roundOff,
    roundedTotal,
    showRoundOff,
    amountDue,
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
