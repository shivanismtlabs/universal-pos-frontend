"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { suppliersApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { cn, todayYmd } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader, EmptyState, PageSkeleton } from "@/components/page-header";

type Tab = "grn" | "invoices" | "outstanding" | "payments" | "ledger";

const TABS: { id: Tab; label: string }[] = [
  { id: "grn", label: "GRN" },
  { id: "invoices", label: "Invoices" },
  { id: "outstanding", label: "Outstanding" },
  { id: "payments", label: "Payments" },
  { id: "ledger", label: "Ledger" },
];

const PAY_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "wallet", label: "Wallet" },
] as const;

function errMsg(e: unknown) {
  return e instanceof ApiError ? e.messages.join(", ") : "Failed";
}

function fmtDate(v?: string | null) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleDateString();
  } catch {
    return v.slice(0, 10);
  }
}

export default function PurchasesPage() {
  const { money } = useBootstrap();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("grn");

  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => suppliersApi.list(),
  });

  const grns = useQuery({
    queryKey: ["goods-receipts"],
    queryFn: () => suppliersApi.listGrns(),
    enabled: tab === "grn",
  });

  const invoices = useQuery({
    queryKey: ["supplier-invoices"],
    queryFn: () => suppliersApi.listInvoices(),
    enabled: tab === "invoices",
  });

  const outstanding = useQuery({
    queryKey: ["supplier-invoices-outstanding"],
    queryFn: () => suppliersApi.listOutstanding(),
    enabled: tab === "outstanding",
  });

  const payments = useQuery({
    queryKey: ["supplier-payments"],
    queryFn: () => suppliersApi.listPayments(),
    enabled: tab === "payments",
  });

  // ── Invoice create form ──────────────────────────────────────────────────
  const [invSupplierId, setInvSupplierId] = useState("");
  const [invSubtotal, setInvSubtotal] = useState("");
  const [invTax, setInvTax] = useState("");
  const [invDue, setInvDue] = useState("");
  const [invCredit, setInvCredit] = useState(false);

  const createInvoice = useMutation({
    mutationFn: () =>
      suppliersApi.createInvoice({
        supplierId: invSupplierId,
        subtotal: Number(invSubtotal),
        taxTotal: invTax ? Number(invTax) : 0,
        dueDate: invDue || undefined,
        isCredit: invCredit || undefined,
      }),
    onSuccess: () => {
      toast.success(invCredit ? "Credit note created" : "Invoice created");
      setInvSubtotal("");
      setInvTax("");
      setInvDue("");
      setInvCredit(false);
      void qc.invalidateQueries({ queryKey: ["supplier-invoices"] });
      void qc.invalidateQueries({ queryKey: ["supplier-invoices-outstanding"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  // ── Bill from GRN ────────────────────────────────────────────────────────
  const billFromGrn = useMutation({
    mutationFn: (id: string) => suppliersApi.invoiceFromGrn(id),
    onSuccess: (inv) => {
      toast.success(`Invoice ${inv.invoiceNumber} created`);
      void qc.invalidateQueries({ queryKey: ["supplier-invoices"] });
      void qc.invalidateQueries({ queryKey: ["supplier-invoices-outstanding"] });
      void qc.invalidateQueries({ queryKey: ["goods-receipts"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  // ── Pay outstanding ──────────────────────────────────────────────────────
  const [payId, setPayId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("bank_transfer");
  const [payRef, setPayRef] = useState("");

  const payInvoice = useMutation({
    mutationFn: () =>
      suppliersApi.payInvoice(payId!, {
        amount: Number(payAmount),
        method: payMethod,
        reference: payRef.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Payment recorded");
      setPayId(null);
      setPayAmount("");
      setPayRef("");
      void qc.invalidateQueries({ queryKey: ["supplier-invoices-outstanding"] });
      void qc.invalidateQueries({ queryKey: ["supplier-invoices"] });
      void qc.invalidateQueries({ queryKey: ["supplier-payments"] });
      void qc.invalidateQueries({ queryKey: ["supplier-ledger"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  // ── Ledger ───────────────────────────────────────────────────────────────
  const [ledgerSupplierId, setLedgerSupplierId] = useState("");
  const ledger = useQuery({
    queryKey: ["supplier-ledger", ledgerSupplierId],
    queryFn: () => suppliersApi.supplierLedger(ledgerSupplierId),
    enabled: tab === "ledger" && !!ledgerSupplierId,
  });

  const loading =
    (tab === "grn" && grns.isLoading) ||
    (tab === "invoices" && invoices.isLoading) ||
    (tab === "outstanding" && outstanding.isLoading) ||
    (tab === "payments" && payments.isLoading);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Purchases"
        subtitle="Goods receipts, supplier invoices, payments, and AP ledger."
      />

      <div className="flex flex-wrap gap-1 border-b border-[#eef1f4]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === t.id
                ? "border-[#1a56db] text-[#1a56db]"
                : "border-transparent text-[#5a6b7d] hover:text-[#0b1f33]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <PageSkeleton rows={6} /> : null}

      {/* ── GRN ─────────────────────────────────────────────────────────── */}
      {tab === "grn" && !grns.isLoading ? (
        <section className="overflow-hidden rounded-xl border border-[#d9e0ea] bg-white">
          {(grns.data ?? []).length === 0 ? (
            <EmptyState
              title="No goods receipts"
              detail="Receive a purchase order to create a GRN."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-[#eef1f4] bg-[#f7f9fc] text-[0.7rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
                  <tr>
                    <th className="px-3 py-2">GRN #</th>
                    <th className="px-3 py-2">Supplier</th>
                    <th className="px-3 py-2">PO</th>
                    <th className="px-3 py-2">Received</th>
                    <th className="px-3 py-2 text-right">Lines</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(grns.data ?? []).map((g) => (
                    <tr
                      key={g.id}
                      className="border-b border-[#eef1f4] last:border-0"
                    >
                      <td className="px-3 py-2 font-medium text-[#0b1f33]">
                        {g.grnNumber}
                      </td>
                      <td className="px-3 py-2 text-[#0b1f33]">
                        {g.supplier?.name ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[#5a6b7d]">
                        {g.purchaseOrder?.poNumber ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[#5a6b7d]">
                        {fmtDate(g.receivedAt)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {g.lines?.length ?? 0}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-8 text-xs"
                          disabled={billFromGrn.isPending}
                          onClick={() => billFromGrn.mutate(g.id)}
                        >
                          Bill from GRN
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {/* ── Invoices ────────────────────────────────────────────────────── */}
      {tab === "invoices" && !invoices.isLoading ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <section className="space-y-3 rounded-xl border border-[#d9e0ea] bg-white p-4">
            <h2 className="text-sm font-semibold text-[#0b1f33]">
              New invoice
            </h2>
            <div>
              <Label>Supplier</Label>
              <Select
                className="mt-1"
                value={invSupplierId}
                onChange={(e) => setInvSupplierId(e.target.value)}
              >
                <option value="">Select…</option>
                {(suppliers.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Subtotal</Label>
                <Input
                  type="number"
                  className="mt-1"
                  value={invSubtotal}
                  onChange={(e) => setInvSubtotal(e.target.value)}
                />
              </div>
              <div>
                <Label>Tax</Label>
                <Input
                  type="number"
                  className="mt-1"
                  value={invTax}
                  onChange={(e) => setInvTax(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>Due date</Label>
              <Input
                type="date"
                className="mt-1"
                value={invDue}
                onChange={(e) => setInvDue(e.target.value)}
                min={todayYmd()}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-[#0b1f33]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#1a56db]"
                checked={invCredit}
                onChange={(e) => setInvCredit(e.target.checked)}
              />
              Credit note
            </label>
            <Button
              type="button"
              disabled={
                createInvoice.isPending || !invSupplierId || !invSubtotal
              }
              onClick={() => createInvoice.mutate()}
            >
              {createInvoice.isPending ? "Saving…" : "Create invoice"}
            </Button>
          </section>

          <section className="overflow-hidden rounded-xl border border-[#d9e0ea] bg-white">
            {(invoices.data ?? []).length === 0 ? (
              <EmptyState title="No invoices yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-[#eef1f4] bg-[#f7f9fc] text-[0.7rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
                    <tr>
                      <th className="px-3 py-2">Invoice #</th>
                      <th className="px-3 py-2">Supplier</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(invoices.data ?? []).map((inv) => (
                      <tr
                        key={inv.id}
                        className="border-b border-[#eef1f4] last:border-0"
                      >
                        <td className="px-3 py-2 font-medium text-[#0b1f33]">
                          {inv.invoiceNumber}
                        </td>
                        <td className="px-3 py-2">
                          {inv.supplier?.name ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-[#5a6b7d]">
                          {fmtDate(inv.invoiceDate)}
                        </td>
                        <td className="px-3 py-2 capitalize text-[#5a6b7d]">
                          {inv.status}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {money(inv.grandTotal)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {money(inv.balanceDue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {/* ── Outstanding ─────────────────────────────────────────────────── */}
      {tab === "outstanding" && !outstanding.isLoading ? (
        <div className="space-y-4">
          {payId ? (
            <section className="space-y-3 rounded-xl border border-[#d9e0ea] bg-white p-4">
              <h2 className="text-sm font-semibold text-[#0b1f33]">
                Record payment
              </h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    className="mt-1"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Method</Label>
                  <Select
                    className="mt-1"
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                  >
                    {PAY_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Reference</Label>
                  <Input
                    className="mt-1"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="Cheque / UTR / note"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  disabled={payInvoice.isPending || !payAmount}
                  onClick={() => payInvoice.mutate()}
                >
                  {payInvoice.isPending ? "Saving…" : "Pay"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setPayId(null);
                    setPayAmount("");
                    setPayRef("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </section>
          ) : null}

          <section className="overflow-hidden rounded-xl border border-[#d9e0ea] bg-white">
            {(outstanding.data ?? []).length === 0 ? (
              <EmptyState
                title="Nothing outstanding"
                detail="All supplier balances are settled."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-[#eef1f4] bg-[#f7f9fc] text-[0.7rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
                    <tr>
                      <th className="px-3 py-2">Invoice #</th>
                      <th className="px-3 py-2">Supplier</th>
                      <th className="px-3 py-2">Due</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Balance due</th>
                      <th className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(outstanding.data ?? []).map((inv) => (
                      <tr
                        key={inv.id}
                        className="border-b border-[#eef1f4] last:border-0"
                      >
                        <td className="px-3 py-2 font-medium text-[#0b1f33]">
                          {inv.invoiceNumber}
                        </td>
                        <td className="px-3 py-2">
                          {inv.supplier?.name ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-[#5a6b7d]">
                          {fmtDate(inv.dueDate)}
                        </td>
                        <td className="px-3 py-2 capitalize text-[#5a6b7d]">
                          {inv.status}
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-[#0b1f33]">
                          {money(inv.balanceDue)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-8 text-xs"
                            onClick={() => {
                              setPayId(inv.id);
                              setPayAmount(
                                String(Math.abs(inv.balanceDue).toFixed(2)),
                              );
                            }}
                          >
                            Pay
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {/* ── Payments ────────────────────────────────────────────────────── */}
      {tab === "payments" && !payments.isLoading ? (
        <section className="overflow-hidden rounded-xl border border-[#d9e0ea] bg-white">
          {(payments.data ?? []).length === 0 ? (
            <EmptyState title="No payments recorded" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-[#eef1f4] bg-[#f7f9fc] text-[0.7rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Supplier</th>
                    <th className="px-3 py-2">Invoice</th>
                    <th className="px-3 py-2">Method</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(payments.data ?? []).map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-[#eef1f4] last:border-0"
                    >
                      <td className="px-3 py-2 text-[#5a6b7d]">
                        {fmtDate(p.paidAt)}
                      </td>
                      <td className="px-3 py-2">{p.supplier?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-[#5a6b7d]">
                        {p.invoice?.invoiceNumber ?? "—"}
                      </td>
                      <td className="px-3 py-2 capitalize text-[#5a6b7d]">
                        {p.method.replace("_", " ")}
                      </td>
                      <td className="px-3 py-2 text-[#5a6b7d]">
                        {p.reference || "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {money(p.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {/* ── Ledger ──────────────────────────────────────────────────────── */}
      {tab === "ledger" ? (
        <div className="space-y-4">
          <section className="rounded-xl border border-[#d9e0ea] bg-white p-4">
            <Label>Supplier</Label>
            <Select
              className="mt-1 max-w-sm"
              value={ledgerSupplierId}
              onChange={(e) => setLedgerSupplierId(e.target.value)}
            >
              <option value="">Select supplier…</option>
              {(suppliers.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </section>

          {!ledgerSupplierId ? (
            <EmptyState
              title="Select a supplier"
              detail="View running AP balance for invoices and payments."
            />
          ) : ledger.isLoading ? (
            <PageSkeleton rows={5} />
          ) : (
            <section className="overflow-hidden rounded-xl border border-[#d9e0ea] bg-white">
              <div className="flex items-center justify-between border-b border-[#eef1f4] px-3 py-2">
                <span className="text-xs font-semibold tracking-wide text-[#5a6b7d] uppercase">
                  Running balance
                </span>
                <span className="text-sm font-semibold tabular-nums text-[#0b1f33]">
                  {money(ledger.data?.balance ?? 0)}
                </span>
              </div>
              {(ledger.data?.items ?? []).length === 0 ? (
                <EmptyState title="No ledger entries" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="border-b border-[#eef1f4] bg-[#f7f9fc] text-[0.7rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Kind</th>
                        <th className="px-3 py-2">Ref</th>
                        <th className="px-3 py-2 text-right">Debit</th>
                        <th className="px-3 py-2 text-right">Credit</th>
                        <th className="px-3 py-2 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(ledger.data?.items ?? []).map((e, i) => (
                        <tr
                          key={`${e.ref}-${e.at}-${i}`}
                          className="border-b border-[#eef1f4] last:border-0"
                        >
                          <td className="px-3 py-2 text-[#5a6b7d]">
                            {fmtDate(e.at)}
                          </td>
                          <td className="px-3 py-2 capitalize">{e.kind}</td>
                          <td className="px-3 py-2 font-medium text-[#0b1f33]">
                            {e.ref}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {e.debit ? money(e.debit) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {e.credit ? money(e.credit) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">
                            {money(e.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      ) : null}
    </div>
  );
}
