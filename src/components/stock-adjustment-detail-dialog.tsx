"use client";

import { createPortal } from "react-dom";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, CheckCircle2, AlertCircle, Ban, Edit3, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { posApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { formatQtyWithUnit } from "@/lib/sell-units";

type Props = {
  adjustmentId: string | null;
  canWrite?: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onEdit?: (adj: any) => void;
};

export function StockAdjustmentDetailDialog({
  adjustmentId,
  canWrite,
  onClose,
  onRefresh,
  onEdit,
}: Props) {
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);

  const detailQ = useQuery({
    queryKey: ["stock-adjustment", adjustmentId],
    queryFn: () => posApi.getStockAdjustment(adjustmentId!),
    enabled: Boolean(adjustmentId),
  });

  const adjustment = detailQ.data;

  const finalizeMutation = useMutation({
    mutationFn: () => posApi.finalizeStockAdjustment(adjustment!.id),
    onSuccess: (res) => {
      toast.success(
        `Adjustment ${res.adjustmentNo} finalized and stock updated!`,
      );
      onRefresh();
      onClose();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Finalize failed",
      ),
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      posApi.cancelStockAdjustment(adjustment!.id, cancelReason),
    onSuccess: (res) => {
      toast.success(`Adjustment ${res.adjustmentNo} cancelled`);
      setShowCancelPrompt(false);
      onRefresh();
      onClose();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Cancel failed",
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: () => posApi.deleteStockAdjustment(adjustment!.id),
    onSuccess: () => {
      toast.success("Draft adjustment deleted");
      onRefresh();
      onClose();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Delete failed",
      ),
  });

  if (!adjustmentId || typeof document === "undefined") return null;

  if (detailQ.isLoading || !adjustment) {
    return createPortal(
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0b1f33]/45 p-4">
        <div className="rounded-xl border border-[#d9e0ea] bg-white px-6 py-5 text-sm text-[#5a6b7d] shadow-xl">
          {detailQ.isError ? (
            <div className="space-y-3">
              <p className="text-[#c81e1e]">Could not load adjustment.</p>
              <Button size="sm" variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          ) : (
            "Loading adjustment…"
          )}
        </div>
      </div>,
      document.body,
    );
  }

  const isDraft = adjustment.status === "draft";
  const isPending = adjustment.status === "pending";
  const isFinalized = adjustment.status === "adjusted";
  const isCancelled = adjustment.status === "cancelled";
  const canFinalize = isDraft || isPending;

  const statusText = isFinalized
    ? "Finalized / Adjusted"
    : isDraft
      ? "Draft"
      : isPending
        ? "Pending"
        : "Cancelled";
  const statusClass = isFinalized
    ? "rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-xs font-semibold text-[#15803d]"
    : isDraft
      ? "rounded-full bg-[#fef3c7] px-2.5 py-0.5 text-xs font-semibold text-[#b45309]"
      : isPending
        ? "rounded-full bg-[#e0e7ff] px-2.5 py-0.5 text-xs font-semibold text-[#3730a3]"
        : "rounded-full bg-[#fee2e2] px-2.5 py-0.5 text-xs font-semibold text-[#b91c1c]";

  const modalBody = (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0b1f33]/45 p-4">
      <div
        role="dialog"
        aria-modal
        className="relative flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[#d9e0ea] bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#eef1f4] bg-[#f8fafc] px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-[#0b1f33]">
              {adjustment.adjustmentNo}
            </h2>
            <span className={statusClass}>{statusText}</span>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5a6b7d] hover:bg-[#e2e8f0]"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
          <div className="grid gap-4 rounded-xl border border-[#e2e8f0] bg-[#fafbfc] p-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <span className="block font-semibold tracking-wider text-[#8b9bb0] uppercase">
                Date
              </span>
              <span className="mt-0.5 block font-medium text-[#0b1f33]">
                {new Date(adjustment.adjustmentDate).toLocaleDateString()}
              </span>
            </div>
            <div>
              <span className="block font-semibold tracking-wider text-[#8b9bb0] uppercase">
                Location
              </span>
              <span className="mt-0.5 block font-medium text-[#0b1f33]">
                {adjustment.location?.name || "Store"}
              </span>
            </div>
            <div>
              <span className="block font-semibold tracking-wider text-[#8b9bb0] uppercase">
                Type
              </span>
              <span className="mt-0.5 block font-medium text-[#0b1f33] capitalize">
                {adjustment.type} Adjustment
              </span>
            </div>
            <div>
              <span className="block font-semibold tracking-wider text-[#8b9bb0] uppercase">
                Reason
              </span>
              <span className="mt-0.5 block font-medium text-[#0b1f33]">
                {adjustment.reason}
              </span>
            </div>
          </div>

          {adjustment.description ? (
            <div className="rounded-lg border border-[#e2e8f0] bg-white p-3 text-xs">
              <span className="font-semibold text-[#5a6b7d]">
                Description / Note:
              </span>
              <p className="mt-1 whitespace-pre-wrap text-[#0b1f33]">
                {adjustment.description}
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <h3 className="text-xs font-bold tracking-wider text-[#5a6b7d] uppercase">
              Adjusted Line Items ({adjustment.lines?.length || 0})
            </h3>
            <div className="overflow-hidden rounded-xl border border-[#e4e9f0]">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#eef1f4] bg-[#f8fafc] font-semibold tracking-wider text-[#5a6b7d] uppercase">
                  <tr>
                    <th className="px-3 py-2.5">Item & SKU</th>
                    <th className="px-3 py-2.5 text-right">Current Stock</th>
                    <th className="px-3 py-2.5 text-right">Adj Qty (+/-)</th>
                    <th className="px-3 py-2.5 text-right">New Stock</th>
                    {adjustment.type === "value" ? (
                      <th className="px-3 py-2.5 text-right">Adj Value</th>
                    ) : null}
                    <th className="px-3 py-2.5">Serial No</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef1f4]">
                  {(adjustment.lines || []).map((line: any) => (
                    <tr key={line.id} className="hover:bg-[#fafbfc]">
                      <td className="px-3 py-2.5">
                        <span className="block font-medium text-[#0b1f33]">
                          {line.product?.name || line.name || "Item"}
                        </span>
                        <span className="font-mono text-[0.7rem] text-[#8b9bb0]">
                          {line.product?.skuCode || line.sku}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#5a6b7d]">
                        {formatQtyWithUnit(Number(line.currentQty), line.unit)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[#047857]">
                        {Number(line.adjustmentQty) > 0 ? "+" : ""}
                        {formatQtyWithUnit(
                          Number(line.adjustmentQty),
                          line.unit,
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums text-[#0b1f33]">
                        {formatQtyWithUnit(Number(line.newQty), line.unit)}
                      </td>
                      {adjustment.type === "value" ? (
                        <td className="px-3 py-2.5 text-right tabular-nums text-[#0b1f33]">
                          ₹{Number(line.adjustmentValue ?? 0).toFixed(2)}
                        </td>
                      ) : null}
                      <td className="px-3 py-2.5 font-mono text-[0.7rem] text-[#5a6b7d]">
                        {line.serialNumber || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-1 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4 text-xs text-[#5a6b7d]">
            <p>
              Created by:{" "}
              <strong className="text-[#0b1f33]">
                {adjustment.createdBy?.fullName || "Staff"}
              </strong>{" "}
              on {new Date(adjustment.createdAt).toLocaleString()}
            </p>
            {adjustment.finalizedAt ? (
              <p>
                Finalized by:{" "}
                <strong className="text-[#0b1f33]">
                  {adjustment.finalizedBy?.fullName || "Staff"}
                </strong>{" "}
                on {new Date(adjustment.finalizedAt).toLocaleString()}
              </p>
            ) : null}
            {adjustment.cancelledAt ? (
              <p>
                Cancelled by:{" "}
                <strong className="text-[#0b1f33]">
                  {adjustment.cancelledBy?.fullName || "Staff"}
                </strong>{" "}
                on {new Date(adjustment.cancelledAt).toLocaleString()}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-[#eef1f4] bg-[#f8fafc] px-6 py-4">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>

          {canWrite && !isCancelled ? (
            <div className="flex gap-2">
              {isDraft ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-rose-200 text-rose-600 hover:bg-rose-50"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate()}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Delete Draft
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (onEdit) onEdit(adjustment);
                    }}
                  >
                    <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                    Edit Draft
                  </Button>
                </>
              ) : null}

              {canFinalize ? (
                <Button
                  size="sm"
                  disabled={finalizeMutation.isPending}
                  onClick={() => finalizeMutation.mutate()}
                >
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  Finalize & Apply Stock
                </Button>
              ) : null}

              {isFinalized || isPending ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-rose-200 text-rose-600 hover:bg-rose-50"
                  onClick={() => setShowCancelPrompt(true)}
                >
                  <Ban className="mr-1.5 h-3.5 w-3.5" />
                  {isFinalized
                    ? "Cancel / Reverse Adjustment"
                    : "Cancel Adjustment"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {showCancelPrompt ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#d9e0ea] bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-2 font-semibold text-rose-600">
              <AlertCircle className="h-5 w-5" />
              <span>
                {isFinalized
                  ? "Cancel & Reverse Adjustment"
                  : "Cancel Adjustment"}
              </span>
            </div>
            <p className="mt-2 text-xs text-[#5a6b7d]">
              {isFinalized
                ? "Cancelling a finalized adjustment will automatically reverse inventory levels."
                : "This will mark the adjustment as cancelled."}
            </p>
            <div className="mt-4">
              <label className="block text-xs font-medium text-[#0b1f33]">
                Reason for Cancellation
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Created in error, duplicate entry"
                className="mt-1 w-full rounded-lg border border-[#d9e0ea] p-2 text-xs outline-none focus:border-[#1a56db]"
                rows={3}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowCancelPrompt(false)}
              >
                Go Back
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
              >
                Confirm Cancellation
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  return createPortal(modalBody, document.body);
}
