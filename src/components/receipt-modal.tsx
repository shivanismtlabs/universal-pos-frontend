"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatMoney, moneyNumber } from "@/lib/utils";
import { useBootstrapOptional } from "@/lib/bootstrap";
import { ModeBadge } from "@/components/mode-badge";
import { notifyApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";

export type ReceiptData = {
  store: {
    name: string;
    address?: string | null;
    shopName?: string | null;
    taxId?: string | null;
  };
  orderId?: string;
  orderNumber: string;
  kind?: string | null;
  cashier?: string | null;
  receiptFooter?: string | null;
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
    inventoryUnit?: { barcodeSku: string; size?: string | null } | null;
    retailSku?: { sku: string } | null;
    product?: { name?: string; skuCode?: string } | null;
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
  }>;
  change?: string | number | null;
  cashTendered?: string | number | null;
};

function moneyLabel(method: string) {
  const m = method.trim().toLowerCase();
  if (m === "card" || m === "stripe") return "Card";
  if (m === "cash") return "Cash";
  if (m === "upi") return "UPI";
  return method.charAt(0).toUpperCase() + method.slice(1);
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
  const productName = boot?.productName ?? "Universal POS";
  const tagline = boot?.tagline ?? "Point of sale";
  const money =
    boot?.money ??
    ((amount: string | number | null | undefined) =>
      formatMoney(amount, "INR", "en-IN"));
  const initial = (shopName.trim()[0] || "S").toUpperCase();
  const settings = boot?.data?.tenant?.settings as
    | { tax?: { receiptFooter?: string } }
    | undefined;
  const receiptFooter =
    data?.receiptFooter?.trim() ||
    settings?.tax?.receiptFooter?.trim() ||
    "";
  const taxId = data?.store?.taxId?.trim() || "";

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
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const changeAmt = change ?? data?.change;
  const tenderedAmt = cashTendered ?? data?.cashTendered;
  const balanceDue = moneyNumber(data?.totals.balanceDue);
  const isPaid = balanceDue <= 0;
  const [invoiceMode, setInvoiceMode] = useState(false);
  const [sending, setSending] = useState(false);

  async function sendChannels(channels: Array<"email" | "sms">) {
    if (!data?.customer?.id) {
      toast.error("Attach a customer to send invoice");
      return;
    }
    if (channels.includes("email") && !data.customer.email) {
      toast.error("Customer has no email on file");
      return;
    }
    if (channels.includes("sms") && !data.customer.phone) {
      toast.error("Customer has no phone on file");
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
            : "Invoice send attempted — check Notify logs",
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

  const content = (
    <div className="receipt-print-root fixed inset-0 z-[100] flex items-center justify-center bg-[#0b1f33]/45 p-4 print:static print:block print:bg-white print:p-0">
      <div className="receipt-sheet flex max-h-[92vh] w-full max-w-[400px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_48px_-20px_rgba(11,31,51,0.35)] print:max-h-none print:w-full print:max-w-none print:overflow-visible print:rounded-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-[#e8ebf0] px-5 py-3 print:hidden">
          <div>
            <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-[#5a6b7d] uppercase">
              {invoiceMode ? "Tax invoice" : "Receipt"}
            </p>
            <p className="text-lg font-semibold tracking-tight text-[#0b1f33]">
              {invoiceMode ? "Print invoice" : "Print slip"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setInvoiceMode((v) => !v)}
            >
              {invoiceMode ? "Receipt view" : "Invoice view"}
            </Button>
            {data?.customer?.phone || data?.customer ? (
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
            <Button type="button" size="sm" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <div className="scroll-soft flex-1 overflow-y-auto px-6 py-6 print:overflow-visible print:px-0 print:py-0">
          {loading ? (
            <p className="py-10 text-center text-sm text-[#5a6b7d] print:hidden">
              Loading receipt…
            </p>
          ) : !data ? (
            <p className="py-10 text-center text-sm text-[#c81e1e] print:hidden">
              Receipt unavailable
            </p>
          ) : (
            <div className="receipt-print mx-auto w-full max-w-[320px] text-[#0b1f33] print:max-w-none">
              {/* Header */}
              <header className="text-center">
                <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-[#0b1f33] text-[1.05rem] font-bold tracking-tight text-white">
                  {initial}
                </div>
                <p className="text-[0.68rem] font-semibold tracking-[0.18em] text-[#5a6b7d] uppercase">
                  {shopName}
                </p>
                <h1 className="mt-1.5 text-[1.45rem] font-bold tracking-[-0.03em] text-[#0b1f33]">
                  {data.store.name}
                </h1>
                {data.store.address ? (
                  <p className="mx-auto mt-1.5 max-w-[260px] text-[0.78rem] leading-snug text-[#5a6b7d]">
                    {data.store.address}
                  </p>
                ) : null}
                {taxId ? (
                  <p className="mt-1 text-[0.72rem] tabular-nums text-[#5a6b7d]">
                    Tax ID: {taxId}
                  </p>
                ) : null}
                {data.cashier ? (
                  <p className="mt-1 text-[0.72rem] text-[#5a6b7d]">
                    Cashier: {data.cashier}
                  </p>
                ) : null}
                <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
                  <p className="inline-block rounded-full bg-[#eef1f5] px-3.5 py-1 font-mono text-[0.78rem] font-semibold tracking-wide text-[#0b1f33]">
                    {data.orderNumber}
                  </p>
                  {data.kind ? <ModeBadge mode={data.kind} /> : null}
                </div>
              </header>

              {/* Customer */}
              <section className="mt-6">
                <p className="text-[0.62rem] font-semibold tracking-[0.14em] text-[#8b9bb0] uppercase">
                  Customer
                </p>
                <p className="mt-1 text-[0.95rem] font-semibold tracking-tight text-[#0b1f33]">
                  {data.customer?.fullName ?? "Walk-in"}
                </p>
                {data.customer?.phone ? (
                  <p className="mt-0.5 text-sm tabular-nums text-[#5a6b7d]">
                    {data.customer.phone}
                  </p>
                ) : null}
              </section>

              {/* Items */}
              <section className="mt-5">
                <div className="flex justify-between border-b border-[#e5e9ef] pb-2 text-[0.62rem] font-semibold tracking-[0.14em] text-[#8b9bb0] uppercase">
                  <span>Item</span>
                  <span>Amount</span>
                </div>
                <ul className="divide-y divide-[#f0f3f7]">
                  {data.items.map((item, i) => {
                    const qty = moneyNumber(item.quantity ?? 1);
                    const label =
                      item.description ||
                      item.product?.name ||
                      item.inventoryUnit?.barcodeSku ||
                      item.retailSku?.sku ||
                      item.itemType;
                    const amount =
                      item.lineTotal !== undefined
                        ? item.lineTotal
                        : moneyNumber(item.unitPrice) * qty;
                    return (
                      <li
                        key={i}
                        className="flex items-start justify-between gap-4 py-3 text-[0.9rem]"
                      >
                        <span className="min-w-0 leading-snug">
                          <span className="font-medium text-[#0b1f33]">
                            {label}
                          </span>
                          {qty !== 1 ? (
                            <span className="block text-[0.78rem] text-[#5a6b7d]">
                              × {qty} @ {money(item.unitPrice)}
                            </span>
                          ) : null}
                          {item.inventoryUnit?.size ? (
                            <span className="block text-[0.78rem] text-[#5a6b7d]">
                              {item.inventoryUnit.size}
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 tabular-nums font-medium text-[#0b1f33]">
                          {money(amount)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {/* Totals */}
              <section className="mt-1 border-t border-[#e5e9ef] pt-3 text-[0.9rem]">
                <div className="flex justify-between gap-3 py-1 text-[#5a6b7d]">
                  <span>Subtotal</span>
                  <span className="tabular-nums text-[#0b1f33]">
                    {money(data.totals.subtotal)}
                  </span>
                </div>
                {moneyNumber(data.totals.taxTotal) > 0 ? (
                  <div className="flex justify-between gap-3 py-1 text-[#5a6b7d]">
                    <span>Tax</span>
                    <span className="tabular-nums text-[#0b1f33]">
                      {money(data.totals.taxTotal)}
                    </span>
                  </div>
                ) : null}
                {moneyNumber(data.totals.discountTotal) > 0 ? (
                  <div className="flex justify-between gap-3 py-1 text-[#5a6b7d]">
                    <span>Discount</span>
                    <span className="tabular-nums text-[#0b1f33]">
                      −{money(data.totals.discountTotal)}
                    </span>
                  </div>
                ) : null}
                {moneyNumber(data.totals.depositTotal) > 0 ? (
                  <div className="flex justify-between gap-3 py-1 text-[#5a6b7d]">
                    <span>Deposit</span>
                    <span className="tabular-nums text-[#0b1f33]">
                      {money(data.totals.depositTotal)}
                    </span>
                  </div>
                ) : null}
                {tenderedAmt != null && moneyNumber(tenderedAmt) > 0 ? (
                  <div className="flex justify-between gap-3 py-1 text-[#5a6b7d]">
                    <span>Cash tendered</span>
                    <span className="tabular-nums text-[#0b1f33]">
                      {money(tenderedAmt)}
                    </span>
                  </div>
                ) : null}
                {changeAmt != null && moneyNumber(changeAmt) > 0 ? (
                  <div className="flex justify-between gap-3 py-1 font-semibold text-[#0b1f33]">
                    <span>Change</span>
                    <span className="tabular-nums">{money(changeAmt)}</span>
                  </div>
                ) : null}

                <div className="receipt-paid-bar mt-3 flex items-center justify-between rounded-md bg-[#0b1f33] px-3.5 py-3 text-white">
                  <span className="text-[0.95rem] font-semibold">
                    {isPaid ? "Paid" : "Balance due"}
                  </span>
                  <span className="text-[1.05rem] font-bold tabular-nums tracking-tight">
                    {money(isPaid ? paidTotal : data.totals.balanceDue)}
                  </span>
                </div>
              </section>

              {/* Payments */}
              {(data.payments ?? []).length ? (
                <section className="mt-4 border-t border-[#e5e9ef] pt-3">
                  <p className="mb-2 text-[0.62rem] font-semibold tracking-[0.14em] text-[#8b9bb0] uppercase">
                    Payments
                  </p>
                  <ul className="space-y-1.5 text-[0.9rem]">
                    {data.payments!.map((p, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span className="text-[#5a6b7d]">
                          {moneyLabel(p.method)}
                        </span>
                        <span className="tabular-nums font-medium text-[#0b1f33]">
                          {money(p.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {/* Footer */}
              <footer className="mt-5 border-t border-dashed border-[#d9e0ea] pt-5 text-center">
                <p className="text-[0.95rem] font-semibold tracking-tight text-[#0b1f33]">
                  {receiptFooter || "Thank you for your business"}
                </p>
                <p className="mt-1.5 text-[0.68rem] leading-snug text-[#8b9bb0]">
                  {tagline} · {productName}
                </p>
              </footer>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
