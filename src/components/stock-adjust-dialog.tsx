"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/form";
import {
  stockAdjustFormSchema,
  zodFieldErrors,
  zodMessages,
} from "@/lib/validations";
import {
  formatQtyWithUnit,
  type SellUnit,
} from "@/lib/sell-units";

export type StockAdjustTarget = {
  id: string;
  name: string;
  sku: string;
  qty: number;
  sellUnit?: string | null;
  /** Pre-set step when opening from +/− buttons */
  presetDelta?: number;
};

type Props = {
  target: StockAdjustTarget | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (args: { id: string; delta: number; reason?: string }) => void;
};

/**
 * Phase-1 inventory: adjust qty with optional audit reason (no window.prompt).
 */
export function StockAdjustDialog({
  target,
  busy,
  onClose,
  onSubmit,
}: Props) {
  const [delta, setDelta] = useState("1");
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!target) return;
    setDelta(target.presetDelta != null ? String(target.presetDelta) : "1");
    setReason("");
    setFieldErrors({});
  }, [target]);

  if (!target || typeof document === "undefined") return null;

  const active = target;
  const unit = (active.sellUnit || "pcs") as SellUnit;
  const current = Number(active.qty);
  const d = Number(delta);
  const preview =
    Number.isFinite(d) && !Number.isNaN(d) ? current + d : current;

  function handleSubmit() {
    const parsed = stockAdjustFormSchema.safeParse({ delta, reason });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      toast.error(zodMessages(parsed.error)[0] ?? "Check the form");
      return;
    }
    setFieldErrors({});
    const nextDelta = parsed.data.delta;
    const nextReason = (parsed.data.reason ?? "").trim();
    onSubmit({
      id: active.id,
      delta: nextDelta,
      reason: nextReason || undefined,
    });
  }

  const body = (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0b1f33]/40 p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="stock-adjust-title"
        className="relative w-full max-w-md rounded-xl border border-[#d9e0ea] bg-white p-5 shadow-[0_16px_40px_-20px_rgba(11,31,51,0.35)]"
      >
        <h2
          id="stock-adjust-title"
          className="text-lg font-semibold tracking-tight text-[#0b1f33]"
        >
          Adjust stock
        </h2>
        <p className="mt-1 text-sm text-[#5a6b7d]">
          {active.name}
          <span className="ml-1.5 font-mono text-[0.75rem] text-[#8b9aab]">
            {active.sku}
          </span>
        </p>
        <p className="mt-2 text-sm text-[#0b1f33]">
          On hand:{" "}
          <strong className="tabular-nums">
            {formatQtyWithUnit(current, unit)}
          </strong>
          {Number.isFinite(d) && d !== 0 ? (
            <>
              {" "}
              →{" "}
              <strong className="tabular-nums text-[#1a56db]">
                {formatQtyWithUnit(preview, unit)}
              </strong>
            </>
          ) : null}
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="stock-delta">Change (use − for remove)</Label>
            <Input
              id="stock-delta"
              type="number"
              step="any"
              value={delta}
              onChange={(e) => {
                setDelta(e.target.value);
                setFieldErrors((f) => ({ ...f, delta: "" }));
              }}
              className="mt-1"
            />
            <FieldError message={fieldErrors.delta} />
          </div>
          <div>
            <Label htmlFor="stock-reason">Note for audit (optional)</Label>
            <Input
              id="stock-reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setFieldErrors((f) => ({ ...f, reason: "" }));
              }}
              placeholder="e.g. Count correction, damaged units"
              maxLength={500}
              className="mt-1"
            />
            <FieldError message={fieldErrors.reason} />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={handleSubmit}>
            {busy ? "Saving…" : "Save stock"}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
