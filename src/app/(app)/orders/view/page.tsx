"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  billingApi,
  documentsApi,
  inventoryApi,
  notifyApi,
  ordersApi,
  paymentsApi,
  posApi,
  tenantsApi,
} from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import {
  addOrderItemSchema,
  type AddOrderItemInput,
} from "@/lib/validations";
import {
  ITEMS_MUTABLE_STATUSES,
  ORDER_STATUS_TRANSITIONS,
  RENTAL_LIFECYCLE_TRANSITIONS,
  canMutateRentalItems,
  lifecycleLabel,
  rentalLifecycleOf,
} from "@/lib/order-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/form";
import {
  formatDate,
  formatInr,
  moneyNumber,
  newIdempotencyKey,
} from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";
import { canFinance, canRefund } from "@/lib/roles";
import { Suspense, useState } from "react";
import { ModeBadge } from "@/components/mode-badge";
import { PageBreadcrumb, PageSkeleton } from "@/components/page-header";
import { ReceiptModal, type ReceiptData } from "@/components/receipt-modal";
import { SaleReturnDialog } from "@/components/sale-return-dialog";

export default function OrderDetailPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OrderDetailInner />
    </Suspense>
  );
}

function OrderDetailInner() {
  const search = useSearchParams();
  const id = search.get("id") ?? "";
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const allowRefund = canRefund(roles);
  const allowFinance = canFinance(roles);
  const [layDue, setLayDue] = useState("");
  const [layAmt, setLayAmt] = useState("");
  const [feeType, setFeeType] = useState<"late" | "damage" | "other">("late");
  const [feeAmt, setFeeAmt] = useState("");
  const [extendDate, setExtendDate] = useState("");
  const [extendPay, setExtendPay] = useState(true);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [saleReturnOpen, setSaleReturnOpen] = useState(false);

  const order = useQuery({
    queryKey: ["order", id],
    queryFn: () => ordersApi.get(id),
    enabled: Boolean(id),
  });
  const units = useQuery({
    queryKey: ["units", "pick"],
    queryFn: () => inventoryApi.listUnits({ limit: 100 }),
  });
  const retail = useQuery({
    queryKey: ["retail-skus", "pick"],
    queryFn: () => inventoryApi.listRetailSkus({ limit: 100 }),
  });
  const fees = useQuery({
    queryKey: ["fees", id],
    queryFn: () => billingApi.listFees(id),
    enabled: Boolean(id) && allowFinance,
  });
  const layaway = useQuery({
    queryKey: ["layaway", id],
    queryFn: () => billingApi.listLayaway(id),
    enabled: Boolean(id) && allowFinance,
  });
  const invoices = useQuery({
    queryKey: ["invoices", id],
    queryFn: () => billingApi.listInvoices(id),
    enabled: Boolean(id) && allowFinance,
  });
  const docs = useQuery({
    queryKey: ["documents", id],
    queryFn: () => documentsApi.list({ orderId: id }),
    enabled: Boolean(id),
  });
  const tenant = useQuery({
    queryKey: ["tenant-me"],
    queryFn: () => tenantsApi.me(),
  });

  const receiptQ = useQuery({
    queryKey: ["order-receipt", id],
    queryFn: () => posApi.receipt(id),
    enabled: Boolean(id) && receiptOpen,
  });

  const sendInvoice = useMutation({
    mutationFn: () =>
      notifyApi.sendInvoice({
        orderId: id,
        channels: ["email", "sms"],
      }),
    onSuccess: (res) => {
      const ok = res.results.filter((r) => r.status.startsWith("sent")).length;
      toast.success(
        ok
          ? `Invoice sent on ${ok} channel(s)`
          : "Invoice send attempted — check Notify logs",
      );
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Invoice send failed",
      ),
  });

  const form = useForm<AddOrderItemInput>({
    resolver: zodResolver(addOrderItemSchema),
    defaultValues: {
      itemType: "rental_unit",
      inventoryUnitId: "",
      retailSkuId: "",
      unitPrice: undefined,
      size: "",
    },
  });
  const itemType = form.watch("itemType");

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["order", id] });
    void qc.invalidateQueries({ queryKey: ["orders"] });
    void qc.invalidateQueries({ queryKey: ["fees", id] });
    void qc.invalidateQueries({ queryKey: ["layaway", id] });
    void qc.invalidateQueries({ queryKey: ["invoices", id] });
    void qc.invalidateQueries({ queryKey: ["documents", id] });
    void qc.invalidateQueries({ queryKey: ["retail-skus"] });
  };

  const statusMut = useMutation({
    mutationFn: (status: string) => {
      if (order.data?.rentalExt) {
        return ordersApi.changeRentalLifecycle(id, status);
      }
      return ordersApi.updateStatus(id, status);
    },
    onSuccess: () => {
      toast.success("Status updated");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const addItem = useMutation({
    mutationFn: (v: AddOrderItemInput) =>
      ordersApi.addItem(id, {
        itemType: v.itemType,
        inventoryUnitId:
          v.itemType === "rental_unit"
            ? v.inventoryUnitId || undefined
            : undefined,
        retailSkuId:
          v.itemType === "retail" ? v.retailSkuId || undefined : undefined,
        unitPrice: v.unitPrice,
        size: v.size || undefined,
      }),
    onSuccess: () => {
      toast.success("Item added");
      form.reset({
        itemType: "rental_unit",
        inventoryUnitId: "",
        retailSkuId: "",
        size: "",
      });
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => ordersApi.removeItem(id, itemId),
    onSuccess: () => {
      toast.success("Item removed");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const refundMut = useMutation({
    mutationFn: (p: { id: string; amount: number }) =>
      paymentsApi.refund(p.id, {
        amount: p.amount,
        idempotencyKey: newIdempotencyKey(),
        reason: "Staff refund",
      }),
    onSuccess: () => {
      toast.success("Refund recorded");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const createInvoice = useMutation({
    mutationFn: () =>
      billingApi.createInvoice(id, {
        gstin: tenant.data?.gstin ?? undefined,
        placeOfSupply: "Maharashtra",
      }),
    onSuccess: () => {
      toast.success("GST invoice created");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const addFee = useMutation({
    mutationFn: () =>
      billingApi.createFee(id, {
        feeType,
        amount: Number(feeAmt),
        reason: feeType === "late" ? "Manual late fee" : undefined,
      }),
    onSuccess: () => {
      toast.success("Fee added");
      setFeeAmt("");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const lateAuto = useMutation({
    mutationFn: () => billingApi.applyLateFee(id),
    onSuccess: () => {
      toast.success("Late fee applied");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const addLayaway = useMutation({
    mutationFn: () =>
      billingApi.createLayaway(id, [
        { dueBy: layDue, installmentAmount: Number(layAmt) },
      ]),
    onSuccess: () => {
      toast.success("Layaway installment added");
      setLayDue("");
      setLayAmt("");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const markLay = useMutation({
    mutationFn: (layId: string) => billingApi.updateLayaway(layId, "paid"),
    onSuccess: () => {
      toast.success("Installment marked paid");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const createAgreement = useMutation({
    mutationFn: () =>
      documentsApi.create({
        docType: "agreement",
        storageKey: `agreements/${id}/${Date.now()}.txt`,
        orderId: id,
        customerId: order.data?.customer?.id,
      }),
    onSuccess: () => {
      toast.success("Agreement created");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const ackDoc = useMutation({
    mutationFn: (docId: string) => documentsApi.acknowledge(docId),
    onSuccess: () => {
      toast.success("Customer acknowledged");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const extendRental = useMutation({
    mutationFn: () =>
      posApi.rentalExtend({
        orderId: id,
        newReturnDueDate: extendDate,
      }),
    onSuccess: async (r) => {
      toast.success(
        `Extended +${r.extraDays} day(s) to ${r.newReturnDueDate}. Fee ${formatInr(r.extensionFee)}`,
      );
      setExtendDate("");
      if (extendPay && Number(r.extensionFee) > 0) {
        try {
          await paymentsApi.create({
            orderId: id,
            method: "cash",
            amount: Number(r.extensionFee),
            idempotencyKey: newIdempotencyKey("extend-pay"),
          });
          toast.success("Extension fee collected (cash)");
        } catch {
          toast.message("Extension saved — collect fee from Payments");
        }
      }
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const data = order.data;
  const isRental = Boolean(data?.rentalExt);
  const lifecycle = data ? rentalLifecycleOf(data) : "quote";
  const nextStatuses = data
    ? isRental
      ? (RENTAL_LIFECYCLE_TRANSITIONS[lifecycle] ?? []).filter(
          (s) => s !== "cancelled",
        )
      : (ORDER_STATUS_TRANSITIONS[data.status] ?? [])
    : [];
  const canEditItems = data
    ? isRental
      ? canMutateRentalItems(data)
      : ITEMS_MUTABLE_STATUSES.has(data.status)
    : false;

  if (order.isLoading) {
    return <PageSkeleton rows={6} />;
  }
  if (order.isError || !data) {
    return (
      <div className="space-y-3">
        <PageBreadcrumb
          items={[
            { label: "All orders", href: "/orders" },
            { label: "Not found" },
          ]}
        />
        <p className="text-[#c81e1e]">Order not found</p>
        <Link href="/orders" className="text-sm text-[#1a56db] hover:underline">
          Back to all orders
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageBreadcrumb
        items={[
          { label: "All orders", href: "/orders" },
          { label: data.orderNumber },
        ]}
      />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="page-title">{data.orderNumber}</h1>
            <ModeBadge mode={data.kind} />
          </div>
          <p className="page-subtitle mt-1">
            {data.customer?.fullName ?? "Walk-in"}
            {data.customer?.phone ? ` · ${data.customer.phone}` : ""} ·{" "}
            {isRental
              ? lifecycleLabel(lifecycle)
              : data.status.replaceAll("_", " ")}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          {allowRefund &&
          data.kind === "sale" &&
          data.status === "closed" ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setSaleReturnOpen(true)}
            >
              Sale return
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setReceiptOpen(true)}
          >
            Print receipt
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={
              sendInvoice.isPending || !data.customer?.id
            }
            title={
              data.customer?.id
                ? "Email / SMS invoice to customer"
                : "Attach a customer to send invoice"
            }
            onClick={() => sendInvoice.mutate()}
          >
            {sendInvoice.isPending ? "Sending…" : "Email / SMS invoice"}
          </Button>
          <div className="text-right">
            <p className="text-caption font-medium tracking-wide text-[var(--muted)] uppercase">
              Balance
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatInr(data.balanceDue)}
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {nextStatuses.map((s) => (
          <Button
            key={s}
            type="button"
            size="sm"
            variant="secondary"
            disabled={statusMut.isPending}
            onClick={() => statusMut.mutate(s)}
          >
            → {lifecycleLabel(s)}
          </Button>
        ))}
        <Link href={`/counter?order=${data.id}`}>
          <Button type="button" size="sm">
            Open terminal
          </Button>
        </Link>
      </div>

      {isRental &&
      ["reserved", "ready", "checked_out"].includes(lifecycle) ? (
        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
          <h2 className="text-sm font-semibold">Extend rental</h2>
          <p className="mt-1 text-xs text-[#6b7280]">
            Current due:{" "}
            {formatDate(
              data.rentalExt?.returnDueDate ?? data.returnDueDate ?? null,
            )}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <Label>New return date</Label>
              <Input
                className="mt-1"
                type="date"
                value={extendDate}
                onChange={(e) => setExtendDate(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={extendPay}
                onChange={(e) => setExtendPay(e.target.checked)}
              />
              Collect fee now (cash)
            </label>
            <Button
              type="button"
              size="sm"
              disabled={!extendDate || extendRental.isPending}
              onClick={() => extendRental.mutate()}
            >
              {extendRental.isPending ? "Extending…" : "Extend"}
            </Button>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Subtotal", formatInr(data.subtotal)],
          ["Tax", formatInr(data.taxTotal)],
          ["Deposit", formatInr(data.depositTotal)],
          ["Pickup", formatDate(data.pickupDate)],
        ].map(([k, v]) => (
          <div
            key={k}
            className="rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5"
          >
            <p className="text-[0.65rem] font-semibold tracking-wide text-[#9ca3af] uppercase">
              {k}
            </p>
            <p className="mt-0.5 text-sm font-semibold">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.9fr]">
        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
          <h2 className="text-sm font-semibold">Line items</h2>
          <table className="mt-2 w-full text-left text-sm">
            <tbody className="divide-y divide-[#f3f4f6]">
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <ModeBadge
                        mode={
                          item.itemType === "retail" ||
                          item.itemType === "sale"
                            ? "sale"
                            : item.itemType === "rental_unit" ||
                                item.itemType === "rental"
                              ? "rental"
                              : item.itemType
                        }
                      />
                      <span className="font-medium">
                        {item.inventoryUnit?.barcodeSku ??
                          item.retailSku?.sku ??
                          item.itemType}
                      </span>
                    </div>
                    {item.size ? (
                      <span className="text-[#6b7280]"> · {item.size}</span>
                    ) : null}
                  </td>
                  <td className="py-2.5">{formatInr(item.unitPrice)}</td>
                  <td className="py-2.5 text-right">
                    {canEditItems ? (
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => removeItem.mutate(item.id)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.items.length ? (
            <p className="py-4 text-sm text-[#6b7280]">No items yet</p>
          ) : null}

          {canEditItems ? (
            <form
              className="mt-4 space-y-3 border-t border-[#e5e7eb] pt-4"
              onSubmit={form.handleSubmit((v) => addItem.mutate(v))}
              noValidate
            >
              <h3 className="text-sm font-semibold">Add item</h3>
              <select className="select-field" {...form.register("itemType")}>
                <option value="rental_unit">Rental unit</option>
                <option value="retail">Retail</option>
                <option value="special">Special</option>
              </select>
              {itemType === "rental_unit" ? (
                <select
                  className="select-field"
                  {...form.register("inventoryUnitId")}
                >
                  <option value="">Select unit</option>
                  {(units.data?.items ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.barcodeSku} · {u.size} · {formatInr(u.rentalPrice)}
                    </option>
                  ))}
                </select>
              ) : null}
              {itemType === "retail" ? (
                <select className="select-field" {...form.register("retailSkuId")}>
                  <option value="">Select retail SKU</option>
                  {(retail.data?.items ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.sku} · qty {s.qtyOnHand} · {formatInr(s.sellPrice)}
                    </option>
                  ))}
                </select>
              ) : null}
              <Input
                type="number"
                step="0.01"
                placeholder="Override price (optional)"
                {...form.register("unitPrice")}
              />
              <FieldError message={form.formState.errors.unitPrice?.message} />
              <Button type="submit" size="sm" disabled={addItem.isPending}>
                Add line
              </Button>
            </form>
          ) : null}
        </section>

        <div className="space-y-4">
          {allowFinance ? (
            <>
          <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">GST invoices</h2>
              <Button
                type="button"
                size="sm"
                disabled={createInvoice.isPending}
                onClick={() => createInvoice.mutate()}
              >
                Generate
              </Button>
            </div>
            <ul className="mt-2 divide-y divide-[#f3f4f6] text-sm">
              {(invoices.data ?? []).map((inv) => (
                <li key={inv.id} className="py-2">
                  <p className="font-mono font-semibold">{inv.invoiceNumber}</p>
                  <p className="text-xs text-[#6b7280]">
                    CGST {formatInr(inv.cgst)} · SGST {formatInr(inv.sgst)}
                    {moneyNumber(inv.igst) > 0
                      ? ` · IGST ${formatInr(inv.igst)}`
                      : ""}{" "}
                    · Total {formatInr(inv.grandTotal)}
                  </p>
                  <button
                    type="button"
                    className="mt-1 text-xs font-medium text-[#0b1f33] hover:underline"
                    onClick={() => {
                      const w = window.open("", "_blank");
                      if (!w) return;
                      w.document.write(`<!doctype html><html><head><title>${inv.invoiceNumber}</title>
<style>body{font-family:Segoe UI,sans-serif;padding:24px;color:#111}h1{font-size:18px}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{border-bottom:1px solid #e5e7eb;padding:8px;text-align:left;font-size:13px}</style>
</head><body>
<h1>Tax Invoice · ${inv.invoiceNumber}</h1>
<p>${data.customer?.fullName ?? ""} · ${data.orderNumber}</p>
<p>GSTIN: ${inv.gstin ?? tenant.data?.gstin ?? "—"}</p>
<table><tr><th>CGST</th><td>${formatInr(inv.cgst)}</td></tr>
<tr><th>SGST</th><td>${formatInr(inv.sgst)}</td></tr>
<tr><th>IGST</th><td>${formatInr(inv.igst)}</td></tr>
<tr><th>Grand total</th><td><strong>${formatInr(inv.grandTotal)}</strong></td></tr></table>
<script>window.print()</script></body></html>`);
                      w.document.close();
                    }}
                  >
                    Print
                  </button>
                </li>
              ))}
              {!invoices.data?.length ? (
                <li className="py-3 text-[#6b7280]">No invoices yet</li>
              ) : null}
            </ul>
          </section>

          <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
            <h2 className="text-sm font-semibold">Fees &amp; layaway</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={lateAuto.isPending}
                onClick={() => lateAuto.mutate()}
              >
                Auto late fee
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <select
                className="select-field h-8 w-28 text-xs"
                value={feeType}
                onChange={(e) =>
                  setFeeType(e.target.value as "late" | "damage" | "other")
                }
              >
                <option value="late">Late</option>
                <option value="damage">Damage</option>
                <option value="other">Other</option>
              </select>
              <Input
                className="h-8 w-24"
                type="number"
                placeholder="₹"
                value={feeAmt}
                onChange={(e) => setFeeAmt(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                disabled={!feeAmt || addFee.isPending}
                onClick={() => addFee.mutate()}
              >
                Add fee
              </Button>
            </div>
            <ul className="mt-2 text-sm">
              {(fees.data ?? []).map((f) => (
                <li key={f.id} className="flex justify-between py-1">
                  <span className="text-[#6b7280]">
                    {f.feeType}
                    {f.reason ? ` · ${f.reason}` : ""}
                  </span>
                  <span className="font-medium">{formatInr(f.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t border-[#e5e7eb] pt-3">
              <p className="text-xs font-medium text-[#9ca3af] uppercase">
                Layaway
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Input
                  className="h-8 w-36"
                  type="date"
                  value={layDue}
                  onChange={(e) => setLayDue(e.target.value)}
                />
                <Input
                  className="h-8 w-24"
                  type="number"
                  placeholder="₹"
                  value={layAmt}
                  onChange={(e) => setLayAmt(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!layDue || !layAmt || addLayaway.isPending}
                  onClick={() => addLayaway.mutate()}
                >
                  Add
                </Button>
              </div>
              <ul className="mt-2 text-sm">
                {(layaway.data ?? []).map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between gap-2 py-1"
                  >
                    <span className="text-[#6b7280]">
                      {formatDate(l.dueBy)} · {formatInr(l.installmentAmount)} ·{" "}
                      {l.status}
                    </span>
                    {l.status === "pending" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => markLay.mutate(l.id)}
                      >
                        Paid
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </section>
            </>
          ) : null}

          <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Rental agreement</h2>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={createAgreement.isPending}
                onClick={() => createAgreement.mutate()}
              >
                Create
              </Button>
            </div>
            <ul className="mt-2 text-sm">
              {(docs.data ?? []).map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-2 py-1.5"
                >
                  <span>
                    {d.docType}
                    {d.customerAcknowledged ? " · signed" : " · pending"}
                  </span>
                  {!d.customerAcknowledged ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => ackDoc.mutate(d.id)}
                    >
                      Acknowledge
                    </Button>
                  ) : null}
                </li>
              ))}
              {!docs.data?.length ? (
                <li className="py-2 text-[#6b7280]">No documents</li>
              ) : null}
            </ul>
          </section>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-4">
        <h2 className="text-sm font-semibold">Payments</h2>
        <table className="mt-2 w-full text-left text-sm">
          <thead className="text-[0.65rem] tracking-wide text-[#9ca3af] uppercase">
            <tr>
              <th className="pb-2">Amount</th>
              <th className="pb-2">Method</th>
              <th className="pb-2">Type</th>
              <th className="pb-2">Status</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f3f4f6]">
            {(data.payments ?? []).map((p) => (
              <tr key={p.id}>
                <td className="py-2.5">{formatInr(p.amount)}</td>
                <td className="py-2.5">{p.method}</td>
                <td className="py-2.5">{p.type}</td>
                <td className="py-2.5">{p.status}</td>
                <td className="py-2.5 text-right">
                  {allowRefund &&
                  data.kind !== "sale" &&
                  p.status === "succeeded" &&
                  (p.type === "payment" || p.type === "deposit") ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      disabled={refundMut.isPending}
                      onClick={() =>
                        refundMut.mutate({
                          id: p.id,
                          amount: moneyNumber(p.amount),
                        })
                      }
                    >
                      Refund
                    </Button>
                  ) : allowRefund &&
                    data.kind === "sale" &&
                    data.status === "closed" &&
                    p.status === "succeeded" &&
                    (p.type === "payment" || p.type === "deposit") ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setSaleReturnOpen(true)}
                    >
                      Sale return
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.payments?.length ? (
          <p className="py-4 text-sm text-[#6b7280]">No payments</p>
        ) : null}
      </section>

      {receiptOpen ? (
        <ReceiptModal
          data={(receiptQ.data as ReceiptData | undefined) ?? null}
          loading={receiptQ.isLoading}
          change={receiptQ.data?.change}
          cashTendered={receiptQ.data?.cashTendered}
          onClose={() => setReceiptOpen(false)}
        />
      ) : null}

      {saleReturnOpen ? (
        <SaleReturnDialog
          orderId={data.id}
          orderNumber={data.orderNumber}
          onClose={() => setSaleReturnOpen(false)}
        />
      ) : null}
    </div>
  );
}
