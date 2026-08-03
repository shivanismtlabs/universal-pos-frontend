"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/utils";

export type ReceiptData = {
  store: { name: string; address?: string | null };
  orderNumber: string;
  customer: { fullName: string; phone: string };
  items: Array<{
    itemType: string;
    unitPrice: string | number;
    inventoryUnit?: { barcodeSku: string; size?: string | null } | null;
    retailSku?: { sku: string } | null;
  }>;
  totals: {
    subtotal: string | number;
    taxTotal: string | number;
    depositTotal: string | number;
    balanceDue: string | number;
  };
  payments?: Array<{
    method: string;
    type: string;
    amount: string | number;
  }>;
};

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 ${strong ? "font-semibold" : ""}`}
    >
      <span className={strong ? "text-[#111827]" : "text-[#4b5563]"}>
        {label}
      </span>
      <span className="tabular-nums text-[#111827]">{value}</span>
    </div>
  );
}

export function ReceiptModal({
  data,
  loading,
  onClose,
}: {
  data: ReceiptData | null | undefined;
  loading?: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const content = (
    <div className="receipt-print-root fixed inset-0 z-[100] flex items-center justify-center bg-[#111827]/50 p-4 print:static print:block print:bg-white print:p-0">
      <div className="receipt-sheet flex max-h-[92vh] w-full max-w-[420px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:max-h-none print:w-full print:max-w-none print:overflow-visible print:rounded-none print:shadow-none">
        {/* Screen toolbar */}
        <div className="flex items-center justify-between border-b border-[#e5e7eb] px-5 py-3 print:hidden">
          <div>
            <p className="text-[0.65rem] font-semibold tracking-[0.16em] text-[#0f766e] uppercase">
              Receipt
            </p>
            <p className="display text-lg leading-tight text-[#111827]">
              Print slip
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => window.print()}>
              Print
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <div className="scroll-soft flex-1 overflow-y-auto px-5 py-5 print:overflow-visible print:px-0 print:py-0">
          {loading ? (
            <p className="py-10 text-center text-sm text-[#6b7280] print:hidden">
              Loading receipt…
            </p>
          ) : !data ? (
            <p className="py-10 text-center text-sm text-red-600 print:hidden">
              Receipt unavailable
            </p>
          ) : (
            <div className="receipt-print mx-auto w-full max-w-[340px] text-[#111827] print:max-w-none">
              {/* Brand header */}
              <header className="border-b border-dashed border-[#d1d5db] pb-4 text-center">
                <div className="mx-auto mb-2 grid h-9 w-9 place-items-center rounded-lg bg-[#0f766e] text-sm font-bold text-white print:bg-[#111827]">
                  T
                </div>
                <p className="text-[0.65rem] font-semibold tracking-[0.2em] text-[#0f766e] uppercase print:text-[#111827]">
                  Tuxedo POS
                </p>
                <h1 className="mt-1 text-xl font-semibold tracking-tight">
                  {data.store.name}
                </h1>
                {data.store.address ? (
                  <p className="mt-1 text-[0.75rem] leading-snug text-[#6b7280]">
                    {data.store.address}
                  </p>
                ) : null}
                <p className="mt-3 inline-block rounded-md bg-[#f3f4f6] px-2.5 py-1 font-mono text-xs font-semibold tracking-wide text-[#111827]">
                  {data.orderNumber}
                </p>
              </header>

              {/* Customer */}
              <section className="border-b border-dashed border-[#d1d5db] py-3">
                <p className="text-[0.65rem] font-semibold tracking-wide text-[#9ca3af] uppercase">
                  Customer
                </p>
                <p className="mt-1 text-sm font-semibold">{data.customer.fullName}</p>
                <p className="text-sm tabular-nums text-[#4b5563]">
                  {data.customer.phone}
                </p>
              </section>

              {/* Items */}
              <section className="border-b border-dashed border-[#d1d5db] py-3">
                <div className="mb-2 flex justify-between text-[0.65rem] font-semibold tracking-wide text-[#9ca3af] uppercase">
                  <span>Item</span>
                  <span>Amount</span>
                </div>
                <ul className="space-y-2">
                  {data.items.map((item, i) => (
                    <li key={i} className="flex justify-between gap-3 text-sm">
                      <span className="min-w-0 leading-snug">
                        <span className="font-medium">
                          {item.inventoryUnit?.barcodeSku ??
                            item.retailSku?.sku ??
                            item.itemType}
                        </span>
                        {item.inventoryUnit?.size ? (
                          <span className="text-[#6b7280]">
                            {" "}
                            · {item.inventoryUnit.size}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatInr(item.unitPrice)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Totals */}
              <section className="space-y-1.5 border-b border-dashed border-[#d1d5db] py-3 text-sm">
                <Row label="Subtotal" value={formatInr(data.totals.subtotal)} />
                <Row label="Tax" value={formatInr(data.totals.taxTotal)} />
                <Row
                  label="Deposit"
                  value={formatInr(data.totals.depositTotal)}
                />
                <div className="mt-2 rounded-lg bg-[#111827] px-3 py-2.5 text-white print:bg-[#111827]">
                  <div className="flex justify-between text-sm font-semibold">
                    <span>Balance due</span>
                    <span className="tabular-nums">
                      {formatInr(data.totals.balanceDue)}
                    </span>
                  </div>
                </div>
              </section>

              {/* Payments */}
              {(data.payments ?? []).length ? (
                <section className="border-b border-dashed border-[#d1d5db] py-3">
                  <p className="mb-2 text-[0.65rem] font-semibold tracking-wide text-[#9ca3af] uppercase">
                    Payments
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {data.payments!.map((p, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span className="capitalize text-[#4b5563]">
                          {p.method} · {p.type}
                        </span>
                        <span className="tabular-nums font-medium">
                          {formatInr(p.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <footer className="pt-4 text-center">
                <p className="text-sm font-medium text-[#111827]">
                  Thank you for your business
                </p>
                <p className="mt-1 text-[0.7rem] text-[#9ca3af]">
                  Formal wear rental · Tuxedo POS
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
