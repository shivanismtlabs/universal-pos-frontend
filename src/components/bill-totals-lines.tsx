"use client";

import { Fragment, type ReactNode } from "react";
import type { BillSummary } from "@/lib/bill-summary";

/**
 * Payment panel + printed bill display order:
 * Total MRP → Product discount → Subtotal (Net) → Bill discount / Points → Fees → Taxable value → CGST/SGST → Round off → Net Payable
 */
export function BillTotalsLines({
  summary,
  discount,
  loyaltyOff = 0,
  formatMoney,
  netAmount,
  netLabel = "Net Payable",
  extraAfterTotal,
  extraBeforeNet,
  showZeroTax = true,
  rowClassName = "flex justify-between text-sm text-[#0b1f33]",
}: {
  summary: BillSummary;
  discount: number;
  loyaltyOff?: number;
  formatMoney: (n: number) => string;
  netAmount: number;
  netLabel?: string;
  showZeroDiscount?: boolean;
  extraAfterTotal?: ReactNode;
  extraBeforeNet?: ReactNode;
  showZeroTax?: boolean;
  rowClassName?: string;
}) {
  const row = rowClassName;
  const billDiscountAmt = discount > 0 ? discount : summary.billDiscount > 0 ? summary.billDiscount : 0;
  const hasProdDiscount = summary.hasProductDiscount || summary.productDiscountTotal > 0;

  return (
    <>
      {hasProdDiscount ? (
        <>
          <div className={row}>
            <span className="text-[#64748b]">Total MRP</span>
            <span className="tabular-nums text-[#64748b]">{formatMoney(summary.grossMrp)}</span>
          </div>
          <div className={row}>
            <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
              <span>Product discount</span>
              {summary.productDiscountPercent > 0 ? (
                <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[0.6875rem] font-bold text-emerald-800">
                  {summary.productDiscountPercent}% OFF
                </span>
              ) : null}
            </span>
            <span className="tabular-nums font-medium text-emerald-700">
              −{formatMoney(summary.productDiscountTotal)}
            </span>
          </div>
          <div className={row}>
            <span className="font-semibold">Subtotal (Net)</span>
            <span className="tabular-nums font-semibold">{formatMoney(summary.productNet)}</span>
          </div>
        </>
      ) : (
        <div className={row}>
          <span>Total</span>
          <span className="tabular-nums">{formatMoney(summary.itemsSubtotal)}</span>
        </div>
      )}

      {/* Bill / Coupon discount applied to whole ticket */}
      {billDiscountAmt > 0 ? (
        <div className={row}>
          <span className="text-[#c2410c] font-medium">
            {hasProdDiscount ? "Bill discount" : "Discount"}
          </span>
          <span className="tabular-nums font-medium text-[#c2410c]">
            −{formatMoney(billDiscountAmt)}
          </span>
        </div>
      ) : null}

      {loyaltyOff > 0 ? (
        <div className={row}>
          <span className="text-[#1a56db]">Points</span>
          <span className="tabular-nums font-medium text-[#1a56db]">
            −{formatMoney(loyaltyOff)}
          </span>
        </div>
      ) : null}

      {summary.fees.map((f) => {
        const amt = Number(f.amount);
        return (
          <div key={f.feeCode} className={row}>
            <span>{f.reason || f.feeCode.replaceAll("_", " ")}</span>
            <span className="tabular-nums">
              {formatMoney(Number.isFinite(amt) ? amt : 0)}
            </span>
          </div>
        );
      })}
      {extraAfterTotal}

      {summary.taxTotal > 0 ? (
        <>
          <div className={row}>
            <span>Taxable value</span>
            <span className="tabular-nums">
              {formatMoney(summary.taxableValue)}
            </span>
          </div>
          {summary.taxSlabs.map((s) =>
            s.rate <= 0 ? (
              <div key="tax" className={row}>
                <span>Tax</span>
                <span className="tabular-nums">{formatMoney(s.tax)}</span>
              </div>
            ) : (
              <Fragment key={s.rate}>
                <div className={row}>
                  <span>CGST {s.halfRate}%</span>
                  <span className="tabular-nums">{formatMoney(s.cgst)}</span>
                </div>
                <div className={row}>
                  <span>SGST {s.halfRate}%</span>
                  <span className="tabular-nums">{formatMoney(s.sgst)}</span>
                </div>
              </Fragment>
            ),
          )}
        </>
      ) : showZeroTax ? (
        <div className={row}>
          <span>Tax</span>
          <span className="tabular-nums">{formatMoney(0)}</span>
        </div>
      ) : null}

      {extraBeforeNet}

      {summary.showRoundOff ? (
        <div className={row}>
          <span>Round off</span>
          <span className="tabular-nums">
            {summary.roundOff > 0 ? "+" : ""}
            {formatMoney(summary.roundOff)}
          </span>
        </div>
      ) : null}

      <div className="flex items-baseline justify-between border-t border-[#e8edf4] pt-2 text-[#0b1f33]">
        <span className="text-base font-bold">{netLabel}</span>
        <span className="text-lg font-bold tabular-nums">
          {formatMoney(netAmount)}
        </span>
      </div>
    </>
  );
}
