"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, X, Search, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/form";
import { catalogApi, posApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { formatQtyWithUnit } from "@/lib/sell-units";
import { cn } from "@/lib/utils";

const DEFAULT_REASONS = [
  "Count correction",
  "Damaged goods",
  "Stolen / Lost stock",
  "Found stock",
  "Stock revaluation",
  "Write-off",
  "Expired items",
  "Supplier return",
];

export type FormLine = {
  productId: string;
  name: string;
  sku: string;
  currentQty: number;
  adjustmentQty: number;
  newQty: number;
  unit: string;
  currentUnitCost: number;
  adjustmentValue: number;
  serialNumber?: string;
  requiresSerial?: boolean;
  notes?: string;
};

type Props = {
  open: boolean;
  initialData?: any;
  locations: Array<{ id: string; name: string }>;
  defaultLocationId?: string;
  onClose: () => void;
  onSaved: () => void;
};

export function StockAdjustmentFormDialog({
  open,
  initialData,
  locations,
  defaultLocationId,
  onClose,
  onSaved,
}: Props) {
  const [locationId, setLocationId] = useState("");
  const [adjustmentDate, setAdjustmentDate] = useState("");
  const [type, setType] = useState<"quantity" | "value">("quantity");
  const [reason, setReason] = useState("Count correction");
  const [description, setDescription] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [lines, setLines] = useState<FormLine[]>([]);
  const [itemSearchQ, setItemSearchQ] = useState("");
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    if (initialData) {
      setLocationId(initialData.locationId || defaultLocationId || locations[0]?.id || "");
      setAdjustmentDate(
        initialData.adjustmentDate
          ? new Date(initialData.adjustmentDate).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
      );
      setType(initialData.type || "quantity");
      setReason(initialData.reason || "Count correction");
      setDescription(initialData.description || "");
      setAttachments(initialData.attachments || []);
      setLines(
        (initialData.lines || []).map((l: any) => ({
          productId: l.productId,
          name: l.product?.name || l.name || "Item",
          sku: l.product?.skuCode || l.sku || "",
          currentQty: Number(l.currentQty ?? 0),
          adjustmentQty: Number(l.adjustmentQty ?? 0),
          newQty: Number(l.newQty ?? 0),
          unit: l.unit || "pcs",
          currentUnitCost: Number(l.currentUnitCost ?? 0),
          adjustmentValue: Number(l.adjustmentValue ?? 0),
          serialNumber: l.serialNumber || "",
          requiresSerial: Boolean(l.requiresSerial),
          notes: l.notes || "",
        })),
      );
    } else {
      setLocationId(defaultLocationId || locations[0]?.id || "");
      setAdjustmentDate(new Date().toISOString().split("T")[0]);
      setType("quantity");
      setReason("Count correction");
      setDescription("");
      setAttachments([]);
      setLines([]);
    }
    setFieldErrors({});
    setItemSearchQ("");
  }, [open, initialData, locations, defaultLocationId]);

  const searchProducts = useQuery({
    queryKey: ["pos-sale-products-adj-form-pick", itemSearchQ, locationId],
    queryFn: async () => {
      try {
        const res = await posApi.listSaleProducts({
          locationId: locationId || undefined,
          q: itemSearchQ.trim() || undefined,
        });
        if (res?.items && res.items.length > 0) return res.items;
      } catch (e) {
        /* fallback to catalogApi */
      }
      const catRes = await catalogApi.listProducts({
        q: itemSearchQ.trim() || undefined,
        limit: 100,
      });
      return (catRes?.items ?? []).map((p: any) => ({
        id: p.id,
        productId: p.id,
        sku: p.skuCode,
        title: p.name,
        price: p.basePrice,
        qty: p.stockLevels?.find((s: any) => s.locationId === locationId)?.qtyOnHand ?? 0,
        sellUnit: p.unitOfMeasure || "pcs",
        requiresSerial: p.trackSerial,
        trackSerial: p.trackSerial,
      }));
    },
    enabled: open,
  });

  const saveMutation = useMutation({
    mutationFn: (asStatus: "draft" | "adjusted") => {
      const payload = {
        locationId,
        adjustmentDate,
        type,
        reason,
        description: description.trim() || undefined,
        attachments: attachments.length ? attachments : undefined,
        status: asStatus,
        lines: lines.map((l) => ({
          productId: l.productId,
          stockLevelId: undefined,
          currentQty: l.currentQty,
          adjustmentQty: l.adjustmentQty,
          newQty: l.newQty,
          unit: l.unit,
          currentUnitCost: l.currentUnitCost,
          adjustmentValue: l.adjustmentValue,
          serialNumber: l.serialNumber?.trim() || undefined,
          notes: l.notes?.trim() || undefined,
        })),
      };
      return initialData
        ? posApi.updateStockAdjustment(initialData.id, payload)
        : posApi.createStockAdjustment(payload);
    },
    onSuccess: (res, asStatus) => {
      toast.success(
        asStatus === "adjusted"
          ? `Adjustment ${res.adjustmentNo || ""} finalized & stock updated!`
          : `Adjustment ${res.adjustmentNo || ""} saved as draft`,
      );
      setConfirmModalOpen(false);
      onSaved();
      onClose();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed to save adjustment"),
  });

  if (!open || typeof document === "undefined") return null;

  function handleAddProduct(item: any) {
    if (lines.some((l) => l.productId === item.id || l.productId === item.productId)) {
      toast.info("Item is already added to adjustment lines");
      return;
    }
    const currentQty = Number(item.qty ?? 0);
    const unitPrice = Number(item.price ?? 0);
    const newLine: FormLine = {
      productId: item.productId || item.id,
      name: item.title || item.name,
      sku: item.sku,
      currentQty,
      adjustmentQty: 1,
      newQty: currentQty + 1,
      unit: item.sellUnit || "pcs",
      currentUnitCost: unitPrice,
      adjustmentValue: unitPrice,
      requiresSerial: item.requiresSerial ?? item.trackSerial ?? false,
    };
    setLines((prev) => [...prev, newLine]);
    setItemSearchQ("");
  }

  function updateLine(index: number, patch: Partial<FormLine>) {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        const updated = { ...l, ...patch };

        if ("adjustmentQty" in patch) {
          const adj = Number(patch.adjustmentQty ?? 0);
          updated.newQty = updated.currentQty + adj;
          updated.adjustmentValue = Math.round(adj * updated.currentUnitCost * 100) / 100;
        } else if ("newQty" in patch) {
          const n = Number(patch.newQty ?? 0);
          updated.adjustmentQty = n - updated.currentQty;
          updated.adjustmentValue = Math.round(updated.adjustmentQty * updated.currentUnitCost * 100) / 100;
        } else if ("adjustmentValue" in patch) {
          updated.adjustmentValue = Number(patch.adjustmentValue ?? 0);
        }
        return updated;
      }),
    );
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function validateForm(): boolean {
    const errs: Record<string, string> = {};
    if (!locationId) errs.locationId = "Location is required";
    if (!adjustmentDate) errs.adjustmentDate = "Date is required";
    if (!reason.trim()) errs.reason = "Reason is required";
    if (!lines.length) errs.lines = "At least one item line is required";

    lines.forEach((l, i) => {
      if (type === "quantity" && Math.abs(l.adjustmentQty) < 1e-9) {
        errs[`line_${i}`] = "Adjustment qty cannot be zero";
      }
      if (l.newQty < 0) {
        errs[`line_${i}`] = "New stock cannot be negative";
      }
      if (l.requiresSerial && !l.serialNumber?.trim()) {
        errs[`line_${i}`] = "Serial number is required for this item";
      }
    });

    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error("Please fix errors in the form before saving");
      return false;
    }
    return true;
  }

  function handleSaveDraft() {
    if (!validateForm()) return;
    saveMutation.mutate("draft");
  }

  function handleOpenFinalizeConfirm() {
    if (!validateForm()) return;
    setConfirmModalOpen(true);
  }

  const modalBody = (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0b1f33]/45 p-4">
      <div
        role="dialog"
        aria-modal
        className="relative flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[#d9e0ea] bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#eef1f4] px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-[#0b1f33]">
              {initialData ? `Edit Adjustment ${initialData.adjustmentNo}` : "New Stock Adjustment"}
            </h2>
            <p className="mt-0.5 text-xs text-[#5a6b7d]">
              Pick items, adjust quantities or values, and save as draft or finalize.
            </p>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5a6b7d] hover:bg-[#f1f5f9]"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-5">
          {/* Top Form Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="adj-location">Location / Store *</Label>
              <select
                id="adj-location"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-[#d9e0ea] bg-white px-3 text-sm text-[#0b1f33] outline-none focus:border-[#1a56db]"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.locationId} />
            </div>

            <div>
              <Label htmlFor="adj-date">Adjustment Date *</Label>
              <Input
                id="adj-date"
                type="date"
                value={adjustmentDate}
                onChange={(e) => setAdjustmentDate(e.target.value)}
                className="mt-1 h-9"
              />
              <FieldError message={fieldErrors.adjustmentDate} />
            </div>

            <div>
              <Label>Adjustment Type *</Label>
              <div className="mt-1 flex gap-1 rounded-lg bg-[#eef2f8] p-1">
                <button
                  type="button"
                  className={
                    type === "quantity"
                      ? "flex-1 rounded-md bg-white py-1 text-xs font-semibold text-[#0b1f33] shadow-sm"
                      : "flex-1 rounded-md py-1 text-xs font-semibold text-[#5a6b7d]"
                  }
                  onClick={() => setType("quantity")}
                >
                  Quantity
                </button>
                <button
                  type="button"
                  className={
                    type === "value"
                      ? "flex-1 rounded-md bg-white py-1 text-xs font-semibold text-[#0b1f33] shadow-sm"
                      : "flex-1 rounded-md py-1 text-xs font-semibold text-[#5a6b7d]"
                  }
                  onClick={() => setType("value")}
                >
                  Value / Cost
                </button>
              </div>
            </div>

            <div>
              <Label htmlFor="adj-reason">Reason *</Label>
              <select
                id="adj-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-[#d9e0ea] bg-white px-3 text-sm text-[#0b1f33] outline-none focus:border-[#1a56db]"
              >
                {DEFAULT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.reason} />
            </div>
          </div>

          <div>
            <Label htmlFor="adj-desc">Description / Audit Note (Optional)</Label>
            <Input
              id="adj-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide context or explanation for audit record"
              className="mt-1 h-9"
            />
          </div>

          {/* Add Item Section */}
          <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="adj-item-search" className="font-semibold text-[#0b1f33]">
                Select or Search Products to Add
              </Label>
              <span className="text-xs text-[#8b9bb0]">
                {searchProducts.data?.length ?? 0} item(s) available
              </span>
            </div>
            <div className="relative mt-1.5">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#8b9bb0]" />
              <Input
                id="adj-item-search"
                value={itemSearchQ}
                onChange={(e) => setItemSearchQ(e.target.value)}
                placeholder="Search by product name, SKU, or barcode..."
                className="h-9 pl-9 bg-white"
              />
            </div>

            {/* Product search & pick list */}
            <div className="mt-2.5 max-h-52 overflow-y-auto rounded-lg border border-[#d9e0ea] bg-white shadow-sm divide-y divide-[#eef1f4]">
              {(searchProducts.data ?? []).map((item: any) => {
                const isAdded = lines.some((l) => l.productId === item.id || l.productId === item.productId);
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={isAdded}
                    className={cn(
                      "flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors",
                      isAdded ? "bg-[#f1f5f9] opacity-60 cursor-not-allowed" : "hover:bg-[#f8fafc]",
                    )}
                    onClick={() => handleAddProduct(item)}
                  >
                    <div>
                      <span className="block text-sm font-medium text-[#0b1f33]">
                        {item.title || item.name}
                      </span>
                      <span className="font-mono text-xs text-[#8b9bb0]">{item.sku || item.skuCode}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold text-[#1a56db]">
                        Stock: {formatQtyWithUnit(Number(item.qty ?? 0), item.sellUnit || item.unitOfMeasure || "pcs")}
                      </span>
                      <span className="block text-[0.7rem] font-medium text-[#047857]">
                        {isAdded ? "Added ✓" : "+ Click to add"}
                      </span>
                    </div>
                  </button>
                );
              })}
              {searchProducts.isLoading ? (
                <p className="px-4 py-4 text-center text-xs text-[#5a6b7d]">
                  Loading products...
                </p>
              ) : null}
              {!searchProducts.data?.length && !searchProducts.isLoading ? (
                <p className="px-4 py-4 text-center text-xs text-[#5a6b7d]">
                  No products found. Check Catalog Items or change store location.
                </p>
              ) : null}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="overflow-hidden rounded-xl border border-[#e4e9f0]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#eef1f4] bg-[#f8fafc] uppercase tracking-wider font-semibold text-[#5a6b7d]">
                <tr>
                  <th className="px-3 py-2.5">Item & SKU</th>
                  <th className="px-3 py-2.5 text-right">Current Stock</th>
                  <th className="px-3 py-2.5 text-center w-32">Adj Qty (+/-)</th>
                  <th className="px-3 py-2.5 text-right">New Stock</th>
                  {type === "value" ? <th className="px-3 py-2.5 text-right">Unit Cost</th> : null}
                  {type === "value" ? <th className="px-3 py-2.5 text-right w-28">Adj Value</th> : null}
                  <th className="px-3 py-2.5 w-24">Serial No</th>
                  <th className="px-3 py-2.5 text-center w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef1f4]">
                {lines.map((line, index) => (
                  <tr key={`${line.productId}-${index}`} className="hover:bg-[#fafbfc]">
                    <td className="px-3 py-2">
                      <span className="block font-medium text-[#0b1f33]">{line.name}</span>
                      <span className="font-mono text-[0.7rem] text-[#8b9bb0]">{line.sku}</span>
                      {fieldErrors[`line_${index}`] ? (
                        <p className="mt-0.5 text-[0.7rem] font-semibold text-rose-600">
                          {fieldErrors[`line_${index}`]}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#5a6b7d]">
                      {formatQtyWithUnit(line.currentQty, line.unit)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Input
                        type="number"
                        step="any"
                        value={line.adjustmentQty}
                        onChange={(e) =>
                          updateLine(index, { adjustmentQty: Number(e.target.value) })
                        }
                        className="h-7 w-28 text-center text-xs mx-auto"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-[#0b1f33]">
                      {formatQtyWithUnit(line.newQty, line.unit)}
                    </td>
                    {type === "value" ? (
                      <td className="px-3 py-2 text-right tabular-nums text-[#5a6b7d]">
                        ₹{line.currentUnitCost.toFixed(2)}
                      </td>
                    ) : null}
                    {type === "value" ? (
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          value={line.adjustmentValue}
                          onChange={(e) =>
                            updateLine(index, { adjustmentValue: Number(e.target.value) })
                          }
                          className="h-7 w-24 text-right text-xs ml-auto"
                        />
                      </td>
                    ) : null}
                    <td className="px-3 py-2">
                      <Input
                        type="text"
                        placeholder={line.requiresSerial ? "Serial *" : "Optional"}
                        value={line.serialNumber || ""}
                        onChange={(e) => updateLine(index, { serialNumber: e.target.value })}
                        className="h-7 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        className="text-[#94a3b8] hover:text-rose-600"
                        onClick={() => removeLine(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {!lines.length ? (
                  <tr>
                    <td
                      colSpan={type === "value" ? 8 : 6}
                      className="px-4 py-8 text-center text-xs text-[#8b9bb0]"
                    >
                      No items added yet. Search above to add items to this adjustment.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <FieldError message={fieldErrors.lines} />
        </div>

        {/* Footer Actions */}
        <div className="flex shrink-0 items-center justify-between border-t border-[#eef1f4] px-6 py-4 bg-[#f8fafc]">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saveMutation.isPending}
              onClick={handleSaveDraft}
            >
              Save as Draft
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saveMutation.isPending}
              onClick={handleOpenFinalizeConfirm}
            >
              {saveMutation.isPending ? "Finalizing…" : "Finalize & Adjust Stock"}
            </Button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal before Finalizing */}
      {confirmModalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl border border-[#d9e0ea]">
            <div className="flex items-center gap-3 text-[#0b1f33]">
              <CheckCircle2 className="h-6 w-6 text-[#1a56db]" />
              <h3 className="text-base font-semibold">Confirm Finalize Adjustment</h3>
            </div>
            <p className="mt-2 text-xs text-[#5a6b7d]">
              Review the stock impact below. Once finalized, inventory levels will be updated immediately and cannot be directly edited.
            </p>
            <div className="mt-4 max-h-48 overflow-y-auto rounded-lg border border-[#e2e8f0] p-3 text-xs divide-y divide-[#eef1f4]">
              {lines.map((l) => (
                <div key={l.productId} className="py-2 first:pt-0 last:pb-0 flex justify-between">
                  <div>
                    <span className="font-medium text-[#0b1f33]">{l.name}</span>
                    <span className="block font-mono text-[0.7rem] text-[#8b9bb0]">{l.sku}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[#5a6b7d]">{formatQtyWithUnit(l.currentQty, l.unit)}</span>
                    <span className="mx-1 text-[#1a56db]">→</span>
                    <span className="font-bold text-[#0b1f33]">
                      {formatQtyWithUnit(l.newQty, l.unit)}
                    </span>
                    <span className="block text-[0.7rem] font-semibold text-[#047857]">
                      ({l.adjustmentQty > 0 ? "+" : ""}{l.adjustmentQty})
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmModalOpen(false)}>
                Go Back
              </Button>
              <Button
                size="sm"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate("adjusted")}
              >
                Confirm & Apply Stock Change
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  return createPortal(modalBody, document.body);
}
