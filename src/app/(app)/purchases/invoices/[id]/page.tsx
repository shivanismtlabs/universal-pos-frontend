"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { suppliersApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { PageHeader, PageSkeleton } from "@/components/page-header";

function fmtDate(v?: string | null) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleDateString();
  } catch {
    return String(v).slice(0, 10);
  }
}

export default function PurchaseInvoiceDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const { money } = useBootstrap();
  const q = useQuery({
    queryKey: ["supplier-invoice", id],
    queryFn: () => suppliersApi.getInvoice(id),
    enabled: Boolean(id),
  });

  if (q.isLoading || !q.data) {
    return q.isError ? (
      <p className="p-6 text-sm text-[#c81e1e]">Invoice not found.</p>
    ) : (
      <PageSkeleton rows={8} />
    );
  }

  const inv = q.data;

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <PageHeader
        title={inv.invoiceNumber}
        subtitle="Purchase invoice — amounts, due date, and payments"
      />
      <Button asChild size="sm" variant="secondary">
        <Link href="/purchases">← All purchases</Link>
      </Button>

      <section className="rounded-xl border border-[#d9e0ea] bg-white p-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[0.7rem] font-semibold tracking-wide text-[#8b9bb0] uppercase">
              Supplier
            </dt>
            <dd className="mt-0.5 font-medium text-[#0b1f33]">
              {inv.supplier?.name ?? "—"}
            </dd>
            <dd className="text-[#5a6b7d]">
              {inv.supplier?.phone ?? ""}
              {inv.supplier?.email ? ` · ${inv.supplier.email}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-[0.7rem] font-semibold tracking-wide text-[#8b9bb0] uppercase">
              Status
            </dt>
            <dd className="mt-0.5 capitalize text-[#0b1f33]">{inv.status}</dd>
          </div>
          <div>
            <dt className="text-[0.7rem] font-semibold tracking-wide text-[#8b9bb0] uppercase">
              Invoice date
            </dt>
            <dd className="mt-0.5">{fmtDate(inv.invoiceDate)}</dd>
          </div>
          <div>
            <dt className="text-[0.7rem] font-semibold tracking-wide text-[#8b9bb0] uppercase">
              Due date
            </dt>
            <dd className="mt-0.5">{fmtDate(inv.dueDate)}</dd>
          </div>
          <div>
            <dt className="text-[0.7rem] font-semibold tracking-wide text-[#8b9bb0] uppercase">
              Linked PO / GRN
            </dt>
            <dd className="mt-0.5">
              {inv.purchaseOrder?.poNumber ?? "—"}
              {inv.goodsReceipt?.grnNumber
                ? ` · ${inv.goodsReceipt.grnNumber}`
                : ""}
            </dd>
          </div>
          {inv.notes ? (
            <div className="sm:col-span-2">
              <dt className="text-[0.7rem] font-semibold tracking-wide text-[#8b9bb0] uppercase">
                Notes
              </dt>
              <dd className="mt-0.5 whitespace-pre-wrap">{inv.notes}</dd>
            </div>
          ) : null}
        </dl>
        <div className="mt-4 grid gap-2 border-t border-[#eef1f4] pt-4 text-sm">
          <p className="flex justify-between">
            <span className="text-[#5a6b7d]">Subtotal</span>
            <span className="tabular-nums">{money(inv.subtotal)}</span>
          </p>
          <p className="flex justify-between">
            <span className="text-[#5a6b7d]">Tax</span>
            <span className="tabular-nums">{money(inv.taxTotal)}</span>
          </p>
          <p className="flex justify-between font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{money(inv.grandTotal)}</span>
          </p>
          <p className="flex justify-between">
            <span className="text-[#5a6b7d]">Paid</span>
            <span className="tabular-nums">{money(inv.amountPaid)}</span>
          </p>
          <p className="flex justify-between font-semibold text-[#1a56db]">
            <span>Balance due</span>
            <span className="tabular-nums">{money(inv.balanceDue)}</span>
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-[#d9e0ea] bg-white p-5">
        <h2 className="text-sm font-semibold text-[#0b1f33]">Payments</h2>
        {!inv.payments?.length ? (
          <p className="mt-2 text-sm text-[#5a6b7d]">No payments yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#eef1f4] text-sm">
            {inv.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
                <div>
                  <p className="font-medium capitalize text-[#0b1f33]">
                    {p.method}
                    {p.kind === "refund" ? " · refund" : ""}
                  </p>
                  <p className="text-xs text-[#5a6b7d]">
                    {fmtDate(p.paidAt)}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </p>
                  {p.notes ? (
                    <p className="mt-0.5 text-xs text-[#5a6b7d]">{p.notes}</p>
                  ) : null}
                </div>
                <p className="tabular-nums font-semibold">{money(p.amount)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
