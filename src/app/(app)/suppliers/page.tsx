"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { X } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { loyaltyApi, posApi, suppliersApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatDate, moneyNumber, newIdempotencyKey } from "@/lib/utils";
import { TablePager } from "@/components/table-pager";
import { SupplierMasterPanel } from "./supplier-master-panel";

export default function SuppliersPage() {
  const qc = useQueryClient();
  const { hasSale, money, data: boot } = useBootstrap();
  const isRentalOnly = false;
  const [poLines, setPoLines] = useState<
    Array<{ skuId: string; qty: string; cost: string }>
  >([{ skuId: "", qty: "10", cost: "" }]);
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

  const poForm = useForm({
    defaultValues: {
      supplierId: "",
      poType: "purchase",
      expectedDelivery: "",
    },
  });
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
      toast.success("PO created");
      poForm.reset({
        supplierId: "",
        poType: "purchase",
        expectedDelivery: "",
      });
      setPoLines([{ skuId: "", qty: "10", cost: "" }]);
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

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <p className="eyebrow">Shop setup</p>
        <h1 className="display mt-1 text-3xl text-[#0b1f33]">
          Suppliers &amp; procurement
        </h1>
        <p className="mt-1 text-sm text-[#5a6b7d]">
          Universal supplier master plus purchase orders. Same engine for any
          catalog — not a grocery- or restaurant-only pack.{" "}
          <Link href="/purchases" className="font-medium text-[#1a56db]">
            AP / GRN / invoices
          </Link>
        </p>
      </header>

      <SupplierMasterPanel />

      <div className="grid gap-5 lg:grid-cols-2">
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
                {poSuppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code ? `${s.code} · ` : ""}
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
                {poLines.map((line, idx) => (
                  <div
                    key={idx}
                    className="space-y-2 rounded-xl border border-[#eef2f8] p-2"
                  >
                    <div className="field-shell">
                      <Label>Line {idx + 1} · Item</Label>
                      <Select
                        value={line.skuId}
                        onChange={(e) => applyLineProduct(idx, e.target.value)}
                      >
                        <option value="">Optional — pick later on receive</option>
                        {skuOptions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} · {s.sku} (on hand {s.qtyOnHand})
                          </option>
                        ))}
                      </Select>
                    </div>
                    {line.skuId ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="field-shell">
                          <Label>Qty</Label>
                          <Input
                            type="number"
                            min={1}
                            value={line.qty}
                            onChange={(e) =>
                              setPoLines((rows) =>
                                rows.map((r, i) =>
                                  i === idx ? { ...r, qty: e.target.value } : r,
                                ),
                              )
                            }
                          />
                        </div>
                        <div className="field-shell">
                          <Label>Unit cost</Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.cost}
                            onChange={(e) =>
                              setPoLines((rows) =>
                                rows.map((r, i) =>
                                  i === idx ? { ...r, cost: e.target.value } : r,
                                ),
                              )
                            }
                          />
                        </div>
                      </div>
                    ) : null}
                    {poLines.length > 1 ? (
                      <button
                        type="button"
                        className="text-xs text-[#b91c1c]"
                        onClick={() =>
                          setPoLines((rows) => rows.filter((_, i) => i !== idx))
                        }
                      >
                        Remove line
                      </button>
                    ) : null}
                  </div>
                ))}
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
                  Add line
                </Button>
                {poLines.some((l) => l.skuId) ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="field-shell">
                        <Label>Tax %</Label>
                        <Input
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
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#e8edf4] bg-[#f8fafc] px-3 py-2 text-xs text-[#0b1f33]">
                      <div className="flex justify-between gap-2">
                        <span className="text-[#5a6b7d]">Subtotal</span>
                        <span className="tabular-nums">{money(poTotals.subtotal)}</span>
                      </div>
                      {poTotals.discount > 0 ? (
                        <div className="mt-1 flex justify-between gap-2">
                          <span className="text-[#5a6b7d]">Discount</span>
                          <span className="tabular-nums">−{money(poTotals.discount)}</span>
                        </div>
                      ) : null}
                      <div className="mt-1 flex justify-between gap-2">
                        <span className="text-[#5a6b7d]">Tax ({poTotals.taxPct}%)</span>
                        <span className="tabular-nums">{money(poTotals.tax)}</span>
                      </div>
                      <div className="mt-1 flex justify-between gap-2 border-t border-[#e8edf4] pt-1 font-semibold">
                        <span>Order total</span>
                        <span className="tabular-nums">{money(poTotals.grand)}</span>
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
          {(pos.data ?? [])
            .slice((poPage - 1) * PO_PAGE, poPage * PO_PAGE)
            .map((po) => {
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
        <TablePager
          page={poPage}
          totalPages={Math.max(1, Math.ceil((pos.data?.length ?? 0) / PO_PAGE))}
          total={pos.data?.length ?? 0}
          pageSize={PO_PAGE}
          onPage={setPoPage}
        />
      </section>
    </div>
  );
}
