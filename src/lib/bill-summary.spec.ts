import {
  buildBillSummary,
  roundOffForDisplay,
  shouldApplyCashRoundOff,
} from "./bill-summary";

describe("roundOffForDisplay", () => {
  it("rounds half-up to nearest rupee", () => {
    expect(roundOffForDisplay(100.75)).toEqual({
      originalAmount: 100.75,
      roundedTotal: 101,
      roundOff: 0.25,
      finalAmount: 101,
      showRoundOff: true,
    });
    expect(roundOffForDisplay(100.49)).toMatchObject({
      originalAmount: 100.49,
      finalAmount: 100,
      roundOff: -0.49,
    });
  });
});

describe("shouldApplyCashRoundOff", () => {
  it("only allows full cash", () => {
    expect(shouldApplyCashRoundOff("cash")).toBe(true);
    expect(shouldApplyCashRoundOff("upi")).toBe(false);
    expect(shouldApplyCashRoundOff("qr")).toBe(false);
    expect(shouldApplyCashRoundOff("card")).toBe(false);
    expect(shouldApplyCashRoundOff("cash", { splitPay: true })).toBe(false);
  });
});

describe("buildBillSummary", () => {
  it("defaults to exact amount (no round-off)", () => {
    const bill = buildBillSummary({
      itemsSubtotal: 100.75,
      taxTotal: 0,
    });
    expect(bill.originalAmount).toBe(100.75);
    expect(bill.finalAmount).toBe(100.75);
    expect(bill.roundOffAmount).toBe(0);
    expect(bill.showRoundOff).toBe(false);
  });

  it("uses exact amount for digital (no round-off)", () => {
    const bill = buildBillSummary({
      itemsSubtotal: 100.75,
      taxTotal: 0,
      applyRoundOff: false,
    });
    expect(bill.originalAmount).toBe(100.75);
    expect(bill.finalAmount).toBe(100.75);
    expect(bill.amountDue).toBe(100.75);
    expect(bill.roundOffAmount).toBe(0);
    expect(bill.showRoundOff).toBe(false);
  });

  it("rounds for cash", () => {
    const bill = buildBillSummary({
      itemsSubtotal: 100.75,
      taxTotal: 0,
      applyRoundOff: true,
    });
    expect(bill.originalAmount).toBe(100.75);
    expect(bill.finalAmount).toBe(101);
    expect(bill.roundOffAmount).toBe(0.25);
    expect(bill.showRoundOff).toBe(true);
  });
});
