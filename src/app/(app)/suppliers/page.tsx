"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { toast } from "sonner";
import { loyaltyApi, posApi, suppliersApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FieldError } from "@/components/ui/form";
import { formatDate, moneyNumber, newIdempotencyKey } from "@/lib/utils";
import {
  createSupplierSchema,
  type CreateSupplierInput,
  zodMessages,
} from "@/lib/validations";

export default function SuppliersPage() {
  const qc = useQueryClient();
  const { hasSale, money, data: boot } = useBootstrap();
  const isRentalOnly = false;
  const [lineSkuId, setLineSkuId] = useState("");
  const [lineQty, setLineQty] = useState("10");
  const [lineUnitCost, setLineUnitCost] = useState("");
  const [lineTaxPercent, setLineTaxPercent] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState<string | null>(null);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    contact: "",
    phone: "",
  });

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

  const selectedSku = useMemo(
    () => skuOptions.find((s) => s.id === lineSkuId) ?? null,
    [skuOptions, lineSkuId],
  );

  const poTotals = useMemo(() => {
    const qty = Math.max(1, Number(lineQty) || 1);
    const unit = Math.max(0, moneyNumber(lineUnitCost || 0));
    const taxPct = Math.min(
      40,
      Math.max(0, moneyNumber(lineTaxPercent || 0)),
    );
    const subtotal = Math.round(unit * qty * 100) / 100;
    const discountEntered = Math.max(0, moneyNumber(discountAmount || 0));
    const discount = Math.min(discountEntered, subtotal);
    const taxable = Math.max(0, subtotal - discount);
    const tax = Math.round(taxable * (taxPct / 100) * 100) / 100;
    const grand = Math.round((taxable + tax) * 100) / 100;
    return { qty, unit, taxPct, subtotal, discount, tax, grand };
  }, [lineQty, lineUnitCost, lineTaxPercent, discountAmount]);

  function clearCouponAndDiscount() {
    setCouponCode("");
    setCouponApplied(null);
    setDiscountAmount("");
  }

  function applySelectedProduct(id: string) {
    setLineSkuId(id);
    clearCouponAndDiscount();
    if (!id) {
      setLineUnitCost("");
      setLineTaxPercent("");
      return;
    }
    const row = skuOptions.find((s) => s.id === id);
    if (!row) return;
    const cost =
      row.costPrice != null && Number.isFinite(Number(row.costPrice))
        ? Number(row.costPrice)
        : moneyNumber(row.sellPrice);
    setLineUnitCost(String(cost));
    const rate =
      row.taxRatePercent != null && Number.isFinite(row.taxRatePercent)
        ? row.taxRatePercent
        : defaultTaxPercent;
    setLineTaxPercent(String(rate));
  }

  const supplierForm = useForm<CreateSupplierInput>({
    resolver: zodResolver(createSupplierSchema),
    defaultValues: { name: "", contact: "", phone: "" },
  });
  const poForm = useForm({
    defaultValues: {
      supplierId: "",
      poType: "purchase",
      expectedDelivery: "",
    },
  });
  const supplierErrors = supplierForm.formState.errors;

  const createSupplier = useMutation({
    mutationFn: (v: CreateSupplierInput) =>
      suppliersApi.create({
        name: v.name,
        contact: v.contact || undefined,
        phone: v.phone || undefined,
      }),
    onSuccess: () => {
      toast.success("Supplier added");
      supplierForm.reset();
      void qc.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const createPo = useMutation({
    mutationFn: (v: {
      supplierId: string;
      poType: string;
      expectedDelivery: string;
    }) => {
      if (lineSkuId) {
        const qty = Number(lineQty);
        const unitCost = Number(lineUnitCost);
        if (!(qty > 0) || !Number.isFinite(qty)) {
          toast.error("Qty must be greater than 0");
          throw new Error("Qty must be greater than 0");
        }
        if (!Number.isFinite(unitCost) || unitCost < 0) {
          toast.error("Unit cost cannot be negative");
          throw new Error("Unit cost cannot be negative");
        }
      }
      const { qty, unit, taxPct, subtotal, discount, tax, grand } = poTotals;
      const noteParts: string[] = [];
      if (lineSkuId) {
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
        ...(lineSkuId
          ? {
              lines: [
                {
                  stockLevelId: lineSkuId,
                  qtyOrdered: qty,
                  ...(unit > 0 ? { unitCost: unit } : {}),
                },
              ],
            }
          : {}),
      });
    },
    onSuccess: () => {
      toast.success("PO created");
      poForm.reset({
        supplierId: "",
        poType: "purchase",
        expectedDelivery: "",
      });
      setLineSkuId("");
      setLineQty("10");
      setLineUnitCost("");
      setLineTaxPercent("");
      clearCouponAndDiscount();
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

  const updateSupplier = useMutation({
    mutationFn: () => {
      const parsed = createSupplierSchema.safeParse(editForm);
      if (!parsed.success) {
        toast.error(zodMessages(parsed.error).join(", "));
        throw new Error(zodMessages(parsed.error)[0] ?? "Invalid supplier");
      }
      return suppliersApi.update(editId!, {
        name: parsed.data.name,
        contact: parsed.data.contact || undefined,
        phone: parsed.data.phone || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Supplier updated");
      setEditId(null);
      void qc.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e) => {
      if (e instanceof ApiError) toast.error(e.messages.join(", "));
    },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <p className="eyebrow">Shop setup</p>
        <h1 className="display mt-1 text-3xl text-[#0b1f33]">
          Suppliers &amp; POs
        </h1>
        <p className="mt-1 text-sm text-[#5a6b7d]">
          Create a purchase order, then receive quantity onto the shelf — works
          for any product catalog.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#d9e0ea] bg-white p-4">
          <h2 className="text-sm font-semibold">Suppliers</h2>
          <ul className="mt-2 max-h-48 divide-y divide-[#eef2f8] overflow-y-auto text-sm">
            {(suppliers.data ?? []).map((s) => (
              <li
                key={s.id}
                className="flex items-start justify-between gap-2 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-[#5a6b7d]">
                    {[s.contact, s.phone].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditId(s.id);
                    setEditForm({
                      name: s.name,
                      contact: s.contact ?? "",
                      phone: s.phone ?? "",
                    });
                  }}
                >
                  Edit
                </Button>
              </li>
            ))}
          </ul>
          {editId ? (
            <div className="mt-3 space-y-2 rounded-xl border border-[#e8edf4] bg-[#f8fafc] p-3">
              <p className="text-xs font-semibold text-[#0b1f33]">Edit supplier</p>
              <Input
                placeholder="Name"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, name: e.target.value }))
                }
              />
              <Input
                placeholder="Contact"
                value={editForm.contact}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, contact: e.target.value }))
                }
              />
              <Input
                placeholder="Phone"
                value={editForm.phone}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, phone: e.target.value }))
                }
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={updateSupplier.isPending}
                  onClick={() => updateSupplier.mutate()}
                >
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditId(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
          <form
            className="mt-3 space-y-2 border-t border-[#d9e0ea] pt-3"
            onSubmit={supplierForm.handleSubmit((v) =>
              createSupplier.mutate(v),
            )}
            noValidate
          >
            <div>
              <Input placeholder="Name" {...supplierForm.register("name")} />
              <FieldError message={supplierErrors.name?.message} />
            </div>
            <Input placeholder="Contact" {...supplierForm.register("contact")} />
            <div>
              <Input placeholder="Phone" {...supplierForm.register("phone")} />
              <FieldError message={supplierErrors.phone?.message} />
            </div>
            <Button type="submit" size="sm" disabled={createSupplier.isPending}>
              Add supplier
            </Button>
          </form>
        </section>

        <section className="rounded-2xl border border-[#d9e0ea] bg-white p-4">
          <h2 className="text-sm font-semibold">New purchase order</h2>
          <form
            className="mt-3 space-y-2"
            onSubmit={poForm.handleSubmit((v) => createPo.mutate(v))}
          >
            <div className="field-shell">
              <Label>Supplier</Label>
              <Select
                {...poForm.register("supplierId", { required: true })}
              >
                <option value="">Select</option>
                {(suppliers.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="field-shell">
              <Label>Type</Label>
              <Select {...poForm.register("poType")}>
                <option value="purchase">Purchase</option>
                {isRentalOnly ? (
                  <option value="sub_rental">Sub-rental</option>
                ) : null}
                <option value="special">Special</option>
              </Select>
            </div>
            {hasSale ? (
              <>
                <div className="field-shell">
                  <Label>Product to order (SKU)</Label>
                  <Select
                    value={lineSkuId}
                    onChange={(e) => applySelectedProduct(e.target.value)}
                  >
                    <option value="">Optional — pick later on receive</option>
                    {skuOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {s.sku} (on hand {s.qtyOnHand})
                      </option>
                    ))}
                  </Select>
                </div>
                {lineSkuId ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="field-shell">
                        <Label>Qty ordered</Label>
                        <Input
                          type="number"
                          min={1}
                          value={lineQty}
                          onChange={(e) => setLineQty(e.target.value)}
                        />
                      </div>
                      <div className="field-shell">
                        <Label>Unit cost</Label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          value={lineUnitCost}
                          onChange={(e) => setLineUnitCost(e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="field-shell">
                        <Label>Tax %</Label>
                        <Input
                          type="number"
                          min={0}
                          max={40}
                          step="0.01"
                          inputMode="decimal"
                          value={lineTaxPercent}
                          onChange={(e) => setLineTaxPercent(e.target.value)}
                        />
                        <p className="mt-1 text-[0.65rem] text-[#8b9bb0]">
                          {selectedSku?.taxRatePercent != null
                            ? `From item tax (${selectedSku.taxRatePercent}%)`
                            : `Shop default (${defaultTaxPercent}%)`}
                        </p>
                      </div>
                      <div className="field-shell">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <Label>Discount</Label>
                          {couponApplied || moneyNumber(discountAmount || 0) > 0 ? (
                            <button
                              type="button"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#d9e0ea] text-[#5a6b7d] hover:bg-[#f4f6fa] hover:text-[#0b1f33]"
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
                          inputMode="decimal"
                          value={discountAmount}
                          onChange={(e) => {
                            setDiscountAmount(e.target.value);
                            setCouponApplied(null);
                          }}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className="field-shell">
                      <Label>Coupon code</Label>
                      <div className="flex gap-1">
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
                          disabled={!couponCode.trim() || poTotals.subtotal <= 0}
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
                        {couponApplied ? (
                          <button
                            type="button"
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#d9e0ea] text-[#5a6b7d] hover:bg-[#f4f6fa] hover:text-[#0b1f33]"
                            title="Clear coupon & discount"
                            onClick={clearCouponAndDiscount}
                          >
                            <X className="h-4 w-4" strokeWidth={2.5} />
                          </button>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[0.65rem] text-[#8b9bb0]">
                        {couponApplied
                          ? `Applied ${couponApplied}`
                          : "Optional — from Coupons setup"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#e8edf4] bg-[#f8fafc] px-3 py-2 text-xs text-[#0b1f33]">
                      <div className="flex justify-between gap-2">
                        <span className="text-[#5a6b7d]">Subtotal</span>
                        <span className="tabular-nums">
                          {money(poTotals.subtotal)}
                        </span>
                      </div>
                      {poTotals.discount > 0 ? (
                        <div className="mt-1 flex justify-between gap-2">
                          <span className="text-[#5a6b7d]">Discount</span>
                          <span className="tabular-nums">
                            −{money(poTotals.discount)}
                          </span>
                        </div>
                      ) : null}
                      <div className="mt-1 flex justify-between gap-2">
                        <span className="text-[#5a6b7d]">
                          Tax ({poTotals.taxPct}%)
                        </span>
                        <span className="tabular-nums">
                          {money(poTotals.tax)}
                        </span>
                      </div>
                      <div className="mt-1 flex justify-between gap-2 border-t border-[#e8edf4] pt-1 font-semibold">
                        <span>Order total</span>
                        <span className="tabular-nums">
                          {money(poTotals.grand)}
                        </span>
                      </div>
                    </div>
                  </>
                ) : null}
              </>
            ) : null}
            <div className="field-shell">
              <Label>Expected delivery</Label>
              <Input type="date" {...poForm.register("expectedDelivery")} />
            </div>
            <Button type="submit" size="sm" disabled={createPo.isPending}>
              Create PO
            </Button>
          </form>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[#d9e0ea] bg-white">
        <div className="border-b border-[#d9e0ea] px-4 py-3">
          <h2 className="text-sm font-semibold">Purchase orders</h2>
          <p className="text-xs text-[#5a6b7d]">
            Use <strong>Receive to shelf</strong> — status alone does not add stock.
          </p>
        </div>
        <ul className="divide-y divide-[#eef2f8]">
          {(pos.data ?? []).map((po) => {
            const openLines =
              po.lines?.filter((l) => l.qtyReceived < l.qtyOrdered) ??
              po.lines ??
              [];
            const canReceive =
              po.status !== "cancelled" && po.status !== "received";
            return (
              <li key={po.id} className="space-y-3 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {po.supplier?.name ?? "—"} ·{" "}
                      {po.poType.replaceAll("_", " ")}
                    </p>
                    <p className="text-xs text-[#5a6b7d]">
                      {po.status}
                      {po.expectedDelivery
                        ? ` · due ${formatDate(po.expectedDelivery)}`
                        : ""}
                    </p>
                    {(po.lines ?? []).length ? (
                      <ul className="mt-1 space-y-0.5 text-xs text-[#5a6b7d]">
                        {po.lines!.map((l) => (
                          <li key={l.id}>
                            {l.stockLevel?.product?.name ?? "SKU"} ·{" "}
                            {l.stockLevel?.sku} — ordered {l.qtyOrdered}, received{" "}
                            {l.qtyReceived}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-[#8b9bb0]">
                        No lines yet — receive any SKU below
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {["ordered", "cancelled"].map((s) => (
                      <Button
                        key={s}
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={updatePo.isPending || po.status === s}
                        onClick={() => updatePo.mutate({ id: po.id, status: s })}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>

                {canReceive && hasSale ? (
                  <div className="rounded-xl border border-[#e8edf4] bg-[#f8fafc] p-3">
                    <p className="text-xs font-semibold text-[#0b1f33]">
                      Receive to shelf
                    </p>
                    {(openLines.length ? openLines : [{ stockLevelId: "", id: "new" } as const]).map(
                      (l) => {
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
                              <p className="min-w-[10rem] flex-1 text-xs">
                                {l.stockLevel.product?.name} · {l.stockLevel.sku}
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
                                  <option value="">Select SKU</option>
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
                                  toast.error("Pick SKU and qty");
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
                      },
                    )}
                  </div>
                ) : null}

                {(po.lines ?? []).some((l) => l.qtyReceived > 0) && hasSale ? (
                  <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3">
                    <p className="text-xs font-semibold text-[#0b1f33]">
                      Purchase return (RTV)
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
                            <p className="min-w-[10rem] flex-1 text-xs">
                              {l.stockLevel?.product?.name ?? "SKU"} ·{" "}
                              {l.stockLevel?.sku} (recv {l.qtyReceived})
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
                                    { stockLevelId: l.stockLevelId, qty },
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
              </li>
            );
          })}
          {!pos.data?.length ? (
            <li className="px-4 py-8 text-sm text-[#5a6b7d]">No POs yet</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
