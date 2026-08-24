"use client";

import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { ChevronDown, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { loyaltyApi, posApi, suppliersApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn, formatDate, moneyNumber, newIdempotencyKey } from "@/lib/utils";
import { TablePager } from "@/components/table-pager";
import { PageHeader, EmptyState } from "@/components/page-header";
import { ModalFrame } from "@/components/modal-frame";

const PO_STATUS: Record<string, string> = {
  draft: "bg-[#f8fafc] text-[#475569] ring-[#e2e8f0]",
  ordered: "bg-[#eff6ff] text-[#1e40af] ring-[#bfdbfe]",
  partial: "bg-[#fff7ed] text-[#9a3412] ring-[#fed7aa]",
  received: "bg-[#ecfdf3] text-[#166534] ring-[#bbf7d0]",
  cancelled: "bg-[#f8fafc] text-[#64748b] ring-[#e2e8f0]",
};

function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[0.68rem] font-semibold capitalize ring-1",
        PO_STATUS[value] ?? PO_STATUS.draft,
      )}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}

export default function SupplierPurchaseOrdersPage() {
  const qc = useQueryClient();
  const { hasSale, money, data: boot } = useBootstrap();
  const isRentalOnly = false;
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [poLines, setPoLines] = useState<
    Array<{ skuId: string; qty: string; cost: string }>
  >([{ skuId: "", qty: "1", cost: "" }]);
  const [lineTaxPercent, setLineTaxPercent] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState<string | null>(null);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [poPage, setPoPage] = useState(1);
  const PO_PAGE = 8;

  const defaultTaxPercent = useMemo(() => {
    const settings = boot?.tenant?.settings as
      | { tax?: { ratePercent?: number | string } }
      | undefined;
    const mode = boot?.tenant?.taxMode ?? "in_gst";
    if (mode === "none") return 0;
    const raw = settings?.tax?.ratePercent;
    const parsed =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && raw.trim()
          ? Number(raw.replace(/%/g, "").trim())
          : NaN;
    if (Number.isFinite(parsed)) return Math.min(40, Math.max(0, parsed));
    return mode === "vat" ? 20 : 5;
  }, [boot?.tenant]);

  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => suppliersApi.list(),
    enabled: !isRentalOnly,
  });
  const pos = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: () => suppliersApi.listPos(),
    enabled: !isRentalOnly,
  });
  const catalog = useQuery({
    queryKey: ["pos-sale-catalog-for-po"],
    queryFn: () => posApi.saleCatalog({ limit: 200, forPurchase: true }),
    enabled: hasSale,
  });

  const skuOptions = useMemo(
    () => catalog.data?.items ?? [],
    [catalog.data],
  );

  const poTotals = useMemo(() => {
    let subtotal = 0;
    for (const line of poLines) {
      if (!line.skuId) continue;
      const qty = Math.max(1, Number(line.qty) || 1);
      const unit = Math.max(0, moneyNumber(line.cost || 0));
      subtotal += Math.round(unit * qty * 100) / 100;
    }
    subtotal = Math.round(subtotal * 100) / 100;
    const taxPct = Math.min(
      40,
      Math.max(0, moneyNumber(lineTaxPercent || 0)),
    );
    const discountEntered = Math.max(0, moneyNumber(discountAmount || 0));
    const discount = Math.min(discountEntered, subtotal);
    const taxable = Math.max(0, subtotal - discount);
    const tax = Math.round(taxable * (taxPct / 100) * 100) / 100;
    const grand = Math.round((taxable + tax) * 100) / 100;
    return { taxPct, subtotal, discount, tax, grand };
  }, [poLines, lineTaxPercent, discountAmount]);

  function clearCouponAndDiscount() {
    setCouponCode("");
    setCouponApplied(null);
    setDiscountAmount("");
  }

  const poForm = useForm({
    defaultValues: {
      supplierId: "",
      poType: "purchase",
      expectedDelivery: "",
    },
  });

  function resetCreateForm() {
    poForm.reset({
      supplierId: "",
      poType: "purchase",
      expectedDelivery: "",
    });
    setPoLines([{ skuId: "", qty: "1", cost: "" }]);
    setLineTaxPercent(String(defaultTaxPercent));
    clearCouponAndDiscount();
  }

  function openCreate() {
    resetCreateForm();
    setCreateOpen(true);
  }

  function applyLineProduct(index: number, id: string) {
    setPoLines((rows) => {
      const next = [...rows];
      const cur = { ...next[index]! };
      cur.skuId = id;
      if (!id) {
        cur.cost = "";
        next[index] = cur;
        return next;
      }
      const row = skuOptions.find((s) => s.id === id);
      if (row) {
        const cost =
          row.costPrice != null && Number.isFinite(Number(row.costPrice))
            ? Number(row.costPrice)
            : moneyNumber(row.sellPrice);
        cur.cost = String(cost);
        const rate =
          row.taxRatePercent != null && Number.isFinite(row.taxRatePercent)
            ? row.taxRatePercent
            : defaultTaxPercent;
        setLineTaxPercent(String(rate));
      }
      next[index] = cur;
      return next;
    });
    clearCouponAndDiscount();
  }

  const poSuppliers = useMemo(
    () =>
      (suppliers.data ?? []).filter(
        (s) => (s.status ?? "active") === "active",
      ),
    [suppliers.data],
  );

  const createPo = useMutation({
    mutationFn: (v: {
      supplierId: string;
      poType: string;
      expectedDelivery: string;
    }) => {
      const filled = poLines.filter((l) => l.skuId);
      for (const line of filled) {
        const qty = Number(line.qty);
        const unitCost = Number(line.cost);
        if (!(qty > 0) || !Number.isFinite(qty)) {
          toast.error("Each line qty must be greater than 0");
          throw new Error("invalid qty");
        }
        if (!Number.isFinite(unitCost) || unitCost < 0) {
          toast.error("Unit cost cannot be negative");
          throw new Error("invalid cost");
        }
      }
      const { taxPct, subtotal, discount, tax, grand } = poTotals;
      const noteParts: string[] = [];
      if (filled.length) {
        noteParts.push(
          `Subtotal ${subtotal.toFixed(2)} · Discount ${discount.toFixed(2)} · Tax ${taxPct}% = ${tax.toFixed(2)} · Total ${grand.toFixed(2)}`,
        );
      }
      if (couponApplied) noteParts.push(`Coupon ${couponApplied}`);
      return suppliersApi.createPo({
        supplierId: v.supplierId,
        poType: v.poType,
        expectedDelivery: v.expectedDelivery || undefined,
        notes: noteParts.length ? noteParts.join(" · ") : undefined,
        ...(filled.length
          ? {
              lines: filled.map((l) => ({
                stockLevelId: l.skuId,
                qtyOrdered: Math.max(1, Number(l.qty) || 1),
                ...(Number(l.cost) > 0 ? { unitCost: Number(l.cost) } : {}),
              })),
            }
          : {}),
      });
    },
    onSuccess: () => {
      toast.success("Purchase order created");
      resetCreateForm();
      setCreateOpen(false);
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        toast.error(e.messages.join(", "));
      } else if (!(e instanceof Error)) {
        toast.error("Create PO failed");
      }
    },
  });

  const updatePo = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      suppliersApi.updatePo(id, { status }),
    onSuccess: () => {
      toast.success("PO updated");
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const receivePo = useMutation({
    mutationFn: ({
      id,
      lines,
    }: {
      id: string;
      lines: Array<{ stockLevelId: string; qty: number }>;
    }) => suppliersApi.receivePo(id, { lines }),
    onSuccess: (res) => {
      const added = res.received.reduce((s, r) => s + r.qtyAdded, 0);
      toast.success(`Received ${added} units onto shelf`);
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-catalog"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-catalog-for-po"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-products"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Receive failed"),
  });

  const returnPo = useMutation({
    mutationFn: ({
      id,
      lines,
      reason,
    }: {
      id: string;
      lines: Array<{ stockLevelId: string; qty: number }>;
      reason?: string;
    }) =>
      suppliersApi.returnPo(id, {
        lines,
        reason,
        reasonCode: "supplier_damaged",
        createCreditNote: true,
        idempotencyKey: newIdempotencyKey("rtv"),
      }),
    onSuccess: (res) => {
      const n = res.returned.reduce((s, r) => s + r.qtyReturned, 0);
      const credit = res.creditNote
        ? ` · SCN ${res.creditNote.invoiceNumber}`
        : "";
      toast.success(`Returned ${n} units to supplier${credit}`);
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-catalog"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-catalog-for-po"] });
      void qc.invalidateQueries({ queryKey: ["supplier-invoices"] });
      void qc.invalidateQueries({ queryKey: ["supplier-invoices-outstanding"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Return failed",
      ),
  });

  const list = pos.data ?? [];
  const pageRows = list.slice((poPage - 1) * PO_PAGE, poPage * PO_PAGE);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        eyebrow="Purchases"
        title="Purchase orders"
        subtitle="Create a PO, receive to shelf, then return to vendor if needed."
        action={
          <Button type="button" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New purchase order
          </Button>
        }
      />
      <p className="-mt-2 text-sm text-[#5a6b7d]">
        <Link
          href="/suppliers"
          className="font-semibold text-[#1a56db] hover:underline"
        >
          Supplier directory
        </Link>
        {" · "}
        <Link
          href="/purchases"
          className="font-semibold text-[#1a56db] hover:underline"
        >
          GRN &amp; invoices
        </Link>
      </p>

      {!list.length ? (
        <EmptyState
          title="No purchase orders"
          detail="Create a PO for a supplier, then receive goods to update stock."
          action={
            <Button type="button" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New purchase order
            </Button>
          }
        />
      ) : (
        <section className="overflow-hidden rounded-xl border border-[#d9e0ea] bg-white">
          <div className="flex items-center justify-between border-b border-[#eef1f4] px-4 py-2.5">
            <p className="text-xs text-[#5a6b7d]">
              Receive adds stock. Status change alone does not.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-[#eef1f4] bg-[#f7f9fc] text-[0.7rem] font-semibold uppercase tracking-wide text-[#5a6b7d]">
                <tr>
                  <th className="px-4 py-2.5">Supplier</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Due</th>
                  <th className="px-3 py-2.5">Items</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((po) => {
                  const openLines =
                    po.lines?.filter((l) => l.qtyReceived < l.qtyOrdered) ??
                    po.lines ??
                    [];
                  const canReceive =
                    po.status !== "cancelled" && po.status !== "received";
                  const open = expandedId === po.id;
                  const itemCount = po.lines?.length ?? 0;
                  return (
                    <Fragment key={po.id}>
                      <tr className="border-b border-[#eef1f4] last:border-0">
                        <td className="px-4 py-3">
                          <p className="font-medium text-[#0b1f33]">
                            {po.supplier?.name ?? "—"}
                          </p>
                          {itemCount ? (
                            <p className="mt-0.5 max-w-xs truncate text-xs text-[#8b9bb0]">
                              {po.lines!
                                .map(
                                  (l) =>
                                    l.stockLevel?.product?.name ??
                                    l.stockLevel?.sku ??
                                    "SKU",
                                )
                                .join(", ")}
                            </p>
                          ) : (
                            <p className="mt-0.5 text-xs text-[#8b9bb0]">
                              Lines can be added on receive
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 capitalize text-[#5a6b7d]">
                          {po.poType.replaceAll("_", " ")}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge value={po.status} />
                        </td>
                        <td className="px-3 py-3 text-[#5a6b7d]">
                          {po.expectedDelivery
                            ? formatDate(po.expectedDelivery)
                            : "—"}
                        </td>
                        <td className="px-3 py-3 tabular-nums text-[#5a6b7d]">
                          {itemCount}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            {po.status !== "ordered" &&
                            po.status !== "cancelled" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={updatePo.isPending}
                                onClick={() =>
                                  updatePo.mutate({ id: po.id, status: "ordered" })
                                }
                              >
                                Mark ordered
                              </Button>
                            ) : null}
                            {po.status !== "cancelled" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={updatePo.isPending}
                                onClick={() =>
                                  updatePo.mutate({
                                    id: po.id,
                                    status: "cancelled",
                                  })
                                }
                              >
                                Cancel
                              </Button>
                            ) : null}
                            {canReceive ||
                            (po.lines ?? []).some((l) => l.qtyReceived > 0) ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  setExpandedId(open ? null : po.id)
                                }
                              >
                                {open ? "Hide" : "Receive / return"}
                                <ChevronDown
                                  className={cn(
                                    "h-3.5 w-3.5 transition",
                                    open && "rotate-180",
                                  )}
                                />
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {open ? (
                        <tr key={`${po.id}-detail`} className="border-b border-[#eef1f4] bg-[#f8fafc]">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="grid gap-3 lg:grid-cols-2">
                              {canReceive && hasSale ? (
                                <div className="rounded-lg border border-[#d9e0ea] bg-white p-3">
                                  <p className="text-xs font-semibold text-[#0b1f33]">
                                    Receive to shelf
                                  </p>
                                  {(openLines.length
                                    ? openLines
                                    : [
                                        {
                                          stockLevelId: "",
                                          id: "new",
                                        } as const,
                                      ]
                                  ).map((l) => {
                                    const sid =
                                      "stockLevelId" in l && l.stockLevelId
                                        ? l.stockLevelId
                                        : "";
                                    const key = `${po.id}:${sid || "pick"}`;
                                    return (
                                      <div
                                        key={key}
                                        className="mt-2 flex flex-wrap items-end gap-2"
                                      >
                                        {"stockLevel" in l && l.stockLevel ? (
                                          <p className="min-w-[10rem] flex-1 text-xs text-[#334155]">
                                            {l.stockLevel.product?.name} ·{" "}
                                            {l.stockLevel.sku}
                                            <span className="ml-1 text-[#8b9bb0]">
                                              ({l.qtyReceived}/{l.qtyOrdered})
                                            </span>
                                          </p>
                                        ) : (
                                          <div className="min-w-[12rem] flex-1">
                                            <Select
                                              value={receiveQty[`${key}:sku`] ?? ""}
                                              onChange={(e) =>
                                                setReceiveQty((m) => ({
                                                  ...m,
                                                  [`${key}:sku`]: e.target.value,
                                                }))
                                              }
                                            >
                                              <option value="">Select item</option>
                                              {skuOptions.map((s) => (
                                                <option key={s.id} value={s.id}>
                                                  {s.name} · {s.sku}
                                                </option>
                                              ))}
                                            </Select>
                                          </div>
                                        )}
                                        <Input
                                          className="w-24"
                                          type="number"
                                          min={1}
                                          placeholder="Qty"
                                          value={receiveQty[key] ?? ""}
                                          onChange={(e) =>
                                            setReceiveQty((m) => ({
                                              ...m,
                                              [key]: e.target.value,
                                            }))
                                          }
                                        />
                                        <Button
                                          type="button"
                                          size="sm"
                                          disabled={receivePo.isPending}
                                          onClick={() => {
                                            const stockLevelId =
                                              sid || receiveQty[`${key}:sku`] || "";
                                            const qty = Math.max(
                                              1,
                                              Number(receiveQty[key]) || 0,
                                            );
                                            if (!stockLevelId || !qty) {
                                              toast.error("Pick item and qty");
                                              return;
                                            }
                                            receivePo.mutate({
                                              id: po.id,
                                              lines: [{ stockLevelId, qty }],
                                            });
                                          }}
                                        >
                                          Receive
                                        </Button>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : null}

                              {(po.lines ?? []).some((l) => l.qtyReceived > 0) &&
                              hasSale ? (
                                <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] p-3">
                                  <p className="text-xs font-semibold text-[#0b1f33]">
                                    Return to vendor
                                  </p>
                                  {(po.lines ?? [])
                                    .filter((l) => l.qtyReceived > 0)
                                    .map((l) => {
                                      const key = `ret:${po.id}:${l.stockLevelId}`;
                                      return (
                                        <div
                                          key={key}
                                          className="mt-2 flex flex-wrap items-end gap-2"
                                        >
                                          <p className="min-w-[10rem] flex-1 text-xs text-[#334155]">
                                            {l.stockLevel?.product?.name ?? "SKU"}{" "}
                                            · {l.stockLevel?.sku}
                                            <span className="ml-1 text-[#8b9bb0]">
                                              (recv {l.qtyReceived})
                                            </span>
                                          </p>
                                          <Input
                                            className="w-24"
                                            type="number"
                                            min={1}
                                            max={l.qtyReceived}
                                            placeholder="Qty"
                                            value={returnQty[key] ?? ""}
                                            onChange={(e) =>
                                              setReturnQty((m) => ({
                                                ...m,
                                                [key]: e.target.value,
                                              }))
                                            }
                                          />
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            disabled={returnPo.isPending}
                                            onClick={() => {
                                              const qty = Math.max(
                                                1,
                                                Number(returnQty[key]) || 0,
                                              );
                                              if (!l.stockLevelId || !qty) {
                                                toast.error("Enter qty to return");
                                                return;
                                              }
                                              returnPo.mutate({
                                                id: po.id,
                                                lines: [
                                                  {
                                                    stockLevelId: l.stockLevelId,
                                                    qty,
                                                  },
                                                ],
                                                reason: "Supplier return",
                                              });
                                            }}
                                          >
                                            Return
                                          </Button>
                                        </div>
                                      );
                                    })}
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TablePager
            page={poPage}
            totalPages={Math.max(1, Math.ceil(list.length / PO_PAGE))}
            total={list.length}
            pageSize={PO_PAGE}
            onPage={setPoPage}
          />
        </section>
      )}

      {createOpen ? (
        <ModalFrame
          title="New purchase order"
          subtitle="Supplier, delivery date, and line items. Stock updates only when you receive."
          labelledBy="create-po-title"
          className="max-w-3xl"
          onClose={() => setCreateOpen(false)}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-[#5a6b7d]">
                {poLines.some((l) => l.skuId) ? (
                  <span>
                    Total{" "}
                    <span className="font-semibold tabular-nums text-[#0b1f33]">
                      {money(poTotals.grand)}
                    </span>
                  </span>
                ) : (
                  <span>Items optional — you can add them on receive.</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form="create-po-form"
                  disabled={createPo.isPending}
                >
                  {createPo.isPending ? "Saving…" : "Create PO"}
                </Button>
              </div>
            </div>
          }
        >
          <form
            id="create-po-form"
            className="space-y-5"
            onSubmit={poForm.handleSubmit((v) => createPo.mutate(v))}
          >
            <section>
              <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[#8b9bb0]">
                Order details
              </p>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <Label>Supplier</Label>
                  <Select
                    className="mt-1"
                    {...poForm.register("supplierId", { required: true })}
                  >
                    <option value="">Select supplier</option>
                    {poSuppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code ? `${s.code} · ` : ""}
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Type</Label>
                  <Select className="mt-1" {...poForm.register("poType")}>
                    <option value="purchase">Purchase</option>
                    {isRentalOnly ? (
                      <option value="sub_rental">Sub-rental</option>
                    ) : null}
                    <option value="special">Special</option>
                  </Select>
                </div>
                <div>
                  <Label>Expected delivery</Label>
                  <Input
                    className="mt-1"
                    type="date"
                    {...poForm.register("expectedDelivery")}
                  />
                </div>
              </div>
            </section>

            {hasSale ? (
              <section>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[#8b9bb0]">
                    Line items
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setPoLines((rows) => [
                        ...rows,
                        { skuId: "", qty: "1", cost: "" },
                      ])
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add line
                  </Button>
                </div>
                <div className="mt-2 overflow-hidden rounded-lg border border-[#e2e8f0]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#f7f9fc] text-[0.68rem] font-semibold uppercase tracking-wide text-[#5a6b7d]">
                      <tr>
                        <th className="px-3 py-2">Item</th>
                        <th className="w-24 px-2 py-2">Qty</th>
                        <th className="w-32 px-2 py-2">Unit cost</th>
                        <th className="w-28 px-2 py-2 text-right">Amount</th>
                        <th className="w-10 px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eef1f4]">
                      {poLines.map((line, idx) => {
                        const qty = Math.max(0, Number(line.qty) || 0);
                        const unit = Math.max(0, moneyNumber(line.cost || 0));
                        const amount = line.skuId
                          ? Math.round(qty * unit * 100) / 100
                          : 0;
                        return (
                          <tr key={idx}>
                            <td className="px-3 py-2">
                              <Select
                                value={line.skuId}
                                onChange={(e) =>
                                  applyLineProduct(idx, e.target.value)
                                }
                              >
                                <option value="">Select item</option>
                                {skuOptions.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name} · {s.sku} (SOH {s.qtyOnHand})
                                  </option>
                                ))}
                              </Select>
                            </td>
                            <td className="px-2 py-2">
                              <Input
                                type="number"
                                min={1}
                                value={line.qty}
                                disabled={!line.skuId}
                                onChange={(e) =>
                                  setPoLines((rows) =>
                                    rows.map((r, i) =>
                                      i === idx
                                        ? { ...r, qty: e.target.value }
                                        : r,
                                    ),
                                  )
                                }
                              />
                            </td>
                            <td className="px-2 py-2">
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={line.cost}
                                disabled={!line.skuId}
                                onChange={(e) =>
                                  setPoLines((rows) =>
                                    rows.map((r, i) =>
                                      i === idx
                                        ? { ...r, cost: e.target.value }
                                        : r,
                                    ),
                                  )
                                }
                              />
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-[#0b1f33]">
                              {line.skuId ? money(amount) : "—"}
                            </td>
                            <td className="px-2 py-2 text-right">
                              {poLines.length > 1 ? (
                                <button
                                  type="button"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#94a3b8] hover:bg-[#fef2f2] hover:text-[#b91c1c]"
                                  title="Remove line"
                                  onClick={() =>
                                    setPoLines((rows) =>
                                      rows.filter((_, i) => i !== idx),
                                    )
                                  }
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {poLines.some((l) => l.skuId) ? (
                  <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_16rem]">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <Label>Tax %</Label>
                        <Input
                          className="mt-1"
                          type="number"
                          min={0}
                          max={40}
                          step="0.01"
                          value={lineTaxPercent}
                          onChange={(e) => setLineTaxPercent(e.target.value)}
                        />
                        <p className="mt-1 text-[0.65rem] text-[#8b9bb0]">
                          Shop default {defaultTaxPercent}%
                        </p>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <Label>Discount</Label>
                          {couponApplied ||
                          moneyNumber(discountAmount || 0) > 0 ? (
                            <button
                              type="button"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#d9e0ea] text-[#5a6b7d] hover:bg-[#f4f6fa]"
                              title="Clear discount & coupon"
                              onClick={clearCouponAndDiscount}
                            >
                              <X className="h-3 w-3" strokeWidth={2.5} />
                            </button>
                          ) : null}
                        </div>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={discountAmount}
                          onChange={(e) => {
                            setDiscountAmount(e.target.value);
                            setCouponApplied(null);
                          }}
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <Label>Coupon</Label>
                        <div className="mt-1 flex gap-1">
                          <Input
                            className="uppercase"
                            placeholder="CODE"
                            value={couponCode}
                            onChange={(e) => {
                              setCouponCode(e.target.value);
                              setCouponApplied(null);
                            }}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="shrink-0"
                            disabled={
                              !couponCode.trim() || poTotals.subtotal <= 0
                            }
                            onClick={async () => {
                              try {
                                const v = await loyaltyApi.validateCoupon(
                                  couponCode.trim(),
                                  poTotals.subtotal,
                                );
                                setDiscountAmount(String(v.amountOff));
                                setCouponApplied(v.code);
                                toast.success(
                                  `Coupon ${v.code}: −${money(v.amountOff)}`,
                                );
                              } catch (e) {
                                toast.error(
                                  e instanceof ApiError
                                    ? e.messages.join(", ")
                                    : "Invalid coupon",
                                );
                              }
                            }}
                          >
                            Apply
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg border border-[#e8edf4] bg-[#f8fafc] px-3 py-2.5 text-sm text-[#0b1f33]">
                      <div className="flex justify-between gap-2 text-[#5a6b7d]">
                        <span>Subtotal</span>
                        <span className="tabular-nums text-[#0b1f33]">
                          {money(poTotals.subtotal)}
                        </span>
                      </div>
                      {poTotals.discount > 0 ? (
                        <div className="mt-1 flex justify-between gap-2 text-[#5a6b7d]">
                          <span>Discount</span>
                          <span className="tabular-nums text-[#0b1f33]">
                            −{money(poTotals.discount)}
                          </span>
                        </div>
                      ) : null}
                      <div className="mt-1 flex justify-between gap-2 text-[#5a6b7d]">
                        <span>Tax ({poTotals.taxPct}%)</span>
                        <span className="tabular-nums text-[#0b1f33]">
                          {money(poTotals.tax)}
                        </span>
                      </div>
                      <div className="mt-2 flex justify-between gap-2 border-t border-[#e8edf4] pt-2 font-semibold">
                        <span>Order total</span>
                        <span className="tabular-nums">
                          {money(poTotals.grand)}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}
          </form>
        </ModalFrame>
      ) : null}
    </div>
  );
}
