"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import JsBarcode from "jsbarcode";
import { Printer, X, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { moneyNumber } from "@/lib/utils";
import { useBootstrapOptional } from "@/lib/bootstrap";
import { notifyApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { buildBillSummary } from "@/lib/bill-summary";

function ReceiptOrderBarcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const trimmed = value.trim();
  useEffect(() => {
    if (!ref.current || !trimmed) return;
    try {
      JsBarcode(ref.current, trimmed, {
        format: "CODE128",
        displayValue: false,
        height: 34,
        width: 1.4,
        margin: 0,
        background: "#ffffff",
        lineColor: "#111827",
      });
    } catch {
      /* ignore invalid barcode */
    }
  }, [trimmed]);
  if (!trimmed) return null;
  return (
    <div className="mt-2 flex flex-col items-center">
      <svg ref={ref} className="max-w-full" />
      <p className="mt-0.5 font-mono text-[10px] tracking-wider text-black">
        {trimmed}
      </p>
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
  currencyCode?: string;
  customer?: {
    id?: string;
    fullName: string;
    phone?: string | null;
    email?: string | null;
  } | null;
  items: Array<{
    itemType: string;
    itemKind?: string | null;
    description?: string | null;
    quantity?: string | number;
    unitPrice: string | number;
    lineTotal?: string | number;
    taxAmount?: string | number;
    taxRatePercent?: string | number | null;
    taxCode?: string | null;
    hsnOrSac?: string | null;
    durationDays?: number | null;
    durationHours?: number | null;
    ratePeriod?: string | null;
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
    feesTotal?: string | number;
  };
  fees?: Array<{
    feeCode: string;
    reason?: string | null;
    amount: string | number;
  }>;
  paymentRounding?: {
    originalAmount?: number;
    roundOffAmount?: number;
    finalAmount?: number;
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
  invoices?: Array<{
    id: string;
    invoiceNumber: string;
    grandTotal?: string | number;
    taxBreakdown?: Record<string, unknown> | null;
    createdAt?: string;
  }>;
  activeInvoiceNumber?: string | null;
  activeInvoiceLabel?: string | null;
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
  if (m === "store_credit") return "Store credit";
  if (m === "gift_card") return "Gift card";
  return method.charAt(0).toUpperCase() + method.slice(1).replace(/_/g, " ");
}

function pad2(n: number) {
  return n.toFixed(2);
}

function formatShortDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const day = String(date.getDate()).padStart(2, "0");
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const mins = String(date.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year} ${hours}:${mins}`;
}

function formatOnlyDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const day = String(date.getDate()).padStart(2, "0");
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function computeDurationLabel(
  startStr?: string | null,
  endStr?: string | null,
): string {
  if (!startStr || !endStr) return "1 Day";
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "1 Day";
  }
  const diffMs = Math.max(0, end.getTime() - start.getTime());
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays >= 1) {
    return diffDays === 1 ? "1 Day" : `${diffDays} Days`;
  }
  if (diffHours >= 1) {
    return diffHours === 1 ? "1 Hour" : `${diffHours} Hours`;
  }
  return "1 Day";
}

export function ReceiptModal({
  data,
  loading,
  onClose,
  change,
  cashTendered: _cashTendered,
}: {
  data: ReceiptData | null | undefined;
  loading?: boolean;
  onClose: () => void;
  change?: string | number | null;
  cashTendered?: string | number | null;
}) {
  const boot = useBootstrapOptional();
  const currencyCode = data?.currencyCode || boot?.currencyCode || "INR";
  const currencySymbol =
    currencyCode === "USD"
      ? "$"
      : currencyCode === "EUR"
        ? "€"
        : currencyCode === "GBP"
          ? "£"
          : "₹";
  const [viewMode, setViewMode] = useState<"thermal" | "a4">("thermal");

  const shopName =
    data?.store?.shopName?.trim() ||
    data?.store?.name?.trim() ||
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
    "Thank you! Visit again.";

  const taxId = data?.store?.taxId?.trim() || "";
  const pos =
    settings?.pos && typeof settings.pos === "object" ? settings.pos : {};
  const upiVpa = typeof pos.upiVpa === "string" ? pos.upiVpa.trim() : "";
  const upiPayee =
    (typeof pos.upiPayeeName === "string" && pos.upiPayeeName.trim()) ||
    shopName;

  const paidFromPayments = (data?.payments ?? []).reduce(
    (s, p) => (p.status === "failed" ? s : s + moneyNumber(p.amount)),
    0,
  );

  const depositTotal = moneyNumber(data?.totals.depositTotal);
  const subtotal = moneyNumber(data?.totals.subtotal);
  const taxTotal = moneyNumber(data?.totals.taxTotal);
  const discount = moneyNumber(data?.totals.discountTotal);
  const feeRows = data?.fees ?? [];
  const feesTotal =
    moneyNumber(data?.totals.feesTotal) ||
    feeRows.reduce((s, f) => s + moneyNumber(f.amount), 0);
  const itemsSub = Math.max(0, subtotal - feesTotal);

  const balanceDue = moneyNumber(data?.totals.balanceDue);
  const isPaid = balanceDue <= 0.009;

  const paidTotal =
    paidFromPayments > 0
      ? paidFromPayments
      : isPaid
        ? Math.max(0, subtotal + taxTotal - discount + depositTotal)
        : Math.max(
            0,
            subtotal + taxTotal - discount + depositTotal - balanceDue,
          );

  const originalAmount = moneyNumber(
    data?.paymentRounding?.originalAmount ?? data?.totals.balanceDue,
  );
  const finalAmount = moneyNumber(
    data?.paymentRounding?.finalAmount ?? data?.totals.balanceDue,
  );
  const roundOffAmount = moneyNumber(
    data?.paymentRounding?.roundOffAmount ?? 0,
  );

  const qrPayAmount = balanceDue > 0.005 ? balanceDue : originalAmount;
  const displayFees = feeRows.filter((f) => f.feeCode !== "round_off");

  const bill = buildBillSummary({
    itemsSubtotal: itemsSub,
    taxTotal,
    discount,
    fees: displayFees,
    taxInclusive: false,
    lines: data?.items ?? [],
    applyRoundOff: false,
    amountDue: finalAmount,
    roundOffOverride: roundOffAmount,
  });

  const when = data?.printedAt ? new Date(data.printedAt) : new Date();
  const whenLabel = formatShortDate(when);

  // Determine order category
  const isRental =
    data?.kind === "rental" ||
    Boolean(data?.rentalWindow?.pickupDate || data?.rentalWindow?.returnDueDate);
  const isService = data?.kind === "service";
  const isRestaurant =
    data?.kind === "restaurant" ||
    Boolean(data?.fulfillment?.orderType || data?.fulfillment?.resourceId);
  const isSubscription = data?.kind === "subscription";

  const invoiceTitle = useMemo(() => {
    if (isRental) return "RENTAL INVOICE";
    if (isService) return "SERVICE INVOICE";
    if (isRestaurant) return "RESTAURANT RECEIPT";
    if (isSubscription) return "SUBSCRIPTION INVOICE";
    return "TAX INVOICE";
  }, [isRental, isService, isRestaurant, isSubscription]);

  const durationStr = useMemo(() => {
    if (!isRental) return "";
    return computeDurationLabel(
      data?.rentalWindow?.pickupDate,
      data?.rentalWindow?.returnDueDate,
    );
  }, [isRental, data?.rentalWindow]);

  const rentalLifecycle = data?.rentalWindow?.lifecycle?.toLowerCase();
  const rentalStatusLabel = useMemo(() => {
    if (!isRental) return null;
    const returnDue = data?.rentalWindow?.returnDueDate
      ? new Date(data.rentalWindow.returnDueDate)
      : null;
    const isOverdue =
      returnDue &&
      returnDue.getTime() < Date.now() &&
      rentalLifecycle !== "returned";

    if (isOverdue) return "ACTIVE RENTAL";
    if (rentalLifecycle === "returned") return "RETURNED";
    if (rentalLifecycle === "checked_out") return "ACTIVE RENTAL";
    if (rentalLifecycle === "reserved" || rentalLifecycle === "booked")
      return "RESERVED";
    return "ACTIVE RENTAL";
  }, [isRental, rentalLifecycle, data?.rentalWindow]);

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

  const [sending, setSending] = useState(false);
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

  const divider = (
    <div
      className="my-2 w-full border-t border-dashed border-gray-400"
      aria-hidden="true"
    />
  );
  const solidDivider = (
    <div
      className="my-2 w-full border-t border-gray-800"
      aria-hidden="true"
    />
  );

  const changeAmt = change ?? data?.change;

  const content = (
    <div className="receipt-print-root fixed inset-0 z-[100] flex items-center justify-center bg-[#0b1f33]/50 p-3 sm:p-4 print:static print:block print:bg-white print:p-0">
      <button
        type="button"
        className="absolute inset-0 print:hidden"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="receipt-sheet relative z-10 flex max-h-[94vh] w-full max-w-[440px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:max-h-none print:w-full print:max-w-none print:overflow-visible print:rounded-none print:shadow-none">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between border-b border-[#e8ebf0] bg-[#f8fafc] px-4 py-3 print:hidden">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
              {invoiceTitle}
            </span>
            <div className="flex rounded-lg bg-gray-200/80 p-0.5 text-xs">
              <button
                type="button"
                className={`rounded-md px-2 py-1 font-medium transition ${
                  viewMode === "thermal"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
                onClick={() => setViewMode("thermal")}
              >
                Thermal (80mm)
              </button>
              <button
                type="button"
                className={`rounded-md px-2 py-1 font-medium transition ${
                  viewMode === "a4"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
                onClick={() => setViewMode("a4")}
              >
                Full A4
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {data?.customer ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 gap-1 text-xs"
                disabled={sending}
                onClick={() => void sendChannels(["email"])}
              >
                <Send className="h-3.5 w-3.5" />
                Email
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 bg-[#1a56db] text-xs hover:bg-[#1546b3]"
              onClick={() => window.print()}
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5a6b7d] hover:bg-[#e2e8f0]"
              aria-label="Close"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Printable Area */}
        <div className="scroll-soft flex-1 overflow-y-auto px-4 py-5 print:overflow-visible print:px-0 print:py-0">
          {loading ? (
            <p className="py-12 text-center text-sm text-[#5a6b7d]">
              Loading invoice…
            </p>
          ) : !data ? (
            <p className="py-12 text-center text-sm text-[#c81e1e]">
              Invoice details not found
            </p>
          ) : viewMode === "a4" ? (
            /* ──────────────────────────────────────────────────────────
               A4 / FULL PAGE INVOICE DESIGN
               ────────────────────────────────────────────────────────── */
            <div className="receipt-print a4-invoice mx-auto w-full bg-white font-sans text-xs leading-relaxed text-gray-900">
              {/* Header */}
              <div className="flex justify-between border-b-2 border-gray-900 pb-4">
                <div>
                  <h1 className="text-xl font-bold uppercase tracking-tight text-gray-900">
                    {shopName}
                  </h1>
                  {data.store.address ? (
                    <p className="mt-1 text-gray-600 whitespace-pre-wrap">
                      {data.store.address}
                    </p>
                  ) : null}
                  {taxId ? (
                    <p className="font-semibold text-gray-800">
                      GSTIN: {taxId}
                    </p>
                  ) : null}
                  {data.store.phone ? (
                    <p className="text-gray-600">Ph: {data.store.phone}</p>
                  ) : null}
                  {data.store.email ? (
                    <p className="text-gray-600">Email: {data.store.email}</p>
                  ) : null}
                </div>
                <div className="text-right">
                  <span className="inline-block rounded-lg bg-gray-900 px-3 py-1 font-mono text-sm font-bold text-white uppercase tracking-wider">
                    {invoiceTitle}
                  </span>
                  <p className="mt-2 text-xs font-semibold text-gray-700">
                    Invoice #:{" "}
                    <span className="font-mono text-gray-900">
                      {data.activeInvoiceNumber ||
                        data.invoices?.[data.invoices.length - 1]
                          ?.invoiceNumber ||
                        data.orderNumber}
                    </span>
                  </p>
                  <p className="text-xs text-gray-600">
                    Order #:{" "}
                    <span className="font-mono">{data.orderNumber}</span>
                  </p>
                  <p className="text-xs text-gray-600">Date: {whenLabel}</p>
                  {data.cashier ? (
                    <p className="text-xs text-gray-600">
                      Cashier: {data.cashier}
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Bill To & Meta Details */}
              <div className="grid grid-cols-2 gap-4 py-3 text-xs">
                <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-2.5">
                  <p className="font-bold text-gray-800 uppercase tracking-wide text-[10px]">
                    Billed To
                  </p>
                  <p className="mt-1 font-semibold text-gray-900">
                    {data.customer?.fullName || "Walk-in Customer"}
                  </p>
                  {data.customer?.phone ? (
                    <p className="text-gray-600">Ph: {data.customer.phone}</p>
                  ) : null}
                  {data.customer?.email ? (
                    <p className="text-gray-600">
                      Email: {data.customer.email}
                    </p>
                  ) : null}
                </div>
                {isRental ? (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-2.5">
                    <p className="font-bold text-blue-900 uppercase tracking-wide text-[10px]">
                      Rental Information
                    </p>
                    <div className="mt-1 grid grid-cols-2 gap-1 text-[11px]">
                      <div>
                        <span className="text-gray-500">Rental Start:</span>
                        <p className="font-semibold text-gray-900">
                          {formatShortDate(data.rentalWindow?.pickupDate)}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Return Due:</span>
                        <p className="font-semibold text-blue-800">
                          {formatShortDate(data.rentalWindow?.returnDueDate)}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Duration:</span>
                        <p className="font-semibold text-gray-900">
                          {durationStr}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Status:</span>
                        <p className="font-bold text-blue-700">
                          ● {rentalStatusLabel}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-2.5">
                    <p className="font-bold text-gray-800 uppercase tracking-wide text-[10px]">
                      Payment Summary
                    </p>
                    <p className="mt-1 text-xs">
                      Status:{" "}
                      <span
                        className={`font-bold ${
                          isPaid ? "text-green-700" : "text-amber-700"
                        }`}
                      >
                        {isPaid ? "PAID IN FULL" : "PAYMENT DUE"}
                      </span>
                    </p>
                    <p className="text-xs text-gray-600">
                      Paid: {currencySymbol}
                      {pad2(paidTotal)} · Due: {currencySymbol}
                      {pad2(balanceDue)}
                    </p>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <table className="w-full border-collapse text-left text-xs mt-2">
                <thead>
                  <tr className="border-y-2 border-gray-900 bg-gray-100 font-bold uppercase text-[10px] tracking-wider text-gray-800">
                    <th className="py-2 px-2">#</th>
                    <th className="py-2 px-2">Item Description</th>
                    <th className="py-2 px-2 text-center">Qty</th>
                    <th className="py-2 px-2 text-right">
                      {isRental ? "Rate / Unit" : "Rate"}
                    </th>
                    {isRental ? (
                      <th className="py-2 px-2 text-center">Duration</th>
                    ) : null}
                    <th className="py-2 px-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item, idx) => {
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
                    const rateDisplay = isRental
                      ? `${currencySymbol}${pad2(rate)}/day`
                      : `${currencySymbol}${pad2(rate)}`;
                    return (
                      <tr
                        key={idx}
                        className="border-b border-gray-200 hover:bg-gray-50/50"
                      >
                        <td className="py-2 px-2 text-gray-500 font-mono text-[11px]">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-2 font-medium text-gray-900">
                          <div>{label}</div>
                          {item.hsnOrSac || item.taxRatePercent ? (
                            <div className="text-[10px] text-gray-500">
                              {item.hsnOrSac ? `HSN: ${item.hsnOrSac}` : null}
                              {item.hsnOrSac && item.taxRatePercent
                                ? " | "
                                : null}
                              {item.taxRatePercent
                                ? `GST: ${item.taxRatePercent}%`
                                : null}
                            </div>
                          ) : null}
                        </td>
                        <td className="py-2 px-2 text-center font-mono">
                          {qty % 1 === 0 ? String(qty) : pad2(qty)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {rateDisplay}
                        </td>
                        {isRental ? (
                          <td className="py-2 px-2 text-center font-semibold text-gray-800">
                            {durationStr || "1 Day"}
                          </td>
                        ) : null}
                        <td className="py-2 px-2 text-right font-mono font-bold text-gray-900">
                          {currencySymbol}
                          {pad2(amt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Financial Breakdown */}
              <div className="mt-4 grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  {/* Payment Details */}
                  <div className="rounded-lg border border-gray-200 p-3 bg-gray-50/50">
                    <p className="font-bold uppercase tracking-wider text-[10px] text-gray-700">
                      Payment Breakdown
                    </p>
                    <div className="mt-2 space-y-1 text-xs">
                      {(data.payments ?? []).map((p, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="text-gray-600">
                            {moneyLabel(p.method)}
                            {p.status && p.status !== "succeeded"
                              ? ` (${p.status})`
                              : ""}
                          </span>
                          <span className="font-mono font-medium">
                            {currencySymbol}
                            {pad2(moneyNumber(p.amount))}
                          </span>
                        </div>
                      ))}
                      <div className="border-t border-gray-200 pt-1.5 flex justify-between font-bold">
                        <span>Total Paid:</span>
                        <span className="font-mono text-green-700">
                          {currencySymbol}
                          {pad2(paidTotal)}
                        </span>
                      </div>
                      {balanceDue > 0 ? (
                        <div className="flex justify-between font-bold text-red-600">
                          <span>Balance Due:</span>
                          <span className="font-mono">
                            {currencySymbol}
                            {pad2(balanceDue)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {upiVpa && balanceDue > 0 ? (
                    <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-2.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt="Pay QR"
                        className="h-16 w-16 bg-white"
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(
                          `upi://pay?pa=${encodeURIComponent(upiVpa)}&pn=${encodeURIComponent(upiPayee)}&am=${qrPayAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(data.orderNumber)}`,
                        )}`}
                      />
                      <div className="text-[11px]">
                        <p className="font-bold text-gray-900">
                          Scan &amp; Pay via UPI
                        </p>
                        <p className="text-gray-600">VPA: {upiVpa}</p>
                        <p className="text-gray-500">Payee: {upiPayee}</p>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Totals Table */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="font-mono font-medium">
                      {currencySymbol}
                      {pad2(subtotal)}
                    </span>
                  </div>
                  {discount > 0 ? (
                    <div className="flex justify-between py-1 border-b border-gray-100 text-green-700">
                      <span>Discount:</span>
                      <span className="font-mono">
                        -{currencySymbol}
                        {pad2(discount)}
                      </span>
                    </div>
                  ) : null}
                  {taxTotal > 0 ? (
                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span className="text-gray-600">Taxes (GST):</span>
                      <span className="font-mono">
                        {currencySymbol}
                        {pad2(taxTotal)}
                      </span>
                    </div>
                  ) : null}
                  {depositTotal > 0 ? (
                    <div className="flex justify-between py-1 border-b border-gray-100 text-blue-800">
                      <span>Security Deposit:</span>
                      <span className="font-mono font-medium">
                        {currencySymbol}
                        {pad2(depositTotal)}
                      </span>
                    </div>
                  ) : null}
                  {roundOffAmount !== 0 ? (
                    <div className="flex justify-between py-1 border-b border-gray-100 text-gray-500">
                      <span>Round Off:</span>
                      <span className="font-mono">
                        {roundOffAmount > 0 ? "+" : ""}
                        {currencySymbol}
                        {pad2(roundOffAmount)}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex justify-between border-t-2 border-b-2 border-gray-900 py-2 text-sm font-bold text-gray-900">
                    <span>NET PAYABLE:</span>
                    <span className="font-mono text-base">
                      {currencySymbol}
                      {pad2(finalAmount)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-8 border-t border-gray-200 pt-4 text-center text-[11px] text-gray-500">
                <ReceiptOrderBarcode value={data.orderNumber} />
                <p className="mt-2 font-semibold text-gray-800">
                  {receiptFooter}
                </p>
                <p className="mt-0.5">GST included as applicable.</p>
              </div>
            </div>
          ) : (
            /* ──────────────────────────────────────────────────────────
               THERMAL RECEIPT (80mm / 58mm) DESIGN
               ────────────────────────────────────────────────────────── */
            <div className="receipt-print mx-auto w-full max-w-[320px] bg-white font-mono text-[12px] leading-[1.35] text-black">
              {/* Header */}
              <header className="text-center">
                <p className="text-[14px] font-bold tracking-wider uppercase text-black">
                  {shopName}
                </p>
                {data.store.address ? (
                  <p className="mt-0.5 text-[11px] whitespace-pre-wrap">
                    {data.store.address}
                  </p>
                ) : null}
                {taxId ? (
                  <p className="text-[11px] font-bold">GSTIN: {taxId}</p>
                ) : null}
                {data.store.phone ? (
                  <p className="text-[11px]">Ph: {data.store.phone}</p>
                ) : null}
              </header>

              {solidDivider}

              {/* Title Header */}
              <div className="text-center">
                <p className="text-[13px] font-bold tracking-wide uppercase">
                  {invoiceTitle}
                </p>
              </div>

              {divider}

              {/* Meta Info */}
              <section className="space-y-0.5 text-[11px]">
                <div className="flex justify-between">
                  <span>
                    Inv:{" "}
                    {data.activeInvoiceNumber ||
                      data.invoices?.[data.invoices.length - 1]
                        ?.invoiceNumber ||
                      data.orderNumber}
                  </span>
                  <span>{formatOnlyDate(when)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Order: {data.orderNumber}</span>
                  <span>{when.toTimeString().slice(0, 5)}</span>
                </div>
                {data.cashier ? <p>Cashier: {data.cashier}</p> : null}
                <div className="flex justify-between">
                  <span>
                    Customer: {data.customer?.fullName || "Walk-in"}
                  </span>
                  {data.customer?.phone ? (
                    <span>{data.customer.phone}</span>
                  ) : null}
                </div>
              </section>

              {/* RENTAL DETAILS HEADER BLOCK (When Rental) */}
              {isRental ? (
                <>
                  {solidDivider}
                  <div className="text-center font-bold text-[11px] tracking-wider uppercase">
                    RENTAL DETAILS
                  </div>
                  {divider}
                </>
              ) : (
                solidDivider
              )}

              {/* Items Column Header */}
              {isRental ? (
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-1.5 font-bold text-[11px] pb-1">
                  <span>Item</span>
                  <span className="w-6 text-center">Qty</span>
                  <span className="w-12 text-right">Rate</span>
                  <span className="w-12 text-center">Dur</span>
                  <span className="w-12 text-right">Amt</span>
                </div>
              ) : (
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-1.5 font-bold text-[11px] pb-1">
                  <span>Item</span>
                  <span className="w-7 text-center">Qty</span>
                  <span className="w-12 text-right">Rate</span>
                  <span className="w-14 text-right">Amt</span>
                </div>
              )}

              {divider}

              {/* Item Rows */}
              <div className="space-y-2">
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
                  if (taxAmt > 0 && amt > 0) {
                    const derived = Math.round((taxAmt / amt) * 1000) / 10;
                    if (!gst || gst > 28) gst = derived;
                  }
                  const rawHsn = (item.hsnOrSac || item.taxCode || "").trim();
                  const hsn =
                    rawHsn && !/^(?:GST|VAT|TAX)\s*\d/i.test(rawHsn)
                      ? rawHsn
                      : "";

                  const rateText = isRental
                    ? `${currencySymbol}${pad2(rate)}/d`
                    : `${currencySymbol}${pad2(rate)}`;

                  return (
                    <div key={i} className="text-[11px]">
                      {isRental ? (
                        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-1.5 items-start">
                          <span className="min-w-0 break-words font-medium pr-1">
                            {label}
                          </span>
                          <span className="w-6 text-center tabular-nums">
                            {qty % 1 === 0 ? String(qty) : pad2(qty)}
                          </span>
                          <span className="w-12 text-right tabular-nums">
                            {rateText}
                          </span>
                          <span className="w-12 text-center font-semibold">
                            {durationStr || "1 Day"}
                          </span>
                          <span className="w-12 text-right tabular-nums font-bold">
                            {currencySymbol}
                            {pad2(amt)}
                          </span>
                        </div>
                      ) : (
                        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-1.5 items-start">
                          <span className="min-w-0 break-words font-medium pr-1">
                            {label}
                          </span>
                          <span className="w-7 text-center tabular-nums">
                            {qty % 1 === 0 ? String(qty) : pad2(qty)}
                          </span>
                          <span className="w-12 text-right tabular-nums">
                            {currencySymbol}
                            {pad2(rate)}
                          </span>
                          <span className="w-14 text-right tabular-nums font-bold">
                            {currencySymbol}
                            {pad2(amt)}
                          </span>
                        </div>
                      )}
                      {hsn || gst ? (
                        <p className="text-[10px] text-gray-700 pl-0.5">
                          {hsn ? `HSN: ${hsn}` : null}
                          {hsn && gst ? " | " : null}
                          {gst ? `GST: ${gst}%` : null}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {/* RENTAL WINDOW TIMESTAMPS (Under Items) */}
              {isRental ? (
                <>
                  <div className="mt-2.5 rounded border border-gray-400 p-1.5 text-[10px] space-y-0.5 bg-gray-50/70">
                    <div className="flex justify-between">
                      <span className="text-gray-700">Rental Start:</span>
                      <span className="font-bold">
                        {formatShortDate(data.rentalWindow?.pickupDate)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-700">Return Due:</span>
                      <span className="font-bold text-black">
                        {formatShortDate(data.rentalWindow?.returnDueDate)}
                      </span>
                    </div>
                    {depositTotal > 0 ? (
                      <div className="flex justify-between border-t border-dashed border-gray-300 pt-0.5">
                        <span className="text-gray-700">Deposit Held:</span>
                        <span className="font-bold">
                          {currencySymbol}
                          {pad2(depositTotal)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}

              {divider}

              {/* Financial Totals */}
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="tabular-nums">
                    {currencySymbol}
                    {pad2(subtotal)}
                  </span>
                </div>
                {discount > 0 ? (
                  <div className="flex justify-between">
                    <span>Discount</span>
                    <span className="tabular-nums">
                      -{currencySymbol}
                      {pad2(discount)}
                    </span>
                  </div>
                ) : null}
                {taxTotal > 0 ? (
                  <div className="flex justify-between">
                    <span>Tax (GST)</span>
                    <span className="tabular-nums">
                      {currencySymbol}
                      {pad2(taxTotal)}
                    </span>
                  </div>
                ) : null}
                {depositTotal > 0 ? (
                  <div className="flex justify-between">
                    <span>Security Deposit</span>
                    <span className="tabular-nums">
                      {currencySymbol}
                      {pad2(depositTotal)}
                    </span>
                  </div>
                ) : null}
                {roundOffAmount !== 0 ? (
                  <div className="flex justify-between">
                    <span>Round Off</span>
                    <span className="tabular-nums">
                      {roundOffAmount > 0 ? "+" : ""}
                      {currencySymbol}
                      {pad2(roundOffAmount)}
                    </span>
                  </div>
                ) : null}
              </div>

              {solidDivider}

              {/* NET PAYABLE */}
              <div className="flex justify-between text-[13px] font-bold">
                <span>NET PAYABLE</span>
                <span className="tabular-nums text-[14px]">
                  {currencySymbol}
                  {pad2(finalAmount)}
                </span>
              </div>

              {solidDivider}

              {/* PAYMENT SECTION */}
              <div className="space-y-1 text-[11px]">
                <div className="font-bold uppercase tracking-wider text-[10px]">
                  PAYMENT
                </div>
                {(data.payments ?? []).map((p, i) => (
                  <div key={i} className="flex justify-between">
                    <span>
                      {moneyLabel(p.method)}
                      {p.status && p.status !== "succeeded"
                        ? ` (${p.status})`
                        : ""}
                    </span>
                    <span className="tabular-nums">
                      {currencySymbol}
                      {pad2(moneyNumber(p.amount))}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between font-bold pt-0.5">
                  <span>Amount Paid</span>
                  <span className="tabular-nums">
                    {currencySymbol}
                    {pad2(paidTotal)}
                  </span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Balance Due</span>
                  <span className="tabular-nums">
                    {currencySymbol}
                    {pad2(balanceDue)}
                  </span>
                </div>
                <div className="flex justify-between pt-0.5">
                  <span>Payment Status:</span>
                  <span
                    className={`font-bold uppercase ${
                      isPaid ? "text-green-800" : "text-red-700"
                    }`}
                  >
                    {isPaid
                      ? "PAID"
                      : paidTotal > 0
                        ? "PARTIALLY PAID"
                        : "UNPAID"}
                  </span>
                </div>
                {changeAmt != null && moneyNumber(changeAmt) > 0 ? (
                  <div className="flex justify-between text-blue-900 font-semibold">
                    <span>Change Returned</span>
                    <span className="tabular-nums">
                      {currencySymbol}
                      {pad2(moneyNumber(changeAmt))}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* RENTAL STATUS HIGHLIGHT BLOCK */}
              {isRental ? (
                <>
                  {solidDivider}
                  <div className="rounded border border-gray-800 bg-gray-50 py-2 px-2 text-center">
                    <p className="text-[10px] font-bold tracking-wider text-gray-700 uppercase">
                      RENTAL STATUS
                    </p>
                    <p className="mt-1 text-[12px] font-extrabold text-blue-900">
                      ● {rentalStatusLabel}
                    </p>
                    <p className="mt-0.5 text-[10px] text-gray-800">
                      Return Due:{" "}
                      {formatOnlyDate(data.rentalWindow?.returnDueDate)}
                    </p>
                  </div>
                </>
              ) : null}

              {/* UPI QR SCAN & PAY */}
              {upiVpa && balanceDue > 0 ? (
                <>
                  {divider}
                  <div className="mt-2 text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt="Pay QR"
                      className="mx-auto h-24 w-24 bg-white border border-gray-300 p-0.5"
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(
                        `upi://pay?pa=${encodeURIComponent(upiVpa)}&pn=${encodeURIComponent(upiPayee)}&am=${qrPayAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(data.orderNumber)}`,
                      )}`}
                    />
                    <p className="mt-1 font-bold text-[11px]">Scan &amp; Pay</p>
                    <p className="text-[10px]">UPI: {upiVpa}</p>
                    <p className="text-[10px]">Name: {upiPayee}</p>
                  </div>
                </>
              ) : null}

              {solidDivider}

              {/* Barcode & Footer */}
              <div className="text-center">
                <ReceiptOrderBarcode value={data.orderNumber} />
                <p className="mt-2 font-bold text-[11px]">{receiptFooter}</p>
                <p className="mt-0.5 text-[10px] text-gray-600">
                  GST included as applicable.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
