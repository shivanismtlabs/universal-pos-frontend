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
import { FieldError } from "@/components/ui/form";
import { moneyNumber, newIdempotencyKey, cn } from "@/lib/utils";
import {
  clampQtyInput,
  parseReturnQty,
  replaceQtyError,
  returnQtyError,
} from "@/lib/return-qty-validation";
import { X } from "lucide-react";

/**
 * Return / refund a closed Sale ticket — restocks qty + records refund.
 * Optional exchange mode: return lines + pick replacement SKUs.
 */
export function SaleReturnDialog({
  orderId,
  orderNumber,
  onClose,
  defaultMode = "return",
  onRequested,
}: {
  orderId: string;
  orderNumber: string;
  onClose: () => void;
  defaultMode?: "return" | "exchange";
  onRequested?: () => void;
}) {
  const qc = useQueryClient();
  const { money } = useBootstrap();
  const [mode, setMode] = useState<"return" | "exchange">(defaultMode);
  const [qtyByLevel, setQtyByLevel] = useState<Record<string, string>>({});
  const [conditionByLevel, setConditionByLevel] = useState<
    Record<string, string>
  >({});
  const [method, setMethod] = useState("cash");
  const [reasonCode, setReasonCode] = useState("");
  const [reason, setReason] = useState("");
  const [catalogQ, setCatalogQ] = useState("");
  const [replaceQty, setReplaceQty] = useState<Record<string, string>>({});
  const [replaceQtyErrors, setReplaceQtyErrors] = useState<
    Record<string, string | undefined>
  >({});

  const order = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => ordersApi.get(orderId),
  });

  const reasons = useQuery({
    queryKey: ["refund-reasons"],
    queryFn: async () => {
      const list = await posApi.listRefundReasons();
      if (!list.length) {
        await posApi.seedRefundReasons();
        return posApi.listRefundReasons();
      }
      return list;
    },
  });

  const returnedQty = useQuery({
    queryKey: ["returned-qty", orderId],
    queryFn: () => posApi.returnedQuantities(orderId),
  });

  const remainingRefundable = returnedQty.data?.remainingRefundable;

  const catalog = useQuery({
    queryKey: ["sale-return-catalog", catalogQ],
    queryFn: () =>
      posApi.saleCatalog({ q: catalogQ.trim() || undefined, limit: 20 }),
    enabled: mode === "exchange",
  });

  const lines = useMemo(() => {
    const items = order.data?.items ?? [];
    const already = returnedQty.data?.byStockLevelId ?? {};
    const map = new Map<
      string,
      {
        stockLevelId: string;
        name: string;
        soldQty: number;
        alreadyReturned: number;
        remaining: number;
        unitPrice: number;
      }
    >();
    for (const item of items) {
      const sid = item.stockLevelId;
      if (!sid) continue;
      const prev = map.get(sid);
      const qty = moneyNumber(item.quantity ?? 1);
      const price = moneyNumber(item.unitPrice);
        const name =
          item.description ||
          item.product?.name ||
          item.stockLevel?.product?.name ||
          "Item";
      if (prev) {
        prev.soldQty += qty;
        prev.remaining = Math.max(
          0,
          prev.soldQty - (already[sid] ?? prev.alreadyReturned),
        );
      } else {
        const ar = already[sid] ?? 0;
        map.set(sid, {
          stockLevelId: sid,
          name,
          soldQty: qty,
          alreadyReturned: ar,
          remaining: Math.max(0, qty - ar),
          unitPrice: price,
        });
      }
    }
    return [...map.values()];
  }, [order.data, returnedQty.data]);

  useEffect(() => {
    if (!lines.length) return;
    setQtyByLevel((prev) => {
      const next = { ...prev };
      for (const l of lines) {
        next[l.stockLevelId] = clampQtyInput(
          prev[l.stockLevelId] ?? "0",
          l.remaining,
        );
      }
      return next;
    });
  }, [lines]);

  useEffect(() => {
    if (method === "store_credit" && !order.data?.customer?.id) {
      setMethod("cash");
    }
  }, [method, order.data?.customer?.id]);

  useEffect(() => {
    if (reasonCode || !reasons.data?.length) return;
    const preferred =
      mode === "exchange"
        ? reasons.data.find((r) => r.code === "exchange")
        : reasons.data[0];
    setReasonCode((preferred ?? reasons.data[0]).code);
  }, [reasons.data, reasonCode, mode]);

  const refundPreview = useMemo(() => {
    let total = 0;
    for (const l of lines) {
      const n = parseReturnQty(qtyByLevel[l.stockLevelId] ?? "0");
      if (n === null || n <= 0) continue;
      const q = Math.min(l.remaining, n);
      total += q * l.unitPrice;
    }
    return Math.round(total * 100) / 100;
  }, [lines, qtyByLevel]);

  const replacePreview = useMemo(() => {
    if (mode !== "exchange") return 0;
    let total = 0;
    for (const item of catalog.data?.items ?? []) {
      const n = parseReturnQty(replaceQty[item.id] ?? "0");
      if (n === null || n <= 0) continue;
      const q = Math.min(item.qtyOnHand, n);
      total += q * moneyNumber(item.sellPrice);
    }
    return Math.round(total * 100) / 100;
  }, [mode, catalog.data, replaceQty]);

  const returnQtyErrors = useMemo(() => {
    const out: Record<string, string | undefined> = {};
    for (const l of lines) {
      out[l.stockLevelId] = returnQtyError(
        qtyByLevel[l.stockLevelId] ?? "0",
        l.remaining,
      );
    }
    return out;
  }, [lines, qtyByLevel]);

  const hasInvalidReturnQty = Object.values(returnQtyErrors).some(Boolean);

  const hasInvalidReplaceQty = useMemo(() => {
    if (mode !== "exchange") return false;
    for (const item of catalog.data?.items ?? []) {
      const err = replaceQtyError(
        replaceQty[item.id] ?? "0",
        item.qtyOnHand,
      );
      if (err) return true;
    }
    return false;
  }, [mode, catalog.data, replaceQty]);

  const refundableExceeded =
    remainingRefundable != null &&
    refundPreview > remainingRefundable + 0.009;

  const storeCreditBlocked =
    method === "store_credit" &&
    mode === "return" &&
    !order.data?.customer?.id;

  const noteTooLong = reason.trim().length > 500;

  const selectedReturnItems = () => {
    const items: Array<{
      stockLevelId: string;
      quantity: number;
      condition: string;
    }> = [];
    for (const l of lines) {
      const raw = qtyByLevel[l.stockLevelId] ?? "0";
      const err = returnQtyError(raw, l.remaining);
      if (err) throw new Error(`${l.name}: ${err}`);
      const parsed = parseReturnQty(raw);
      if (parsed === null || parsed <= 0) continue;
      if (parsed > l.remaining + 1e-9) {
        throw new Error(
          `Return qty for "${l.name}" cannot exceed ${l.remaining}`,
        );
      }
      items.push({
        stockLevelId: l.stockLevelId,
        quantity: Math.min(l.remaining, parsed),
        condition: conditionByLevel[l.stockLevelId] || "good",
      });
    }
    return items;
  };

  const selectedReplaceItems = () => {
    const items: Array<{ stockLevelId: string; quantity: number }> = [];
    for (const c of catalog.data?.items ?? []) {
      const raw = replaceQty[c.id] ?? "0";
      const err = replaceQtyError(raw, c.qtyOnHand);
      if (err) throw new Error(`${c.name}: ${err}`);
      const parsed = parseReturnQty(raw);
      if (parsed === null || parsed <= 0) continue;
      items.push({
        stockLevelId: c.id,
        quantity: Math.min(c.qtyOnHand, parsed),
      });
    }
    return items;
  };

  function setReturnQty(stockLevelId: string, raw: string, max: number) {
    setQtyByLevel((m) => ({
      ...m,
      [stockLevelId]: clampQtyInput(raw, max),
    }));
  }

  function setReplaceQtyForItem(stockLevelId: string, raw: string, maxSoh: number) {
    const clamped = clampQtyInput(raw, maxSoh, { min: 0 });
    setReplaceQty((m) => ({ ...m, [stockLevelId]: clamped }));
    setReplaceQtyErrors((m) => ({
      ...m,
      [stockLevelId]: replaceQtyError(clamped, maxSoh),
    }));
  }

  const refundAll = () => {
    const next: Record<string, string> = {};
    for (const l of lines) {
      next[l.stockLevelId] = String(l.remaining);
    }
    setQtyByLevel(next);
  };

  const submit = useMutation({
    mutationFn: async (): Promise<
      | {
          kind: "return";
          status?: string;
          message?: string;
          amount?: string | number;
          storeCreditBalance?: number | null;
          restocked?: Array<{ stockLevelId: string; quantity: number }>;
        }
      | {
          kind: "exchange";
          message?: string;
          net: number;
          orderNumber: string;
          invoiceNumber?: string | null;
          exchangeOrderId?: string;
        }
    > => {
      const items = selectedReturnItems();
      if (!items.length) throw new Error("Select at least one qty to return");
      if (!reasonCode) throw new Error("Select a refund reason");
      if (refundableExceeded) {
        throw new Error(
          `Refund ${refundPreview.toFixed(2)} exceeds remaining refundable ${moneyNumber(remainingRefundable).toFixed(2)}`,
        );
      }
      if (storeCreditBlocked) {
        throw new Error(
          "Store credit refund needs a customer on the original sale",
        );
      }
      if (noteTooLong) {
        throw new Error("Note must be 500 characters or less");
      }

      if (mode === "exchange") {
        const replaceItems = selectedReplaceItems();
        if (!replaceItems.length) {
          throw new Error("Pick at least one replacement item");
        }
        const settle =
          method === "original" ? "cash" : method;
        const r = await posApi.saleExchange({
          orderId,
          returnItems: items,
          replaceItems,
          settleMethod: settle,
          reasonCode,
          reason: reason.trim() || undefined,
          idempotencyKey: newIdempotencyKey("sale-exchange"),
        });
        return {
          kind: "exchange",
          message: r.message,
          net: r.replacement.net,
          orderNumber: r.replacement.orderNumber,
          invoiceNumber: r.replacement.invoiceNumber ?? null,
          exchangeOrderId: r.replacement.orderId,
        };
      }

      const r = await posApi.saleReturn({
        orderId,
        items,
        refundMethod: method,
        reasonCode,
        reason: reason.trim() || undefined,
        idempotencyKey: newIdempotencyKey("sale-return"),
      });
      return { kind: "return", ...r };
    },
    onSuccess: (r) => {
      if (r.kind === "exchange") {
        toast.success(
          r.message ||
            `✓ Exchange Completed · net ${money(r.net)} · ${r.orderNumber}${
              r.invoiceNumber ? ` · ${r.invoiceNumber}` : ""
            }`,
        );
      } else if (r.status === "pending" || r.status === "requested") {
        toast.success(
          r.message ||
            `Return requested — awaiting approval · ${money(r.amount ?? 0)}`,
        );
        onRequested?.();
      } else {
        const credit =
          r.storeCreditBalance != null
            ? ` · store credit bal ${money(r.storeCreditBalance)}`
            : "";
        toast.success(
          r.message ||
            `✓ Return Completed · ${money(r.amount)}${credit}`,
        );
      }
      void qc.invalidateQueries({ queryKey: ["pos-sale-recent"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-catalog"] });
      void qc.invalidateQueries({ queryKey: ["order", orderId] });
      void qc.invalidateQueries({ queryKey: ["customers"] });
      void qc.invalidateQueries({ queryKey: ["sale-returns-list"] });
      void qc.invalidateQueries({ queryKey: ["returned-qty", orderId] });
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

  const canSubmit =
    !submit.isPending &&
    !order.isLoading &&
    !returnedQty.isLoading &&
    lines.length > 0 &&
    !hasInvalidReturnQty &&
    !hasInvalidReplaceQty &&
    !refundableExceeded &&
    !storeCreditBlocked &&
    !noteTooLong &&
    Boolean(reasonCode) &&
    refundPreview > 0 &&
    (mode !== "exchange" || replacePreview > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-[#0b1f33]/45"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[14px] border border-[#d9e0ea] bg-white p-4 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">
              {mode === "exchange" ? "Sale exchange" : "Sale return"}
            </p>
            <h2 className="mt-1 text-lg font-bold text-[#0b1f33]">
              {orderNumber}
            </h2>
            <p className="mt-0.5 text-sm text-[#5a6b7d]">
              {mode === "exchange"
                ? "Give items back, then sell new ones. Pay or refund the difference."
                : "Give items back to stock and return money to the customer."}
            </p>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5a6b7d] hover:bg-[#f1f5f9]"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex gap-1 rounded-[10px] bg-[#eef2f8] p-1">
          {(
            [
              ["return", "Refund"],
              ["exchange", "Exchange"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={
                mode === id
                  ? "flex-1 rounded-[8px] bg-white px-3 py-1.5 text-sm font-semibold text-[#0b1f33] shadow-sm"
                  : "flex-1 rounded-[8px] px-3 py-1.5 text-sm font-semibold text-[#5a6b7d]"
              }
            >
              {label}
            </button>
          ))}
        </div>

        {order.isLoading || returnedQty.isLoading ? (
          <p className="mt-6 text-sm text-[#5a6b7d]">Loading ticket…</p>
        ) : !lines.length ? (
          <p className="mt-6 text-sm text-[#5a6b7d]">
            No returnable stock lines on this sale.
          </p>
        ) : (
          <>
            <div className="mt-3 flex justify-end">
              <Button type="button" size="sm" variant="secondary" onClick={refundAll}>
                Refund all lines
              </Button>
            </div>
            <ul className="mt-2 divide-y divide-[#eef2f8]">
              {lines.map((l) => {
                const qtyRaw = qtyByLevel[l.stockLevelId] ?? "0";
                const qtyErr = returnQtyErrors[l.stockLevelId];
                return (
                <li
                  key={l.stockLevelId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#0b1f33]">
                      {l.name}
                    </p>
                    <p className="font-mono text-[0.65rem] text-[#8b9bb0]">
                      sold {l.soldQty}
                      {l.alreadyReturned > 0
                        ? ` · returned ${l.alreadyReturned}`
                        : ""}{" "}
                      · left {l.remaining} · {money(l.unitPrice)} each
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                    <Label className="sr-only">Return qty</Label>
                    <Input
                      className={cn(
                        "h-9 w-20",
                        qtyErr && "border-rose-400 focus:border-rose-500",
                      )}
                      type="number"
                      min={0}
                      max={l.remaining}
                      step={Number.isInteger(l.remaining) ? 1 : "any"}
                      disabled={l.remaining <= 0}
                      value={qtyRaw}
                      onChange={(e) =>
                        setReturnQty(l.stockLevelId, e.target.value, l.remaining)
                      }
                      onBlur={(e) =>
                        setReturnQty(l.stockLevelId, e.target.value, l.remaining)
                      }
                    />
                    <span className="text-xs text-[#8b9bb0]">
                      / {l.remaining}
                    </span>
                    <Select
                      className="h-9 w-32"
                      value={conditionByLevel[l.stockLevelId] ?? "good"}
                      onChange={(e) =>
                        setConditionByLevel((m) => ({
                          ...m,
                          [l.stockLevelId]: e.target.value,
                        }))
                      }
                    >
                      <option value="good">Good / resellable</option>
                      <option value="damaged">Damaged</option>
                      <option value="defective">Defective</option>
                      <option value="opened">Opened</option>
                      <option value="used">Used</option>
                      <option value="quarantine">Quarantine</option>
                      <option value="scrap">Scrap</option>
                    </Select>
                    </div>
                    <FieldError message={qtyErr} />
                  </div>
                </li>
              );
              })}
            </ul>
          </>
        )}

        {mode === "exchange" ? (
          <div className="mt-4 rounded-[12px] border border-[#e5e7eb] p-3">
            <Label>Replacement items</Label>
            <Input
              className="mt-1.5"
              value={catalogQ}
              onChange={(e) => setCatalogQ(e.target.value)}
              placeholder="Search catalog…"
            />
            <ul className="mt-2 max-h-40 divide-y divide-[#f3f4f6] overflow-y-auto text-sm">
              {(catalog.data?.items ?? []).map((c) => {
                const repRaw = replaceQty[c.id] ?? "";
                const repErr =
                  replaceQtyErrors[c.id] ??
                  replaceQtyError(repRaw, c.qtyOnHand);
                return (
                <li
                  key={c.id}
                  className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[#111827]">
                      {c.name}
                    </p>
                    <p className="text-xs text-[#6b7280]">
                      {c.productSku ?? c.sku} · {money(c.sellPrice)} · SOH{" "}
                      {c.qtyOnHand}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <Input
                        className={cn(
                          "h-8 w-16",
                          repErr && "border-rose-400 focus:border-rose-500",
                        )}
                        type="number"
                        min={0}
                        max={c.qtyOnHand}
                        step={Number.isInteger(c.qtyOnHand) ? 1 : "any"}
                        value={repRaw}
                        onChange={(e) =>
                          setReplaceQtyForItem(c.id, e.target.value, c.qtyOnHand)
                        }
                        onBlur={(e) =>
                          setReplaceQtyForItem(c.id, e.target.value, c.qtyOnHand)
                        }
                        placeholder="0"
                      />
                      <span className="text-xs text-[#8b9bb0]">
                        / {c.qtyOnHand}
                      </span>
                    </div>
                    <FieldError message={repErr} />
                  </div>
                </li>
              );
              })}
              {!catalog.isLoading && !(catalog.data?.items ?? []).length ? (
                <li className="py-3 text-center text-[#6b7280]">No items</li>
              ) : null}
            </ul>
            <p className="mt-2 text-xs text-[#5a6b7d]">
              Return {money(refundPreview)} · Replace {money(replacePreview)} ·
              Net {money(replacePreview - refundPreview)}
            </p>
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <Label>
              {mode === "exchange" ? "Settle method" : "Refund method"}
            </Label>
            <Select
              className="mt-1.5"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              {mode === "return" ? (
                <option value="original">Original payment method</option>
              ) : null}
              <option value="store_credit" disabled={!order.data?.customer?.id}>
                Store credit
                {!order.data?.customer?.id ? " (needs customer)" : ""}
              </option>
            </Select>
            {storeCreditBlocked ? (
              <FieldError message="Add a customer to the original sale to refund as store credit" />
            ) : null}
          </div>
          <div>
            <Label>Reason</Label>
            <Select
              className="mt-1.5"
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
            >
              {(reasons.data ?? []).map((r) => (
                <option key={r.id} value={r.code}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="mt-3">
          <Label>Note (optional)</Label>
          <Input
            className="mt-1.5"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Extra detail…"
          />
          {noteTooLong ? (
            <FieldError message="Note must be 500 characters or less" />
          ) : (
            <p className="mt-1 text-[0.7rem] text-[#8a9bb0]">
              {reason.trim().length}/500
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#eef2f8] pt-4">
          <div>
            <p className="text-sm font-semibold text-[#0b1f33]">
              {mode === "exchange"
                ? `Net ${money(replacePreview - refundPreview)}`
                : `Refund ${money(refundPreview)}`}
            </p>
            {remainingRefundable != null ? (
              <p className="text-xs text-[#5a6b7d]">
                Remaining refundable {money(remainingRefundable)}
              </p>
            ) : null}
            {refundableExceeded ? (
              <FieldError
                message={`Refund exceeds remaining refundable ${money(remainingRefundable ?? 0)}`}
              />
            ) : null}
            {hasInvalidReturnQty ? (
              <FieldError message="Fix return quantities above the max allowed" />
            ) : null}
            {mode === "exchange" && hasInvalidReplaceQty ? (
              <FieldError message="Fix replacement quantities — check stock on hand" />
            ) : null}
            {!reasonCode && !reasons.isLoading ? (
              <FieldError message="Select a refund reason" />
            ) : null}
            <p className="mt-1 text-[0.7rem] text-[#8a9bb0]">
              Final amount is calculated on the server (tax + discount from the
              original bill). Preview is approximate.
            </p>
          </div>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => submit.mutate()}
          >
            {submit.isPending
              ? "Processing…"
              : mode === "exchange"
                ? "Confirm exchange"
                : "Confirm return"}
          </Button>
        </div>
      </div>
    </div>
  );
}
