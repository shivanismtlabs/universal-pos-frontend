import { roundOffForDisplay } from "@/lib/bill-summary";

/** Cash tenders round; digital (UPI/QR/card) stay exact. */
export function applyRentalCashRoundOff(
  amount: number,
  method: string,
): { amount: number; roundOffAmount: number; originalAmount: number } {
  const originalAmount = Number(amount);
  if (!Number.isFinite(originalAmount) || originalAmount <= 0) {
    return { amount: originalAmount, roundOffAmount: 0, originalAmount };
  }
  if (method !== "cash") {
    return {
      amount: originalAmount,
      roundOffAmount: 0,
      originalAmount,
    };
  }
  const rounded = roundOffForDisplay(originalAmount);
  return {
    amount: rounded.roundedTotal,
    roundOffAmount: rounded.roundOff,
    originalAmount,
  };
}
