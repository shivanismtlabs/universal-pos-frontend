"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  X,
  PackagePlus,
  PackageMinus,
  AlertTriangle,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { inventoryApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FieldError } from "@/components/ui/form";
import {
  stockMoveSchema,
  zodFieldErrors,
  zodMessages,
} from "@/lib/validations";

/** Backend paginate() caps at 100 — load full page for modal pickers */
const STOCK_PICKER_LIMIT = 100;

function useStockLevelPicker(locationId: string, open: boolean) {
  return useQuery({
    queryKey: ["inv-levels-picker", locationId],
    queryFn: () =>
      inventoryApi.listLevels({
        locationId,
        includeZero: true,
        page: 1,
        limit: STOCK_PICKER_LIMIT,
      }),
    enabled: open && Boolean(locationId),
  });
}

function StockItemSelect({
  locationId,
  open,
  value,
  onChange,
  placeholder,
  optionLabel,
}: {
  locationId: string;
  open: boolean;
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  optionLabel: (i: {
    stockLevelId: string;
    name: string;
    sku: string;
    qtyOnHand: number;
    sellUnit: string;
  }) => string;
}) {
  const levels = useStockLevelPicker(locationId, open);
  const items = levels.data?.items ?? [];
  const total = levels.data?.meta?.total ?? items.length;

  return (
    <div>
      {!locationId ? (
        <p className="mt-1 text-xs text-amber-700">
          Select a store / location on the Inventory page first.
        </p>
      ) : levels.isLoading ? (
        <p className="mt-1 text-xs text-[#5a6b7d]">Loading stock list…</p>
      ) : levels.isError ? (
        <p className="mt-1 text-xs text-[#a01818]">
          Could not load stock list.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => void levels.refetch()}
          >
            Retry
          </button>
        </p>
      ) : items.length === 0 ? (
        <p className="mt-1 text-xs text-[#5a6b7d]">
          No stock items at this location yet. Add products or receive stock
          first.
        </p>
      ) : null}
      <Select
        className="mt-1 h-10 rounded-lg border border-[#dce3ec] bg-white px-3 text-sm"
        value={value}
        disabled={!locationId || levels.isLoading || items.length === 0}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {items.map((i) => (
          <option key={i.stockLevelId} value={i.stockLevelId}>
            {optionLabel(i)}
          </option>
        ))}
      </Select>
      {total > items.length ? (
        <p className="mt-1 text-[0.65rem] text-[#8b9bb0]">
          Showing first {items.length} of {total} items — type in the dropdown
          search to filter this list.
        </p>
      ) : null}
    </div>
  );
}

