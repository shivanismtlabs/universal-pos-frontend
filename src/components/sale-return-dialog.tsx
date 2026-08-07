"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ordersApi, posApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { moneyNumber, newIdempotencyKey } from "@/lib/utils";

/**
 * Return / refund a closed Sale ticket — restocks qty + records refund.
 */
export function SaleReturnDialog({
  orderId,
  orderNumber,
  onClose,
}: {
  orderId: string;
  orderNumber: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { money } = useBootstrap();
  const [qtyByLevel, setQtyByLevel] = useState<Record<string, string>>({});
  const [method, setMethod] = useState("cash");
  const [reason, setReason] = useState("");

  const order = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => ordersApi.get(orderId),
  });

  const lines = useMemo(() => {
    const items = order.data?.items ?? [];
    const map = new Map<
      string,
      {
        stockLevelId: string;
        name: string;
        sku: string;
        soldQty: number;
        unitPrice: number;
      }
    >();
    for (const item of items) {
      const sid = item.stockLevelId;
      if (!sid) continue;
      const prev = map.get(sid);
      const qty = moneyNumber(item.quantity ?? 1);
      const price = moneyNumber(item.unitPrice);
      const name = item.description ?? "Item";
      const sku = "";
      if (prev) {
        prev.soldQty += qty;
      } else {
        map.set(sid, {
          stockLevelId: sid,
          name,
          sku,
          soldQty: qty,
          unitPrice: price,
        });
      }
    }
    return [...map.values()];
  }, [order.data]);

  useEffect(() => {
    if (!lines.length) return;
    setQtyByLevel((prev) => {
      const next = { ...prev };
      for (const l of lines) {
        if (next[l.stockLevelId] == null) next[l.stockLevelId] = "0";
      }
      return next;
    });
  }, [lines]);

  const refundPreview = useMemo(() => {
    let total = 0;
    for (const l of lines) {
      const q = Math.min(
        l.soldQty,
        Math.max(0, Math.floor(moneyNumber(qtyByLevel[l.stockLevelId] || 0))),
      );
      total += q * l.unitPrice;
    }
    return Math.round(total * 100) / 100;
  }, [lines, qtyByLevel]);

  const submit = useMutation({
    mutationFn: async () => {
      const items = lines
        .map((l) => ({
          stockLevelId: l.stockLevelId,
          quantity: Math.min(
            l.soldQty,
            Math.max(0, Math.floor(moneyNumber(qtyByLevel[l.stockLevelId] || 0))),
          ),
        }))
        .filter((i) => i.quantity > 0);
      if (!items.length) throw new Error("Select at least one qty to return");
      return posApi.saleReturn({
        orderId,
        items,
        refundMethod: method,
        reason: reason.trim() || undefined,
        idempotencyKey: newIdempotencyKey("sale-return"),
      });
    },
    onSuccess: (r) => {
      toast.success(
        `Refund ${money(r.amount)} · restocked ${r.restocked?.length ?? 0} line(s)`,
      );
      void qc.invalidateQueries({ queryKey: ["pos-sale-recent"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-catalog"] });
      void qc.invalidateQueries({ queryKey: ["order", orderId] });
      onClose();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError
          ? e.messages.join(", ")
          : e instanceof Error
            ? e.message
            : "Return failed",
      ),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0b1f33]/45 p-3 sm:items-center">
      <div
        role="dialog"
        aria-modal
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[14px] border border-[#d9e0ea] bg-white p-4 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Sale return</p>
            <h2 className="mt-1 text-lg font-bold text-[#0b1f33]">
              {orderNumber}
            </h2>
            <p className="mt-0.5 text-sm text-[#5a6b7d]">
              Restock selected qty and refund the customer.
            </p>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>

        {order.isLoading ? (
          <p className="mt-6 text-sm text-[#5a6b7d]">Loading ticket…</p>
        ) : !lines.length ? (
          <p className="mt-6 text-sm text-[#5a6b7d]">
            No returnable stock lines on this sale.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-[#eef2f8]">
            {lines.map((l) => (
              <li
                key={l.stockLevelId}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#0b1f33]">
                    {l.name}
                  </p>
                  <p className="font-mono text-[0.65rem] text-[#8b9bb0]">
                    {l.sku} · sold {l.soldQty} · {money(l.unitPrice)} each
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="sr-only">Return qty</Label>
                  <Input
                    className="h-9 w-20"
                    type="number"
                    min={0}
                    max={l.soldQty}
                    value={qtyByLevel[l.stockLevelId] ?? "0"}
                    onChange={(e) =>
                      setQtyByLevel((m) => ({
                        ...m,
                        [l.stockLevelId]: e.target.value,
                      }))
                    }
                  />
                  <span className="text-xs text-[#8b9bb0]">/ {l.soldQty}</span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Refund method</Label>
            <Select
              className="mt-1.5"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="store_credit">Store credit</option>
            </Select>
          </div>
          <div>
            <Label>Reason (optional)</Label>
            <Input
              className="mt-1.5"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Damaged / wrong item…"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#eef2f8] pt-4">
          <p className="text-sm font-semibold text-[#0b1f33]">
            Refund {money(refundPreview)}
          </p>
          <Button
            type="button"
            disabled={submit.isPending || refundPreview <= 0}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? "Processing…" : "Confirm return"}
          </Button>
        </div>
      </div>
    </div>
  );
}
