"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import JsBarcode from "jsbarcode";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { moneyNumber } from "@/lib/utils";
import { useBootstrapOptional } from "@/lib/bootstrap";
import { notifyApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";

function ReceiptOrderBarcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const trimmed = value.trim();
  useEffect(() => {
    if (!ref.current || !trimmed) return;
    try {
      JsBarcode(ref.current, trimmed, {
        format: "CODE128",
        displayValue: false,
        height: 36,
        width: 1.4,
        margin: 0,
        background: "#ffffff",
        lineColor: "#111827",
      });
    } catch {
      /* ignore invalid */
    }
  }, [trimmed]);
  if (!trimmed) return null;
  return (
    <div className="mt-2 flex flex-col items-center">
      <svg ref={ref} className="max-w-full" />
      <p className="mt-0.5 font-mono text-[10px] tracking-wide">{trimmed}</p>
    </div>
  );
}

export type ReceiptData = {
  store: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    shopName?: string | null;
    taxId?: string | null;
  };
  orderId?: string;
  orderNumber: string;
  kind?: string | null;
  cashier?: string | null;
  receiptFooter?: string | null;
  printedAt?: string | Date | null;
  customer?: {
    id?: string;
    fullName: string;
    phone?: string | null;
    email?: string | null;
  } | null;
  items: Array<{
    itemType: string;
    description?: string | null;
    quantity?: string | number;
    unitPrice: string | number;
    lineTotal?: string | number;
    taxAmount?: string | number;
    taxRatePercent?: string | number | null;
    taxCode?: string | null;
    hsnOrSac?: string | null;
    inventoryUnit?: { barcodeSku: string; size?: string | null } | null;
    retailSku?: { sku: string } | null;
    product?: { name?: string; skuCode?: string } | null;
    tracking?: {
      variantId?: string;
      batchId?: string;
      serialNumber?: string;
    };
  }>;
  totals: {
    subtotal: string | number;
    taxTotal: string | number;
    discountTotal?: string | number;
    depositTotal: string | number;
    balanceDue: string | number;
  };
  payments?: Array<{
    method: string;
    type: string;
    amount: string | number;
    status?: string;
    gatewayRef?: string | null;
    provider?: string | null;
  }>;
  register?: { sessionId?: string | null } | null;
  remainingDue?: string | number | null;
  amountPaid?: string | number | null;
  change?: string | number | null;
  cashTendered?: string | number | null;
  fulfillment?: {
    orderType?: string;
    resourceId?: string;
    covers?: number;
    note?: string;
  } | null;
  rentalWindow?: {
    pickupDate?: string | null;
    returnDueDate?: string | null;
    lifecycle?: string | null;
  } | null;
};

function moneyLabel(method: string) {
  const m = method.trim().toLowerCase();
  if (m === "card" || m === "stripe") return "Card";
  if (m === "cash") return "Cash";
  if (m === "upi") return "UPI";
  if (m === "emi") return "EMI";
  if (m === "qr") return "QR";
  if (m === "wallet") return "App pay";
  if (m === "bank_transfer") return "Bank transfer";
  if (m === "store_credit") return "Wallet";
  if (m === "gift_card") return "Gift card";
  return method.charAt(0).toUpperCase() + method.slice(1).replace(/_/g, " ");
}

function pad2(n: number) {
  return n.toFixed(2);
}