/** Common portal overlay styling */
function ModalBackdrop({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#0b1f33]/45 backdrop-blur-xs transition-opacity"
        aria-label="Close modal"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-2xl transition-all">
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** 1. Stock In Modal */
export function StockInModal({
  open,
  onClose,
  locationId,
}: {
  open: boolean;
  onClose: () => void;
  locationId: string;
}) {
  const qc = useQueryClient();
  const [stockLevelId, setStockLevelId] = useState("");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setStockLevelId("");
      setQty("1");
      setReason("");
      setFieldErrors({});
    }
  }, [open]);

  const run = useMutation({
    mutationFn: () => {
      const parsed = stockMoveSchema.safeParse({
        locationId,
        stockLevelId,
        qty,
        reason,
      });
      if (!parsed.success) {
        setFieldErrors(zodFieldErrors(parsed.error));
        toast.error(zodMessages(parsed.error)[0] ?? "Please fix errors in form");
        throw new Error("Invalid form");
      }
      setFieldErrors({});
      return inventoryApi.stockIn({
        locationId: parsed.data.locationId,
        reason: parsed.data.reason || undefined,
        lines: [{ stockLevelId: parsed.data.stockLevelId, qty: parsed.data.qty }],
      });
    },
    onSuccess: () => {
      toast.success("Stock received successfully!");
      onClose();
      void qc.invalidateQueries({ queryKey: ["inv-levels"] });
      void qc.invalidateQueries({ queryKey: ["inv-levels-picker"] });
      void qc.invalidateQueries({ queryKey: ["inv-ledger"] });
    },
    onError: (e: Error) => {
      if (e instanceof ApiError) toast.error(e.message);
    },
  });

  if (!open) return null;

  const PRESET_REASONS = [
    "Supplier Delivery (GRN)",
    "Found Stock",
    "Customer Return",
    "Opening Balance",
  ];

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="flex items-start justify-between gap-3 border-b border-[#f0f3f7] pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <PackagePlus className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#0b1f33]">
              Record Stock In
            </h3>
            <p className="text-xs text-[#5a6b7d]">
              Receive new items or stock quantity into store inventory.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-lg text-[#5a6b7d] hover:bg-[#f1f5f9]"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <Label className="text-xs font-semibold text-[#0b1f33]">
            Select Item *
          </Label>
          <StockItemSelect
            locationId={locationId}
            open={open}
            value={stockLevelId}
            onChange={(id) => {
              setStockLevelId(id);
              setFieldErrors((f) => ({ ...f, stockLevelId: "" }));
            }}
            placeholder="-- Choose item to add stock --"
            optionLabel={(i) =>
              `${i.name} (${i.sku}) — Current: ${i.qtyOnHand} ${i.sellUnit}`
            }
          />
          <FieldError message={fieldErrors.stockLevelId} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs font-semibold text-[#0b1f33]">
              Quantity to Receive *
            </Label>
            <Input
              className="mt-1 h-10"
              type="number"
              min={0.001}
              step="any"
              value={qty}
              onChange={(e) => {
                setQty(e.target.value);
                setFieldErrors((f) => ({ ...f, qty: "" }));
              }}
              placeholder="e.g. 10"
            />
            <FieldError message={fieldErrors.qty} />
          </div>

          <div>
            <Label className="text-xs font-semibold text-[#0b1f33]">
              Reason / Reference
            </Label>
            <Input
              className="mt-1 h-10"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setFieldErrors((f) => ({ ...f, reason: "" }));
              }}
              placeholder="e.g. Invoice #1024"
            />
            <FieldError message={fieldErrors.reason} />
          </div>
        </div>

        <div>
          <p className="text-[0.72rem] font-medium text-[#5a6b7d]">
            Quick reasons:
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {PRESET_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                className="rounded-md border border-[#dce3ec] bg-[#f8fafc] px-2.5 py-1 text-xs text-[#0b1f33] transition hover:bg-white hover:border-[#1a56db]"
                onClick={() => {
                  setReason(r);
                  setFieldErrors((f) => ({ ...f, reason: "" }));
                }}
              >
                + {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#f0f3f7] pt-4">
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={run.isPending || !stockLevelId}
          onClick={() => run.mutate()}
          className="bg-[#1a56db] hover:bg-[#1546b3]"
        >
          {run.isPending ? "Saving..." : "Save Stock In"}
        </Button>
      </div>
    </ModalBackdrop>
  );
}

