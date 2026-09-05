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
import {
  mapToUniversalInvoice,
  type UniversalInvoiceDocument,
  type UniversalInvoiceLineItem,
} from "@/lib/universal-invoice";

function ReceiptOrderBarcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const trimmed = value.trim();
  useEffect(() => {
    if (!ref.current || !trimmed) return;
    try {
      JsBarcode(ref.current, trimmed, {
        format: "CODE128",
        displayValue: false,
        height: 32,
        width: 1.3,
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
    itemType?: string;
    itemKind?: string | null;
    name?: string | null;
    description?: string | null;
    quantity?: string | number;
    orderedQuantity?: string | number | null;
    orderedUnitSymbol?: string | null;
    baseQuantity?: string | number | null;
    baseUnitSymbol?: string | null;
    unitPrice: string | number;
    lineTotal?: string | number;
    taxAmount?: string | number;
    taxRatePercent?: string | number | null;
    taxCode?: string | null;
    hsnOrSac?: string | null;
    durationDays?: number | null;
    durationHours?: number | null;
    durationLabel?: string | null;
    sessionsCount?: number | null;
    ratePeriod?: string | null;
    inventoryUnit?: { barcodeSku: string; size?: string | null } | null;
    retailSku?: { sku: string } | null;
    product?: { name?: string; skuCode?: string } | null;
    mrp?: string | number | null;
    grossMrp?: string | number | null;
    productDiscount?: string | number | null;
    meta?: Record<string, unknown> | null;
  }>;
  totals: {
    subtotal: string | number;
    taxTotal: string | number;
    discountTotal?: string | number;
    depositTotal?: string | number;
    balanceDue?: string | number;
    feesTotal?: string | number;
    grossMrp?: string | number | null;
    productDiscount?: string | number | null;
    grandTotal?: string | number | null;
  };
  payments?: Array<{
    id?: string;
    method: string;
    amount: string | number;
    status?: string;
    gatewayRef?: string | null;
    paidAt?: string | Date | null;
    createdAt?: string | Date | null;
  }>;
  invoices?: Array<{
    id: string;
    invoiceNumber: string;
    createdAt?: string | Date | null;
    taxBreakdown?: any;
  }>;
  activeInvoiceNumber?: string | null;
  activeInvoiceLabel?: string | null;
  paymentRounding?: {
    originalAmount?: string | number | null;
    roundOffAmount?: string | number | null;
    finalAmount?: string | number | null;
  };
  change?: string | number | null;
  fulfillment?: {
    resourceId?: string | null;
    orderType?: string | null;
  } | null;
  rentalWindow?: {
    pickupDate?: string | Date | null;
    returnDueDate?: string | Date | null;
    lifecycle?: string | null;
  } | null;
  fees?: Array<{
    feeCode: string;
    amount: string | number;
  }>;
};

function formatMoney(amount: number, symbol = "₹"): string {
  return `${symbol}${amount.toFixed(2)}`;
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const [sending, setSending] = useState(false);

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

  const pos =
    settings?.pos && typeof settings.pos === "object" ? settings.pos : {};
  const upiVpa = typeof pos.upiVpa === "string" ? pos.upiVpa.trim() : "";
  const upiPayee =
    (typeof pos.upiPayeeName === "string" && pos.upiPayeeName.trim()) ||
    shopName;

  // Map to Canonical Universal Invoice Document
  const doc: UniversalInvoiceDocument | null = useMemo(() => {
    if (!data) return null;
    return mapToUniversalInvoice({
      order: {
        id: data.orderId,
        orderNumber: data.orderNumber,
        kind: data.kind,
        createdAt: data.printedAt,
        subtotal: data.totals?.subtotal,
        taxTotal: data.totals?.taxTotal,
        discountTotal: data.totals?.discountTotal,
        depositTotal: data.totals?.depositTotal,
        roundOff: data.paymentRounding?.roundOffAmount,
        total: data.paymentRounding?.finalAmount ?? data.totals?.grandTotal,
        change: change ?? data.change,
        activeInvoiceNumber: data.activeInvoiceNumber,
        invoices: data.invoices,
        fulfillment: data.fulfillment,
        rentalWindow: data.rentalWindow,
        cashierName: data.cashier,
      },
      shop: {
        name: shopName,
        address: data.store?.address,
        phone: data.store?.phone,
        email: data.store?.email,
        taxId: data.store?.taxId,
        upiVpa,
        upiPayee,
      },
      customer: data.customer,
      items: data.items,
      payments: data.payments,
      config: {
        currencySymbol,
        currencyCode,
        footerNote: receiptFooter,
      },
    });
  }, [
    data,
    shopName,
    upiVpa,
    upiPayee,
    currencySymbol,
    currencyCode,
    receiptFooter,
    change,
  ]);

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

  async function sendChannels(channels: Array<"email" | "sms">) {
    if (!doc?.customer?.id) {
      toast.error("Add a customer on the bill to send it");
      return;
    }
    if (channels.includes("email") && !doc.customer.email) {
      toast.error("This customer has no email");
      return;
    }
    if (channels.includes("sms") && !doc.customer.phone) {
      toast.error("This customer has no phone");
      return;
    }
    setSending(true);
    try {
      if (data?.orderId) {
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
            customerId: doc.customer.id,
            phone: doc.customer.phone ?? undefined,
            email: doc.customer.email ?? undefined,
            payload: {
              orderNumber: doc.header.orderNumber,
              total: String(doc.totals.netPayable),
              balanceDue: String(doc.payment.balanceDue),
              storeName: doc.header.businessName,
              customerName: doc.customer.name,
              subtotal: String(doc.totals.subtotalNet),
              taxTotal: String(doc.totals.taxTotal),
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

  if (!data && !loading) return null;

  const content = (
    <div className="receipt-print-root fixed inset-0 z-[100] flex items-center justify-center bg-[#0b1f33]/50 p-3 sm:p-4 print:static print:block print:bg-white print:p-0">
      <button
        type="button"
        className="absolute inset-0 print:hidden"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="receipt-sheet relative z-10 flex max-h-[94vh] w-full max-w-[460px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:max-h-none print:w-full print:max-w-none print:overflow-visible print:rounded-none print:shadow-none">
        {/* Top Bar */}
        <div className="flex items-center justify-between border-b border-[#e8ebf0] bg-[#f8fafc] px-4 py-3 print:hidden">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
              {doc?.config.documentTitle || "TAX INVOICE"}
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
            {doc?.customer?.id ? (
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

        {/* Scrollable Printable Document Area */}
        <div className="scroll-soft flex-1 overflow-y-auto px-4 py-5 print:overflow-visible print:px-0 print:py-0">
          {loading ? (
            <p className="py-12 text-center text-sm text-[#5a6b7d]">
              Loading invoice…
            </p>
          ) : !doc ? (
            <p className="py-12 text-center text-sm text-[#c81e1e]">
              Invoice details not found
            </p>
          ) : viewMode === "a4" ? (
            /* ──────────────────────────────────────────────────────────
               UNIVERSAL FULL A4 INVOICE DESIGN
               ────────────────────────────────────────────────────────── */
            <div className="receipt-print a4-invoice mx-auto w-full bg-white font-sans text-xs leading-relaxed text-gray-900">
              {/* Header */}
              <div className="flex justify-between border-b-2 border-gray-900 pb-4">
                <div>
                  <h1 className="text-xl font-bold uppercase tracking-tight text-gray-900">
                    {doc.header.businessName}
                  </h1>
                  {doc.header.tagline ? (
                    <p className="text-[11px] text-gray-500">{doc.header.tagline}</p>
                  ) : null}
                  {doc.header.address ? (
                    <p className="mt-1 text-gray-600 whitespace-pre-wrap">
                      {doc.header.address}
                    </p>
                  ) : null}
                  {doc.header.taxRegistration ? (
                    <p className="font-semibold text-gray-800">
                      {doc.header.taxRegistration.label}: {doc.header.taxRegistration.value}
                    </p>
                  ) : null}
                  {doc.header.phone ? (
                    <p className="text-gray-600">Ph: {doc.header.phone}</p>
                  ) : null}
                  {doc.header.email ? (
                    <p className="text-gray-600">Email: {doc.header.email}</p>
                  ) : null}
                </div>
                <div className="text-right">
                  <span className="inline-block rounded-lg bg-gray-900 px-3 py-1 font-mono text-sm font-bold text-white uppercase tracking-wider">
                    {doc.config.documentTitle || "INVOICE"}
                  </span>
                  <p className="mt-2 text-xs font-semibold text-gray-700">
                    Invoice #:{" "}
                    <span className="font-mono text-gray-900">
                      {doc.header.invoiceNumber}
                    </span>
                  </p>
                  <p className="text-xs text-gray-600">
                    Order #:{" "}
                    <span className="font-mono">{doc.header.orderNumber}</span>
                  </p>
                  <p className="text-xs text-gray-600">
                    Date: {formatDateTime(doc.header.issueDate)}
                  </p>
                  {doc.header.cashierName ? (
                    <p className="text-xs text-gray-600">
                      Staff: {doc.header.cashierName}
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Bill To & Commerce Summary Blocks */}
              <div className="grid grid-cols-2 gap-4 py-3 text-xs">
                <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-2.5">
                  <p className="font-bold text-gray-800 uppercase tracking-wide text-[10px]">
                    Billed To
                  </p>
                  <p className="mt-1 font-semibold text-gray-900">
                    {doc.customer?.name || "Walk-in Customer"}
                  </p>
                  {doc.customer?.phone ? (
                    <p className="text-gray-600">Ph: {doc.customer.phone}</p>
                  ) : null}
                  {doc.customer?.email ? (
                    <p className="text-gray-600">Email: {doc.customer.email}</p>
                  ) : null}
                  {doc.customer?.taxRegistrationNumber ? (
                    <p className="text-gray-700 font-medium">
                      Tax ID: {doc.customer.taxRegistrationNumber}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-2.5">
                  <p className="font-bold text-gray-800 uppercase tracking-wide text-[10px]">
                    Status &amp; Commerce Info
                  </p>
                  <p className="mt-1 text-xs font-bold">
                    Status:{" "}
                    <span
                      className={
                        doc.payment.status === "PAID"
                          ? "text-green-700"
                          : doc.payment.status === "REFUNDED"
                            ? "text-purple-700"
                            : "text-amber-700"
                      }
                    >
                      {doc.payment.status}
                    </span>
                  </p>
                  {doc.commerceMetadata?.rentalStartDate ? (
                    <p className="text-gray-700">
                      Rental: {formatDate(doc.commerceMetadata.rentalStartDate)} →{" "}
                      {formatDate(doc.commerceMetadata.rentalEndDate)}
                    </p>
                  ) : null}
                  {doc.commerceMetadata?.tableNumber ? (
                    <p className="text-gray-700">
                      Table: {doc.commerceMetadata.tableNumber}{" "}
                      {doc.commerceMetadata.orderType ? `(${doc.commerceMetadata.orderType})` : ""}
                    </p>
                  ) : null}
                  {doc.commerceMetadata?.returnReason ? (
                    <p className="text-red-700">
                      Return Reason: {doc.commerceMetadata.returnReason}
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full border-collapse text-left text-xs mt-2">
                <thead>
                  <tr className="border-y-2 border-gray-900 bg-gray-100 font-bold uppercase text-[10px] tracking-wider text-gray-800">
                    <th className="py-2 px-2">#</th>
                    <th className="py-2 px-2">Description</th>
                    <th className="py-2 px-2 text-center">Tax Code</th>
                    <th className="py-2 px-2 text-center">Qty / UOM</th>
                    <th className="py-2 px-2 text-right">Rate</th>
                    <th className="py-2 px-2 text-right">Tax</th>
                    <th className="py-2 px-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.items.map((item, idx) => {
                    const qtyStr = item.unitSymbol
                      ? `${item.quantity} ${item.unitSymbol}`
                      : item.quantity % 1 === 0
                        ? String(item.quantity)
                        : item.quantity.toFixed(2);

                    return (
                      <tr
                        key={idx}
                        className="border-b border-gray-200 hover:bg-gray-50/50"
                      >
                        <td className="py-2 px-2 text-gray-500 font-mono text-[11px]">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-2 font-medium text-gray-900">
                          <div>{item.name}</div>
                          {item.commerceMetadata?.durationLabel ? (
                            <div className="text-[10px] text-blue-700">
                              Duration: {item.commerceMetadata.durationLabel}
                            </div>
                          ) : item.commerceMetadata?.sessionsCount ? (
                            <div className="text-[10px] text-blue-700">
                              Sessions: {item.commerceMetadata.sessionsCount}
                            </div>
                          ) : null}
                          {item.commerceMetadata?.validityStartDate ? (
                            <div className="text-[10px] text-emerald-700">
                              Validity: {formatDate(item.commerceMetadata.validityStartDate)} →{" "}
                              {formatDate(item.commerceMetadata.validityEndDate)}
                            </div>
                          ) : null}
                          {item.equivalentBaseQuantity != null && item.equivalentBaseUnitSymbol ? (
                            <div className="text-[10px] text-gray-500">
                              Equivalent: {item.equivalentBaseQuantity}{" "}
                              {item.equivalentBaseUnitSymbol}
                            </div>
                          ) : null}
                        </td>
                        <td className="py-2 px-2 text-center font-mono text-gray-600">
                          {item.taxClassification?.code || "—"}
                        </td>
                        <td className="py-2 px-2 text-center font-mono font-semibold">
                          {qtyStr}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {formatMoney(item.unitPrice, currencySymbol)}
                          {item.pricingUnitSymbol && item.pricingUnitSymbol !== item.unitSymbol ? `/${item.pricingUnitSymbol}` : ""}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-gray-600">
                          {formatMoney(item.taxAmount ?? 0, currencySymbol)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-gray-900">
                          {formatMoney(item.lineTotal, currencySymbol)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Totals & Payments Grid */}
              <div className="mt-4 grid grid-cols-2 gap-6">
                {/* Payments */}
                <div className="space-y-3">
                  <div className="rounded-lg border border-gray-200 p-3 bg-gray-50/50">
                    <p className="font-bold uppercase tracking-wider text-[10px] text-gray-700">
                      Payment Breakdown
                    </p>
                    <div className="mt-2 space-y-1 text-xs">
                      {doc.payment.payments.map((p, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="text-gray-600">
                            {p.label || p.method}
                            {p.status && p.status !== "succeeded" ? ` (${p.status})` : ""}
                          </span>
                          <span className="font-mono font-medium">
                            {formatMoney(p.amount, currencySymbol)}
                          </span>
                        </div>
                      ))}
                      <div className="border-t border-gray-200 pt-1.5 flex justify-between font-bold">
                        <span>Total Paid:</span>
                        <span className="font-mono text-green-700">
                          {formatMoney(doc.payment.totalPaid, currencySymbol)}
                        </span>
                      </div>
                      {doc.payment.balanceDue > 0 ? (
                        <div className="flex justify-between font-bold text-red-600">
                          <span>Balance Due:</span>
                          <span className="font-mono">
                            {formatMoney(doc.payment.balanceDue, currencySymbol)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {upiVpa && doc.payment.balanceDue > 0 ? (
                    <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-2.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt="Pay QR"
                        className="h-16 w-16 bg-white"
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(
                          `upi://pay?pa=${encodeURIComponent(upiVpa)}&pn=${encodeURIComponent(upiPayee)}&am=${doc.payment.balanceDue.toFixed(2)}&cu=INR&tn=${encodeURIComponent(doc.header.orderNumber)}`,
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

                {/* Financial Totals */}
                <div className="space-y-1.5 text-xs">
                  {doc.totals.grossMrpTotal ? (
                    <div className="flex justify-between py-1 border-b border-gray-100 text-gray-500">
                      <span>Total MRP:</span>
                      <span className="font-mono">{formatMoney(doc.totals.grossMrpTotal, currencySymbol)}</span>
                    </div>
                  ) : null}
                  {doc.totals.productDiscountTotal ? (
                    <div className="flex justify-between py-1 border-b border-gray-100 text-emerald-700 font-medium">
                      <span>Product Discount:</span>
                      <span className="font-mono">-{formatMoney(doc.totals.productDiscountTotal, currencySymbol)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between py-1 border-b border-gray-100 font-semibold text-gray-900">
                    <span>Subtotal (Net):</span>
                    <span className="font-mono">{formatMoney(doc.totals.subtotalNet, currencySymbol)}</span>
                  </div>
                  {doc.totals.billDiscountTotal ? (
                    <div className="flex justify-between py-1 border-b border-gray-100 text-[#c2410c] font-medium">
                      <span>Bill Discount:</span>
                      <span className="font-mono">-{formatMoney(doc.totals.billDiscountTotal, currencySymbol)}</span>
                    </div>
                  ) : null}
                  {doc.totals.taxTotal > 0 ? (
                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span className="text-gray-600">Tax Total:</span>
                      <span className="font-mono">{formatMoney(doc.totals.taxTotal, currencySymbol)}</span>
                    </div>
                  ) : null}
                  {doc.totals.securityDepositTotal ? (
                    <div className="flex justify-between py-1 border-b border-gray-100 text-blue-800">
                      <span>Security Deposit:</span>
                      <span className="font-mono">{formatMoney(doc.totals.securityDepositTotal, currencySymbol)}</span>
                    </div>
                  ) : null}
                  {doc.totals.roundOff ? (
                    <div className="flex justify-between py-1 border-b border-gray-100 text-gray-500">
                      <span>Round Off:</span>
                      <span className="font-mono">
                        {doc.totals.roundOff > 0 ? "+" : ""}
                        {formatMoney(doc.totals.roundOff, currencySymbol)}
                      </span>
                    </div>
                  ) : null}

                  <div className="flex justify-between border-t-2 border-b-2 border-gray-900 py-2 text-sm font-bold text-gray-900">
                    <span>NET PAYABLE:</span>
                    <span className="font-mono text-base">{formatMoney(doc.totals.netPayable, currencySymbol)}</span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-8 border-t border-gray-200 pt-4 text-center text-[11px] text-gray-500">
                <ReceiptOrderBarcode value={doc.header.orderNumber} />
                <p className="mt-2 font-semibold text-gray-800">
                  {doc.config.footerNote}
                </p>
                <p className="mt-0.5">This is a computer-generated invoice.</p>
              </div>
            </div>
          ) : (
            /* ──────────────────────────────────────────────────────────
               UNIVERSAL THERMAL (80mm / 58mm) DESIGN
               ────────────────────────────────────────────────────────── */
            <div className="receipt-print mx-auto w-full max-w-[320px] bg-white font-mono text-[12px] leading-[1.35] text-black">
              {/* Header */}
              <header className="text-center">
                <p className="text-[14px] font-bold tracking-wider uppercase text-black">
                  {doc.header.businessName}
                </p>
                {doc.header.address ? (
                  <p className="mt-0.5 text-[11px] whitespace-pre-wrap">
                    {doc.header.address}
                  </p>
                ) : null}
                {doc.header.taxRegistration ? (
                  <p className="text-[11px] font-bold">
                    {doc.header.taxRegistration.label}: {doc.header.taxRegistration.value}
                  </p>
                ) : null}
                {doc.header.phone ? (
                  <p className="text-[11px]">Ph: {doc.header.phone}</p>
                ) : null}
              </header>

              {solidDivider}

              {/* Title */}
              <div className="text-center">
                <p className="text-[13px] font-bold tracking-wide uppercase">
                  {doc.config.documentTitle || "TAX INVOICE"}
                </p>
              </div>

              {divider}

              {/* Meta */}
              <section className="space-y-0.5 text-[11px]">
                <div className="flex justify-between">
                  <span>Inv #: {doc.header.invoiceNumber}</span>
                  <span>{formatDate(doc.header.issueDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Order: {doc.header.orderNumber}</span>
                  <span>{new Date(doc.header.issueDate).toTimeString().slice(0, 5)}</span>
                </div>
                {doc.header.cashierName ? <p>Staff: {doc.header.cashierName}</p> : null}
                <div className="flex justify-between">
                  <span>Customer: {doc.customer?.name || "Walk-in"}</span>
                  {doc.customer?.phone ? <span>{doc.customer.phone}</span> : null}
                </div>
              </section>

              {/* Commerce Specific Header Block */}
              {doc.commerceMetadata?.rentalStartDate ? (
                <>
                  {solidDivider}
                  <div className="text-center font-bold text-[11px] tracking-wider uppercase">
                    RENTAL DETAILS
                  </div>
                  <div className="text-[10px] space-y-0.5 mt-1">
                    <div className="flex justify-between">
                      <span>Start:</span>
                      <span>{formatDate(doc.commerceMetadata.rentalStartDate)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Due:</span>
                      <span className="font-bold">{formatDate(doc.commerceMetadata.rentalEndDate)}</span>
                    </div>
                  </div>
                  {divider}
                </>
              ) : doc.commerceMetadata?.tableNumber ? (
                <>
                  {solidDivider}
                  <div className="text-center font-bold text-[11px]">
                    TABLE: {doc.commerceMetadata.tableNumber}{" "}
                    {doc.commerceMetadata.orderType ? `(${doc.commerceMetadata.orderType.toUpperCase()})` : ""}
                  </div>
                  {divider}
                </>
              ) : (
                solidDivider
              )}

              {/* Column Headers */}
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-1.5 font-bold text-[11px] pb-1">
                <span>Item</span>
                <span className="w-8 text-center">Qty</span>
                <span className="w-12 text-right">Rate</span>
                <span className="w-14 text-right">Amt</span>
              </div>

              {divider}

              {/* Items List */}
              <div className="space-y-2">
                {doc.items.map((item, i) => {
                  const qtyStr = item.unitSymbol
                    ? `${item.quantity} ${item.unitSymbol}`
                    : item.quantity % 1 === 0
                      ? String(item.quantity)
                      : item.quantity.toFixed(2);

                  return (
                    <div key={i} className="text-[11px]">
                      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-1.5 items-start">
                        <span className="min-w-0 break-words font-medium pr-1">
                          {item.name}
                        </span>
                        <span className="w-8 text-center tabular-nums">
                          {qtyStr}
                        </span>
                        <span className="w-12 text-right tabular-nums">
                          {formatMoney(item.unitPrice, currencySymbol)}
                        </span>
                        <span className="w-14 text-right tabular-nums font-bold">
                          {formatMoney(item.lineTotal, currencySymbol)}
                        </span>
                      </div>
                      {item.commerceMetadata?.durationLabel ? (
                        <p className="text-[10px] text-gray-700 pl-0.5">
                          Duration: {item.commerceMetadata.durationLabel}
                        </p>
                      ) : item.commerceMetadata?.sessionsCount ? (
                        <p className="text-[10px] text-gray-700 pl-0.5">
                          Sessions: {item.commerceMetadata.sessionsCount}
                        </p>
                      ) : null}
                      {item.equivalentBaseQuantity != null && item.equivalentBaseUnitSymbol ? (
                        <p className="text-[10px] text-gray-600 pl-0.5">
                          Eq: {item.equivalentBaseQuantity} {item.equivalentBaseUnitSymbol}
                        </p>
                      ) : null}
                      {item.taxClassification?.code ? (
                        <p className="text-[10px] text-gray-600 pl-0.5">
                          {item.taxClassification.label || "Code"}: {item.taxClassification.code}
                          {item.taxRatePercent ? ` (${item.taxRatePercent}%)` : ""}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {divider}

              {/* Totals */}
              <div className="space-y-1 text-[11px]">
                {doc.totals.grossMrpTotal ? (
                  <div className="flex justify-between text-gray-500">
                    <span>Total MRP</span>
                    <span className="tabular-nums">{formatMoney(doc.totals.grossMrpTotal, currencySymbol)}</span>
                  </div>
                ) : null}
                {doc.totals.productDiscountTotal ? (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>Product Discount</span>
                    <span className="tabular-nums">-{formatMoney(doc.totals.productDiscountTotal, currencySymbol)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between font-semibold">
                  <span>Subtotal (Net)</span>
                  <span className="tabular-nums">{formatMoney(doc.totals.subtotalNet, currencySymbol)}</span>
                </div>
                {doc.totals.billDiscountTotal ? (
                  <div className="flex justify-between text-[#c2410c] font-medium">
                    <span>Bill Discount</span>
                    <span className="tabular-nums">-{formatMoney(doc.totals.billDiscountTotal, currencySymbol)}</span>
                  </div>
                ) : null}
                {doc.totals.taxTotal > 0 ? (
                  <div className="flex justify-between">
                    <span>Tax Total</span>
                    <span className="tabular-nums">{formatMoney(doc.totals.taxTotal, currencySymbol)}</span>
                  </div>
                ) : null}
                {doc.totals.securityDepositTotal ? (
                  <div className="flex justify-between text-blue-900 font-semibold">
                    <span>Security Deposit</span>
                    <span className="tabular-nums">{formatMoney(doc.totals.securityDepositTotal, currencySymbol)}</span>
                  </div>
                ) : null}
                {doc.totals.roundOff ? (
                  <div className="flex justify-between text-gray-500">
                    <span>Round Off</span>
                    <span className="tabular-nums">
                      {doc.totals.roundOff > 0 ? "+" : ""}
                      {formatMoney(doc.totals.roundOff, currencySymbol)}
                    </span>
                  </div>
                ) : null}
              </div>

              {solidDivider}

              {/* Net Payable */}
              <div className="flex justify-between text-[13px] font-bold">
                <span>NET PAYABLE</span>
                <span className="tabular-nums text-[14px]">
                  {formatMoney(doc.totals.netPayable, currencySymbol)}
                </span>
              </div>

              {solidDivider}

              {/* Payments Section */}
              <div className="space-y-1 text-[11px]">
                <div className="font-bold uppercase tracking-wider text-[10px]">
                  PAYMENT
                </div>
                {doc.payment.payments.map((p, i) => (
                  <div key={i} className="flex justify-between">
                    <span>
                      {p.label || p.method}
                      {p.status && p.status !== "succeeded" ? ` (${p.status})` : ""}
                    </span>
                    <span className="tabular-nums">{formatMoney(p.amount, currencySymbol)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold pt-0.5">
                  <span>Amount Paid</span>
                  <span className="tabular-nums text-green-800">
                    {formatMoney(doc.payment.totalPaid, currencySymbol)}
                  </span>
                </div>
                {doc.payment.balanceDue > 0 ? (
                  <div className="flex justify-between font-bold text-red-700">
                    <span>Balance Due</span>
                    <span className="tabular-nums">
                      {formatMoney(doc.payment.balanceDue, currencySymbol)}
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-between pt-0.5">
                  <span>Status:</span>
                  <span
                    className={`font-bold uppercase ${
                      doc.payment.status === "PAID"
                        ? "text-green-800"
                        : doc.payment.status === "REFUNDED"
                          ? "text-purple-800"
                          : "text-red-700"
                    }`}
                  >
                    {doc.payment.status}
                  </span>
                </div>
                {doc.payment.changeReturned ? (
                  <div className="flex justify-between text-blue-900 font-semibold">
                    <span>Change Returned</span>
                    <span className="tabular-nums">
                      {formatMoney(doc.payment.changeReturned, currencySymbol)}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* UPI QR Scan & Pay */}
              {upiVpa && doc.payment.balanceDue > 0 ? (
                <>
                  {divider}
                  <div className="mt-2 text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt="Pay QR"
                      className="mx-auto h-24 w-24 bg-white border border-gray-300 p-0.5"
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(
                        `upi://pay?pa=${encodeURIComponent(upiVpa)}&pn=${encodeURIComponent(upiPayee)}&am=${doc.payment.balanceDue.toFixed(2)}&cu=INR&tn=${encodeURIComponent(doc.header.orderNumber)}`,
                      )}`}
                    />
                    <p className="mt-1 font-bold text-[11px]">Scan &amp; Pay via UPI</p>
                    <p className="text-[10px]">VPA: {upiVpa}</p>
                  </div>
                </>
              ) : null}

              {solidDivider}

              {/* Barcode & Footer */}
              <div className="text-center">
                <ReceiptOrderBarcode value={doc.header.orderNumber} />
                <p className="mt-2 font-bold text-[11px]">{doc.config.footerNote}</p>
                <p className="mt-0.5 text-[10px] text-gray-600">
                  This is a computer-generated invoice.
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
