"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { posApi, suppliersApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";

export default function SuppliersPage() {
  const qc = useQueryClient();
  const { hasSale } = useBootstrap();
  const isRentalOnly = false;
  const [lineSkuId, setLineSkuId] = useState("");
  const [lineQty, setLineQty] = useState("10");
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    contact: "",
    phone: "",
  });

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
    queryFn: () => posApi.saleCatalog({ limit: 200 }),
    enabled: hasSale,
  });

  const skuOptions = useMemo(
    () => catalog.data?.items ?? [],
    [catalog.data],
  );

  const supplierForm = useForm({
    defaultValues: { name: "", contact: "", phone: "" },
  });
  const poForm = useForm({
    defaultValues: {
      supplierId: "",
      poType: "purchase",
      expectedDelivery: "",
    },
  });

  const createSupplier = useMutation({
    mutationFn: (v: { name: string; contact: string; phone: string }) =>
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
      const qty = Math.max(1, Number(lineQty) || 1);
      return suppliersApi.createPo({
        supplierId: v.supplierId,
        poType: v.poType,
        expectedDelivery: v.expectedDelivery || undefined,
        ...(lineSkuId
          ? { lines: [{ stockLevelId: lineSkuId, qtyOrdered: qty }] }
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
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
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
    }) => suppliersApi.returnPo(id, { lines, reason }),
    onSuccess: (res) => {
      const n = res.returned.reduce((s, r) => s + r.qtyReturned, 0);
      toast.success(`Returned ${n} units to supplier`);
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-catalog"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-catalog-for-po"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Return failed",
      ),
  });

  const updateSupplier = useMutation({
    mutationFn: () =>
      suppliersApi.update(editId!, {
        name: editForm.name.trim() || undefined,
        contact: editForm.contact.trim() || undefined,
        phone: editForm.phone.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Supplier updated");
      setEditId(null);
      void qc.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
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
          >
            <Input
              placeholder="Name"
              {...supplierForm.register("name", { required: true })}
            />
            <Input placeholder="Contact" {...supplierForm.register("contact")} />
            <Input placeholder="Phone" {...supplierForm.register("phone")} />
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
                    onChange={(e) => setLineSkuId(e.target.value)}
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
                  <div className="field-shell">
                    <Label>Qty ordered</Label>
                    <Input
                      type="number"
                      min={1}
                      value={lineQty}
                      onChange={(e) => setLineQty(e.target.value)}
                    />
                  </div>
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