function gstSlabs(
  items: ReceiptData["items"],
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

export function ReceiptModal({
  data,
  loading,
  onClose,
  change,
  cashTendered,
}: {
  data: ReceiptData | null | undefined;
  loading?: boolean;
  onClose: () => void;
  change?: string | number | null;
  cashTendered?: string | number | null;
}) {
  const boot = useBootstrapOptional();
  const shopName =
    data?.store?.shopName?.trim() ||
    boot?.data?.tenant?.name?.trim() ||
    boot?.productName?.trim() ||
    "Store";
  const settings = boot?.data?.tenant?.settings as
    | {
        tax?: { receiptFooter?: string };
        pos?: { upiVpa?: string; upiPayeeName?: string };
      }
    | undefined;
  const receiptFooter =
    data?.receiptFooter?.trim() ||
    settings?.tax?.receiptFooter?.trim() ||
    "";
  const taxId = data?.store?.taxId?.trim() || "";
  const pos =
    settings?.pos && typeof settings.pos === "object" ? settings.pos : {};
  const upiVpa = typeof pos.upiVpa === "string" ? pos.upiVpa.trim() : "";
  const upiPayee =
    (typeof pos.upiPayeeName === "string" && pos.upiPayeeName.trim()) ||
    shopName;

  const paidFromPayments = (data?.payments ?? []).reduce(
    (s, p) => s + moneyNumber(p.amount),
    0,
  );
  const paidTotal =
    paidFromPayments > 0
      ? paidFromPayments
      : Math.max(
          0,
          moneyNumber(data?.totals.subtotal) +
            moneyNumber(data?.totals.taxTotal) -
            moneyNumber(data?.totals.discountTotal) +
            moneyNumber(data?.totals.depositTotal),
        );

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const changeAmt = change ?? data?.change;
  const tenderedAmt = cashTendered ?? data?.cashTendered;
  const balanceDue = moneyNumber(data?.totals.balanceDue);
  const isPaid = balanceDue <= 0;
  const [sending, setSending] = useState(false);

  const subtotal = moneyNumber(data?.totals.subtotal);
  const taxTotal = moneyNumber(data?.totals.taxTotal);
  const discount = moneyNumber(data?.totals.discountTotal);
  const grand = Math.max(0, subtotal - discount + taxTotal);
  const rounded = Math.round(grand);
  const roundOff = Number((rounded - grand).toFixed(2));
  const slabs = data ? gstSlabs(data.items, taxTotal) : [];
  const when = data?.printedAt
    ? new Date(data.printedAt)
    : new Date();
  const whenLabel = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}-${String(when.getDate()).padStart(2, "0")} ${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;

  async function sendChannels(channels: Array<"email" | "sms">) {
    if (!data?.customer?.id) {
      toast.error("Add a customer on the bill to send it");
      return;
    }
    if (channels.includes("email") && !data.customer.email) {
      toast.error("This customer has no email");
      return;
    }
    if (channels.includes("sms") && !data.customer.phone) {
      toast.error("This customer has no phone");
      return;
    }
    setSending(true);
    try {
      if (data.orderId) {
        const res = await notifyApi.sendInvoice({
          orderId: data.orderId,
          channels,
        });
        const ok = res.results.filter((r) =>
          String(r.status).startsWith("sent"),
        ).length;
        toast.success(
          ok
            ? `Invoice sent on ${ok} channel(s)`
            : "Send attempted — check Alerts / Notify",
        );
      } else {
        for (const channel of channels) {
          await notifyApi.send({
            channel,
            templateKey: "sale_invoice",
            customerId: data.customer.id,
            phone: data.customer.phone ?? undefined,
            email: data.customer.email ?? undefined,
            payload: {
              orderNumber: data.orderNumber,
              total: String(paidTotal),
              balanceDue: String(balanceDue),
              storeName: shopName,
              customerName: data.customer.fullName,
              subtotal: String(data.totals.subtotal),
              taxTotal: String(data.totals.taxTotal),
            },
          });
        }
        toast.success("Invoice sent");
      }
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Send failed",
      );
    } finally {
      setSending(false);
    }
  }

  const dash = (
    <p className="my-1.5 overflow-hidden text-center text-[11px] tracking-tight text-black">
      ----------------------------------------
    </p>
  );

  const content = (
    <div className="receipt-print-root fixed inset-0 z-[100] flex items-center justify-center bg-[#0b1f33]/45 p-4 print:static print:block print:bg-white print:p-0">
      <button
        type="button"
        className="absolute inset-0 print:hidden"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="receipt-sheet relative z-10 flex max-h-[92vh] w-full max-w-[400px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_48px_-20px_rgba(11,31,51,0.35)] print:max-h-none print:w-full print:max-w-none print:overflow-visible print:rounded-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-[#e8ebf0] px-4 py-3 print:hidden">
          <div>
            <p className="text-[0.7rem] font-semibold text-[#5a6b7d]">
              GST invoice
            </p>
            <p className="text-base font-semibold text-[#0b1f33]">
              Print this bill
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {data?.customer ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={sending}
                  onClick={() => void sendChannels(["email"])}
                >
                  Email
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={sending}
                  onClick={() => void sendChannels(["sms"])}
                >
                  SMS
                </Button>
              </>
            ) : null}
            <Button type="button" size="sm" onClick={() => window.print()}>
              Print
            </Button>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5a6b7d] hover:bg-[#f1f5f9]"
              aria-label="Close"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="scroll-soft flex-1 overflow-y-auto px-4 py-4 print:overflow-visible print:px-0 print:py-0">
          {loading ? (
            <p className="py-10 text-center text-sm text-[#5a6b7d] print:hidden">
              Loading bill…
            </p>
          ) : !data ? (
            <p className="py-10 text-center text-sm text-[#c81e1e] print:hidden">
              Bill not found
            </p>
          ) : (
            <div className="receipt-print mx-auto w-full max-w-[280px] bg-white font-mono text-[12px] leading-[1.35] text-black print:max-w-none">
              <header className="text-center">
                <p className="text-[13px] font-bold tracking-wide uppercase">
                  POS GST INVOICE
                </p>
                <p className="mt-1 font-bold">{shopName}</p>
                {data.store.address ? (
                  <p className="whitespace-pre-wrap">{data.store.address}</p>
                ) : null}
                {taxId ? <p>GSTIN: {taxId}</p> : null}
                {data.store.phone ? <p>Phone: {data.store.phone}</p> : null}
              </header>
              {dash}
              <section>
                <p>Invoice No: {data.orderNumber}</p>
                <p>Date & Time: {whenLabel}</p>
                {data.cashier ? <p>Cashier: {data.cashier}</p> : null}
                <p>Bill To: {data.customer ? "Customer" : "Walk-in"}</p>
                {data.customer?.fullName ? (
                  <p>Customer Name: {data.customer.fullName}</p>
                ) : null}
                {data.customer?.phone ? (
                  <p>Customer Phone: {data.customer.phone}</p>
                ) : null}
              </section>
              {dash}
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-1 font-bold">
                <span>Item</span>
                <span className="w-8 text-right">Qty</span>
                <span className="w-12 text-right">Rate</span>
                <span className="w-12 text-right">Amt</span>
              </div>
              {dash}
              {data.items.map((item, i) => {
                const qty = moneyNumber(item.quantity ?? 1);
                const label =
                  item.description ||
                  item.product?.name ||
                  item.inventoryUnit?.barcodeSku ||
                  item.retailSku?.sku ||
                  item.itemType;
                const amt =
                  item.lineTotal !== undefined
                    ? moneyNumber(item.lineTotal)
                    : moneyNumber(item.unitPrice) * qty;
                const rate = moneyNumber(item.unitPrice);
                const taxAmt = moneyNumber(item.taxAmount);
                let gst = moneyNumber(item.taxRatePercent ?? 0);
                // Prefer amount-derived % when stored rate missing or looks like HSN bleed
                if (taxAmt > 0 && amt > 0) {
                  const derived = Math.round((taxAmt / amt) * 1000) / 10;
                  if (!gst || gst > 28) gst = derived;
                }
                const rawHsn = (item.hsnOrSac || item.taxCode || "").trim();
                // Don't print rate tags (GST5) as HSN; keep real HSN/SAC
                const hsn =
                  rawHsn && !/^(?:GST|VAT|TAX)\s*\d/i.test(rawHsn)
                    ? rawHsn
                    : "";
                return (
                  <div key={i} className="mb-1.5">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-1">
                      <span className="min-w-0 break-words pr-1">{label}</span>
                      <span className="w-8 text-right tabular-nums">
                        {qty % 1 === 0 ? String(qty) : pad2(qty)}
                      </span>
                      <span className="w-12 text-right tabular-nums">
                        {pad2(rate)}
                      </span>
                      <span className="w-12 text-right tabular-nums">
                        {pad2(amt)}
                      </span>
                    </div>
                    {hsn || gst ? (
                      <p className="text-[11px]">
                        {hsn ? `HSN: ${hsn}` : null}
                        {hsn && gst ? " | " : null}
                        {gst ? `GST: ${gst}%` : null}
                      </p>
                    ) : null}
                  </div>
                );
              })}
              {dash}
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="tabular-nums">{pad2(subtotal)}</span>
              </div>
              {discount > 0 ? (
                <div className="flex justify-between">
                  <span>Discount</span>
                  <span className="tabular-nums">{pad2(discount)}</span>
                </div>
              ) : (
                <div className="flex justify-between">
                  <span>Discount</span>
                  <span className="tabular-nums">0.00</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Taxable Value</span>
                <span className="tabular-nums">{pad2(subtotal - discount)}</span>
              </div>
              {slabs.length ? (
                <div className="mt-1 bg-[#f3f4f6] px-1 py-1 print:bg-[#f3f4f6]">
                  <p className="font-bold">GST Breakup</p>
                  {slabs.map((s) => {
                    const half = s.tax / 2;
                    const halfPct = s.rate / 2;
                    if (s.rate <= 0) {
                      return (
                        <div key="tax" className="flex justify-between">
                          <span>Tax</span>
                          <span className="tabular-nums">{pad2(s.tax)}</span>
                        </div>
                      );
                    }
                    return (
                      <div key={s.rate}>
                        <div className="flex justify-between">
                          <span>CGST {pad2(halfPct)}%</span>
                          <span className="tabular-nums">{pad2(half)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>SGST {pad2(halfPct)}%</span>
                          <span className="tabular-nums">{pad2(half)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <div className="mt-1 flex justify-between font-bold">
                <span>Grand Total</span>
                <span className="tabular-nums">{pad2(grand)}</span>
              </div>
              {roundOff !== 0 ? (
                <div className="flex justify-between">
                  <span>Round Off</span>
                  <span className="tabular-nums">
                    {roundOff > 0 ? "+" : ""}
                    {pad2(roundOff)}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between font-bold">
                <span>Rounded Total</span>
                <span className="tabular-nums">{pad2(rounded)}</span>
              </div>
              {tenderedAmt != null && moneyNumber(tenderedAmt) > 0 ? (
                <div className="flex justify-between">
                  <span>Cash tendered</span>
                  <span className="tabular-nums">
                    {pad2(moneyNumber(tenderedAmt))}
                  </span>
                </div>
              ) : null}
              {changeAmt != null && moneyNumber(changeAmt) > 0 ? (
                <div className="flex justify-between">
                  <span>Change</span>
                  <span className="tabular-nums">
                    {pad2(moneyNumber(changeAmt))}
                  </span>
                </div>
              ) : null}
              {dash}
              {(data.payments ?? []).map((p, i) => (
                <div key={i} className="flex justify-between">
                  <span>
                    {moneyLabel(p.method)}
                    {p.status && p.status !== "succeeded"
                      ? ` (${p.status})`
                      : ""}
                  </span>
                  <span className="tabular-nums">
                    {pad2(moneyNumber(p.amount))}
                  </span>
                </div>
              ))}
              <div className="mt-1 flex justify-between font-bold">
                <span>{isPaid ? "Amount Paid" : "Balance due"}</span>
                <span className="tabular-nums">
                  {pad2(isPaid ? paidTotal : balanceDue)}
                </span>
              </div>
              {upiVpa ? (
                <div className="mt-3 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt="Pay QR"
                    className="mx-auto h-28 w-28 bg-white"
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                      `upi://pay?pa=${encodeURIComponent(upiVpa)}&pn=${encodeURIComponent(upiPayee)}&am=${rounded.toFixed(2)}&cu=INR&tn=${encodeURIComponent(data.orderNumber)}`,
                    )}`}
                  />
                  <p className="mt-1 font-bold">Scan & Pay</p>
                  <p>UPI ID: {upiVpa}</p>
                  <p>Account Name: {upiPayee}</p>
                </div>
              ) : null}
              {dash}
              <ReceiptOrderBarcode value={data.orderNumber} />
              <p className="text-center font-bold">
                {receiptFooter || "Thank you! Visit again."}
              </p>
              <p className="mt-1 text-center text-[11px]">
                GST included as applicable.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
