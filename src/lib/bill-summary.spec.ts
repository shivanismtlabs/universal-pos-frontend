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

  it("calculates MRP ₹199 with 10% OFF + 5% GST cash checkout correctly without duplicate discount", () => {
    // 1 item: MRP = 199.00, 10% OFF -> Product Net = 179.10, Product Discount = 19.90
    // GST 5% on 179.10 -> CGST 2.5% (4.48) + SGST 2.5% (4.48) = Total Tax 8.96
    const halfRate = 0.025;
    const lineGross = 179.10;
    const cgst = Math.round((lineGross * halfRate + Number.EPSILON) * 100) / 100; // 4.48
    const sgst = Math.round((lineGross * halfRate + Number.EPSILON) * 100) / 100; // 4.48
    const lineTax = Math.round((cgst + sgst) * 100) / 100; // 8.96

    const bill = buildBillSummary({
      itemsSubtotal: 179.10,
      grossMrp: 199.00,
      productDiscountTotal: 19.90,
      taxTotal: lineTax,
      discount: 0,
      billDiscount: 0,
      lines: [
        {
          lineTotal: 179.10,
          taxAmount: lineTax,
          taxRatePercent: 5,
        },
      ],
      applyRoundOff: true,
    });

    expect(bill.grossMrp).toBe(199.00);
    expect(bill.productDiscountTotal).toBe(19.90);
    expect(bill.productNet).toBe(179.10);
    expect(bill.itemsSubtotal).toBe(179.10);
    expect(bill.billDiscount).toBe(0);
    expect(bill.taxableValue).toBe(179.10);
    expect(bill.taxTotal).toBe(8.96);
    expect(bill.taxSlabs).toHaveLength(1);
    expect(bill.taxSlabs[0].cgst).toBe(4.48);
    expect(bill.taxSlabs[0].sgst).toBe(4.48);
    expect(bill.originalAmount).toBe(188.06);
    expect(bill.roundOffAmount).toBe(-0.06);
    expect(bill.finalAmount).toBe(188.00);
    expect(bill.amountDue).toBe(188.00);
  });
});