/** 2. Stock Out Modal */
export function StockOutModal({
  open,
  onClose,
  locationId,
}: {
  open: boolean;
  onClose: () => void;
  locationId: string;
}) {
  const qc = useQueryClient();
  const [stockLevelId, setStockLevelId] = useState("");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const levels = useStockLevelPicker(locationId, open);

  useEffect(() => {
    if (open) {
      setStockLevelId("");
      setQty("1");
      setReason("");
      setFieldErrors({});
    }
  }, [open]);

  const selectedItem = (levels.data?.items ?? []).find(
    (i) => i.stockLevelId === stockLevelId,
  );

  const run = useMutation({
    mutationFn: () => {
      const parsed = stockMoveSchema.safeParse({
        locationId,
        stockLevelId,
        qty,
        reason,
      });
      if (!parsed.success) {
        setFieldErrors(zodFieldErrors(parsed.error));
        toast.error(zodMessages(parsed.error)[0] ?? "Please fix errors in form");
        throw new Error("Invalid form");
      }
      setFieldErrors({});
      return inventoryApi.stockOut({
        locationId: parsed.data.locationId,
        reason: parsed.data.reason || undefined,
        lines: [{ stockLevelId: parsed.data.stockLevelId, qty: parsed.data.qty }],
      });
    },
    onSuccess: () => {
      toast.success("Stock out recorded");
      onClose();
      void qc.invalidateQueries({ queryKey: ["inv-levels"] });
      void qc.invalidateQueries({ queryKey: ["inv-levels-picker"] });
      void qc.invalidateQueries({ queryKey: ["inv-ledger"] });
    },
    onError: (e: Error) => {
      if (e instanceof ApiError) toast.error(e.message);
    },
  });

  if (!open) return null;

  const PRESET_REASONS = [
    "Store Usage",
    "Expired / Write-off",
    "Return to Vendor",
    "Damage / Loss",
  ];

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="flex items-start justify-between gap-3 border-b border-[#f0f3f7] pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <PackageMinus className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#0b1f33]">
              Record Stock Out
            </h3>
            <p className="text-xs text-[#5a6b7d]">
              Remove or issue inventory stock from store location.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-lg text-[#5a6b7d] hover:bg-[#f1f5f9]"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <Label className="text-xs font-semibold text-[#0b1f33]">
            Select Item *
          </Label>
          <StockItemSelect
            locationId={locationId}
            open={open}
            value={stockLevelId}
            onChange={(id) => {
              setStockLevelId(id);
              setFieldErrors((f) => ({ ...f, stockLevelId: "" }));
            }}
            placeholder="-- Choose item to remove stock --"
            optionLabel={(i) =>
              `${i.name} (${i.sku}) — Available: ${i.qtyOnHand} ${i.sellUnit}`
            }
          />
          <FieldError message={fieldErrors.stockLevelId} />
        </div>

        {selectedItem ? (
          <div className="rounded-lg bg-[#f8fafc] p-3 text-xs text-[#5a6b7d]">
            Current stock on hand:{" "}
            <strong className="text-[#0b1f33]">
              {selectedItem.qtyOnHand} {selectedItem.sellUnit}
            </strong>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs font-semibold text-[#0b1f33]">
              Quantity to Remove *
            </Label>
            <Input
              className="mt-1 h-10"
              type="number"
              min={0.001}
              step="any"
              value={qty}
              onChange={(e) => {
                setQty(e.target.value);
                setFieldErrors((f) => ({ ...f, qty: "" }));
              }}
              placeholder="e.g. 2"
            />
            <FieldError message={fieldErrors.qty} />
          </div>

          <div>
            <Label className="text-xs font-semibold text-[#0b1f33]">
              Reason / Note
            </Label>
            <Input
              className="mt-1 h-10"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setFieldErrors((f) => ({ ...f, reason: "" }));
              }}
              placeholder="e.g. Store internal use"
            />
            <FieldError message={fieldErrors.reason} />
          </div>
        </div>

        <div>
          <p className="text-[0.72rem] font-medium text-[#5a6b7d]">
            Quick reasons:
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {PRESET_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                className="rounded-md border border-[#dce3ec] bg-[#f8fafc] px-2.5 py-1 text-xs text-[#0b1f33] transition hover:bg-white hover:border-[#1a56db]"
                onClick={() => {
                  setReason(r);
                  setFieldErrors((f) => ({ ...f, reason: "" }));
                }}
              >
                + {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#f0f3f7] pt-4">
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={run.isPending || !stockLevelId}
          onClick={() => run.mutate()}
        >
          {run.isPending ? "Saving..." : "Confirm Stock Out"}
        </Button>
      </div>
    </ModalBackdrop>
  );
}

/** 3. Report Damaged Stock Modal */
export function DamagedStockModal({
  open,
  onClose,
  locationId,
}: {
  open: boolean;
  onClose: () => void;
  locationId: string;
}) {
  const qc = useQueryClient();
  const [stockLevelId, setStockLevelId] = useState("");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setStockLevelId("");
      setQty("1");
      setReason("");
      setFieldErrors({});
    }
  }, [open]);

  const mark = useMutation({
    mutationFn: () => {
      const parsed = stockMoveSchema.safeParse({
        locationId,
        stockLevelId,
        qty,
        reason,
      });
      if (!parsed.success) {
        setFieldErrors(zodFieldErrors(parsed.error));
        toast.error(zodMessages(parsed.error)[0] ?? "Check form errors");
        throw new Error("Invalid form");
      }
      setFieldErrors({});
      return inventoryApi.markDamaged({
        locationId: parsed.data.locationId,
        stockLevelId: parsed.data.stockLevelId,
        qty: parsed.data.qty,
        reason: parsed.data.reason || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Moved quantity to damaged stock");
      onClose();
      void qc.invalidateQueries({ queryKey: ["inv-levels"] });
      void qc.invalidateQueries({ queryKey: ["inv-levels-picker"] });
    },
    onError: (e: Error) => {
      if (e instanceof ApiError) toast.error(e.message);
    },
  });

  if (!open) return null;

  const PRESET_REASONS = [
    "Broken / Cracked",
    "Expired",
    "Spilled / Leakage",
    "Factory Defect",
  ];

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="flex items-start justify-between gap-3 border-b border-[#f0f3f7] pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#0b1f33]">
              Report Damaged Stock
            </h3>
            <p className="text-xs text-[#5a6b7d]">
              Move broken or expired items out of sellable inventory.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-lg text-[#5a6b7d] hover:bg-[#f1f5f9]"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <Label className="text-xs font-semibold text-[#0b1f33]">
            Select Item *
          </Label>
          <StockItemSelect
            locationId={locationId}
            open={open}
            value={stockLevelId}
            onChange={(id) => {
              setStockLevelId(id);
              setFieldErrors((f) => ({ ...f, stockLevelId: "" }));
            }}
            placeholder="-- Choose damaged item --"
            optionLabel={(i) =>
              `${i.name} (${i.sku}) — Sellable: ${i.qtyOnHand} ${i.sellUnit}`
            }
          />
          <FieldError message={fieldErrors.stockLevelId} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs font-semibold text-[#0b1f33]">
              Damaged Quantity *
            </Label>
            <Input
              className="mt-1 h-10"
              type="number"
              min={0.001}
              step="any"
              value={qty}
              onChange={(e) => {
                setQty(e.target.value);
                setFieldErrors((f) => ({ ...f, qty: "" }));
              }}
              placeholder="e.g. 1"
            />
            <FieldError message={fieldErrors.qty} />
          </div>

          <div>
            <Label className="text-xs font-semibold text-[#0b1f33]">
              Damage Reason
            </Label>
            <Input
              className="mt-1 h-10"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setFieldErrors((f) => ({ ...f, reason: "" }));
              }}
              placeholder="e.g. Box crushed in transit"
            />
            <FieldError message={fieldErrors.reason} />
          </div>
        </div>

        <div>
          <p className="text-[0.72rem] font-medium text-[#5a6b7d]">
            Quick reasons:
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {PRESET_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                className="rounded-md border border-[#dce3ec] bg-[#f8fafc] px-2.5 py-1 text-xs text-[#0b1f33] transition hover:bg-white hover:border-[#1a56db]"
                onClick={() => {
                  setReason(r);
                  setFieldErrors((f) => ({ ...f, reason: "" }));
                }}
              >
                + {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#f0f3f7] pt-4">
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={mark.isPending || !stockLevelId}
          onClick={() => mark.mutate()}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          {mark.isPending ? "Saving..." : "Move to Damaged"}
        </Button>
      </div>
    </ModalBackdrop>
  );
}

/** 4. Branch Price & Reorder Level Modal */
export function BranchPriceReorderModal({
  target,
  onClose,
  locationId,
}: {
  target: {
    stockLevelId: string;
    name: string;
    sku: string;
    sellPrice: number;
    reorderPoint: number | null;
    reorderQty: number | null;
  } | null;
  onClose: () => void;
  locationId: string;
}) {
  const qc = useQueryClient();
  const [rp, setRp] = useState("");
  const [rq, setRq] = useState("");
  const [sp, setSp] = useState("");

  useEffect(() => {
    if (target) {
      setSp(target.sellPrice != null ? String(target.sellPrice) : "");
      setRp(target.reorderPoint != null ? String(target.reorderPoint) : "");
      setRq(target.reorderQty != null ? String(target.reorderQty) : "");
    }
  }, [target]);

  const saveReorder = useMutation({
    mutationFn: () =>
      inventoryApi.setReorder({
        locationId,
        stockLevelId: target!.stockLevelId,
        reorderPoint: rp === "" ? undefined : Number(rp),
        reorderQty: rq === "" ? undefined : Number(rq),
        sellPrice: sp === "" ? undefined : Number(sp),
      }),
    onSuccess: () => {
      toast.success("Branch price & reorder settings updated");
      onClose();
      void qc.invalidateQueries({ queryKey: ["inv-levels"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to save"),
  });

  if (!target) return null;

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="flex items-start justify-between gap-3 border-b border-[#f0f3f7] pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-[#1a56db]">
            <SlidersHorizontal className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#0b1f33]">
              Branch Price & Reorder Alert
            </h3>
            <p className="text-xs text-[#5a6b7d]">
              {target.name}{" "}
              <span className="font-mono text-[0.72rem] text-[#8b9aab]">
                ({target.sku})
              </span>
            </p>
          </div>
        </div>
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-lg text-[#5a6b7d] hover:bg-[#f1f5f9]"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <Label className="text-xs font-semibold text-[#0b1f33]">
            Branch Selling Price (₹)
          </Label>
          <Input
            className="mt-1 h-10"
            type="number"
            min={0}
            step="0.01"
            value={sp}
            onChange={(e) => setSp(e.target.value)}
            placeholder="e.g. 499.00"
          />
          <p className="mt-1 text-[0.72rem] text-[#6b7280]">
            Branch-specific selling price used at POS checkout for this location.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs font-semibold text-[#0b1f33]">
              Reorder Point (Qty)
            </Label>
            <Input
              className="mt-1 h-10"
              type="number"
              min={0}
              value={rp}
              onChange={(e) => setRp(e.target.value)}
              placeholder="e.g. 5"
            />
            <p className="mt-1 text-[0.72rem] text-[#6b7280]">
              Triggers low stock warning when inventory drops to this level.
            </p>
          </div>

          <div>
            <Label className="text-xs font-semibold text-[#0b1f33]">
              Suggested Reorder Qty
            </Label>
            <Input
              className="mt-1 h-10"
              type="number"
              min={0}
              value={rq}
              onChange={(e) => setRq(e.target.value)}
              placeholder="e.g. 20"
            />
            <p className="mt-1 text-[0.72rem] text-[#6b7280]">
              Default quantity suggested when creating purchase orders.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#f0f3f7] pt-4">
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={saveReorder.isPending}
          onClick={() => saveReorder.mutate()}
          className="bg-[#1a56db] hover:bg-[#1546b3]"
        >
          {saveReorder.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </ModalBackdrop>
  );
}

/** 5. Restore Damaged Stock Modal */
export function RestoreDamagedModal({
  target,
  onClose,
  locationId,
}: {
  target: {
    stockLevelId: string;
    name: string;
    sku: string;
    qtyDamaged: number;
    sellUnit?: string;
  } | null;
  onClose: () => void;
  locationId: string;
}) {
  const qc = useQueryClient();
  const [restoreQty, setRestoreQty] = useState("1");

  useEffect(() => {
    if (target) {
      setRestoreQty("1");
    }
  }, [target]);

  const restore = useMutation({
    mutationFn: () => {
      const amount = Number(restoreQty);
      const parsed = stockMoveSchema.safeParse({
        locationId,
        stockLevelId: target!.stockLevelId,
        qty: amount,
        reason: "Restored to sellable stock",
      });
      if (!parsed.success) {
        toast.error(zodMessages(parsed.error)[0] ?? "Invalid quantity");
        throw new Error("Invalid qty");
      }
      return inventoryApi.restoreDamaged({
        locationId: parsed.data.locationId,
        stockLevelId: parsed.data.stockLevelId,
        qty: parsed.data.qty,
        reason: "Restored to sellable stock",
      });
    },
    onSuccess: () => {
      toast.success("Restored items back to sellable stock");
      onClose();
      void qc.invalidateQueries({ queryKey: ["inv-levels"] });
    },
    onError: (e: Error) => {
      if (e instanceof ApiError) toast.error(e.message);
    },
  });

  if (!target) return null;

  const max = Number(target.qtyDamaged);

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="flex items-start justify-between gap-3 border-b border-[#f0f3f7] pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-[#1a56db]">
            <RefreshCw className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#0b1f33]">
              Restore Damaged Stock
            </h3>
            <p className="text-xs text-[#5a6b7d]">
              Return repaired or re-inspected items to sellable stock.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-lg text-[#5a6b7d] hover:bg-[#f1f5f9]"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <div className="rounded-lg bg-[#f8fafc] p-3 text-xs text-[#5a6b7d]">
          <p className="font-semibold text-[#0b1f33]">{target.name}</p>
          <p className="mt-0.5 font-mono text-[0.7rem] text-[#8b9aab]">
            SKU: {target.sku}
          </p>
          <p className="mt-1 text-amber-800">
            Currently damaged:{" "}
            <strong>
              {target.qtyDamaged} {target.sellUnit}
            </strong>
          </p>
        </div>

        <div>
          <Label className="text-xs font-semibold text-[#0b1f33]">
            Quantity to Restore to Sellable Stock *
          </Label>
          <Input
            className="mt-1 h-10"
            type="number"
            min={0.001}
            max={max}
            step="any"
            value={restoreQty}
            onChange={(e) => setRestoreQty(e.target.value)}
          />
          <p className="mt-1 text-[0.72rem] text-[#6b7280]">
            Maximum available to restore: {max}
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#f0f3f7] pt-4">
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={restore.isPending || Number(restoreQty) <= 0}
          onClick={() => restore.mutate()}
          className="bg-[#1a56db] hover:bg-[#1546b3]"
        >
          {restore.isPending ? "Restoring..." : "Restore to Sellable"}
        </Button>
      </div>
    </ModalBackdrop>
  );
}
