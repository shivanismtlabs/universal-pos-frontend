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
        if (next[l.stockLevelId] == null) next[l.stockLevelId] = "0";
      }
      return next;
    });
  }, [lines]);

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
      const q = Math.min(
        l.remaining,
        Math.max(0, moneyNumber(qtyByLevel[l.stockLevelId] || 0)),
      );
      total += q * l.unitPrice;
    }
    return Math.round(total * 100) / 100;
  }, [lines, qtyByLevel]);

  const replacePreview = useMemo(() => {
    if (mode !== "exchange") return 0;
    let total = 0;
    for (const item of catalog.data?.items ?? []) {
      const q = Math.max(0, moneyNumber(replaceQty[item.id] || 0));
      if (q <= 0) continue;
      total += q * moneyNumber(item.sellPrice);
    }
    return Math.round(total * 100) / 100;
  }, [mode, catalog.data, replaceQty]);

  const selectedReturnItems = () =>
    lines
      .map((l) => ({
        stockLevelId: l.stockLevelId,
        quantity: Math.min(
          l.remaining,
          Math.max(0, moneyNumber(qtyByLevel[l.stockLevelId] || 0)),
        ),
        condition: conditionByLevel[l.stockLevelId] || "good",
      }))
      .filter((i) => i.quantity > 0);

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

      if (mode === "exchange") {
        const replaceItems = (catalog.data?.items ?? [])
          .map((c) => ({
            stockLevelId: c.id,
            quantity: Math.max(0, moneyNumber(replaceQty[c.id] || 0)),
          }))
          .filter((i) => i.quantity > 0);
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
                      sold {l.soldQty}
                      {l.alreadyReturned > 0
                        ? ` · returned ${l.alreadyReturned}`
                        : ""}{" "}
                      · left {l.remaining} · {money(l.unitPrice)} each
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Label className="sr-only">Return qty</Label>
                    <Input
                      className="h-9 w-20"
                      type="number"
                      min={0}
                      max={l.remaining}
                      disabled={l.remaining <= 0}
                      value={qtyByLevel[l.stockLevelId] ?? "0"}
                      onChange={(e) =>
                        setQtyByLevel((m) => ({
                          ...m,
                          [l.stockLevelId]: e.target.value,
                        }))
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
                </li>
              ))}
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
              {(catalog.data?.items ?? []).map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 py-2"
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
                  <Input
                    className="h-8 w-16"
                    type="number"
                    min={0}
                    value={replaceQty[c.id] ?? ""}
                    onChange={(e) =>
                      setReplaceQty((m) => ({
                        ...m,
                        [c.id]: e.target.value,
                      }))
                    }
                    placeholder="0"
                  />
                </li>
              ))}
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
              <option value="store_credit">Store credit</option>
            </Select>
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
            onChange={(e) => setReason(e.target.value)}
            placeholder="Extra detail…"
          />
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
            <p className="mt-1 text-[0.7rem] text-[#8a9bb0]">
              Final amount is calculated on the server (tax + discount from the
              original bill). Preview is approximate.
            </p>
          </div>
          <Button
            type="button"
            disabled={
              submit.isPending ||
              refundPreview <= 0 ||
              (mode === "exchange" && replacePreview <= 0)
            }
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
