export type DiningFeeLine = {
  feeCode: string;
  reason: string;
  amount: number;
};

/** Mirror of backend restaurant-policy diningFeesFromConfig. */
export function diningFeesFromConfig(opts: {
  diningMode?: string | null;
  merchandiseAfterDiscount: number;
  serviceChargePercent?: number | null;
  packagingCharge?: number | null;
  deliveryCharge?: number | null;
  areaTaxPercent?: number | null;
}): DiningFeeLine[] {
  const mode = opts.diningMode ?? "";
  const base = Math.max(0, Number(opts.merchandiseAfterDiscount) || 0);
  const fees: DiningFeeLine[] = [];
  const servicePct = Number(opts.serviceChargePercent);
  if (
    mode === "dine_in" &&
    Number.isFinite(servicePct) &&
    servicePct > 0 &&
    base > 0
  ) {
    const amount = Math.round(((base * servicePct) / 100) * 100) / 100;
    if (amount > 0) {
      fees.push({
        feeCode: "service_charge",
        reason: `Service ${servicePct}%`,
        amount,
      });
    }
  }
  const pack = Number(opts.packagingCharge);
  if (
    (mode === "takeaway" ||
      mode === "pickup" ||
      mode === "delivery" ||
      mode === "online") &&
    Number.isFinite(pack) &&
    pack > 0
  ) {
    fees.push({
      feeCode: "packaging",
      reason: "Packaging",
      amount: Math.round(pack * 100) / 100,
    });
  }
  const delivery = Number(opts.deliveryCharge);
  if (mode === "delivery" && Number.isFinite(delivery) && delivery > 0) {
    fees.push({
      feeCode: "delivery",
      reason: "Delivery",
      amount: Math.round(delivery * 100) / 100,
    });
  }
  const areaTax = Number(opts.areaTaxPercent);
  if (Number.isFinite(areaTax) && areaTax > 0 && base > 0) {
    const amount = Math.round(((base * areaTax) / 100) * 100) / 100;
    if (amount > 0) {
      fees.push({
        feeCode: "area_tax",
        reason: `Area tax ${areaTax}%`,
        amount,
      });
    }
  }
  return fees;
}
