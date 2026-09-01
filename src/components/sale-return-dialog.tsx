"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { BarcodeScanInput } from "@/components/barcode-scan-input";
import {
  Barcode,
  Minus,
  Plus,
  X,
  Search,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Printer,
  Package,
} from "lucide-react";
import { ReceiptModal } from "@/components/receipt-modal";

/**
 * Return / refund a closed Sale ticket — restocks qty + records refund.
 * Optional exchange mode: return lines + pick replacement SKUs via Barcode / SKU scan.
 */
export function SaleReturnDialog({
  orderId,
  orderNumber,
  onClose,
  defaultMode = "return",
  onRequested,
  onCompleted,
}: {
  orderId: string;
  orderNumber: string;
  onClose: () => void;
  defaultMode?: "return" | "exchange";
  onRequested?: () => void;
  /** After completed refund or exchange — e.g. jump to History tab */
  onCompleted?: () => void;
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
  const [barcodeInput, setBarcodeInput] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scannedItems, setScannedItems] = useState<Array<any>>([]);
  const [completedExchange, setCompletedExchange] = useState<{
    originalOrderNumber: string;
    creditNoteId: string;
    replacementOrderNumber: string;
    replacementInvoiceNumber: string;
    replacementOrderId: string;
    returnedValue: number;
    replacementValue: number;
    net: number;
  } | null>(null);
  const [printExchangeOrderId, setPrintExchangeOrderId] = useState<string | null>(null);
  const [replaceQty, setReplaceQty] = useState<Record<string, string>>({});
  const [replaceQtyErrors, setReplaceQtyErrors] = useState<
    Record<string, string | undefined>
  >({});

  const order = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => ordersApi.get(orderId),
  });

  const printExchangeReceiptQ = useQuery({
    queryKey: ["order-receipt", printExchangeOrderId],
    queryFn: () => ordersApi.get(printExchangeOrderId!),
    enabled: Boolean(printExchangeOrderId),
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

  const handleBarcodeScan = async (codeToSearch?: string) => {
    const code = (codeToSearch ?? barcodeInput).trim();
    if (!code) return;
    setScanError(null);
    setIsScanning(true);
    try {
      const res = await posApi.saleCatalog({ q: code, limit: 10, forPurchase: true });
      const items = res.items ?? [];
      if (!items.length) {
        setScanError("Product not found");
        return;
      }
      const match =
        items.find((i: any) => i.product?.barcode === code || i.barcode === code) ??
        items.find((i: any) => i.product?.skuCode === code || i.sku === code || i.productSku === code) ??
        items[0];

      if (!match) {
        setScanError("Product not found");
        return;
      }

      if (match.qtyOnHand <= 0) {
        setScannedItems((prev) => {
          if (prev.some((p) => p.id === match.id)) return prev;
          return [match, ...prev];
        });
        setScanError(`"${match.name}" is Out of Stock (Available Stock: 0)`);
        return;
      }

      setScannedItems((prev) => {
        if (prev.some((p) => p.id === match.id)) return prev;
        return [match, ...prev];
      });

      const currentQtyN = parseReturnQty(replaceQty[match.id] ?? "0") ?? 0;
      const nextQty = Math.min(match.qtyOnHand, currentQtyN + 1);
      setReplaceQtyForItem(match.id, String(nextQty), match.qtyOnHand);
      setBarcodeInput("");
    } catch (err) {
      setScanError("Product not found");
    } finally {
      setIsScanning(false);
    }
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
          returnEventId?: string;
          returnAmount?: number;
          replaceTotal?: number;
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
        const r = (await posApi.saleExchange({
          orderId,
          returnItems: items,
          replaceItems,
          settleMethod: settle,
          reasonCode,
          reason: reason.trim() || undefined,
          idempotencyKey: newIdempotencyKey("sale-exchange"),
        })) as any;
        return {
          kind: "exchange",
          message: r.message,
          net: r.replacement?.net ?? 0,
          orderNumber: r.replacement?.orderNumber ?? "",
          invoiceNumber: r.replacement?.invoiceNumber ?? null,
          exchangeOrderId: r.replacement?.orderId ?? "",
          returnEventId: r.return?.returnEventId ?? r.links?.returnEventId ?? "",
          returnAmount: r.return?.amount ?? r.replacement?.returnAmount ?? refundPreview,
          replaceTotal: r.replacement?.replaceTotal ?? replacePreview,
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
      void qc.invalidateQueries({ queryKey: ["pos-sale-recent"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-catalog"] });
      void qc.invalidateQueries({ queryKey: ["order", orderId] });
      void qc.invalidateQueries({ queryKey: ["customers"] });
      void qc.invalidateQueries({ queryKey: ["sale-returns-list"] });
      void qc.invalidateQueries({ queryKey: ["returned-qty", orderId] });

      if (r.kind === "exchange") {
        const cNote = r.returnEventId
          ? `CN-${r.returnEventId.slice(-6).toUpperCase()}`
          : `CN-${orderNumber.slice(-6).toUpperCase()}`;
        setCompletedExchange({
          originalOrderNumber: orderNumber,
          creditNoteId: cNote,
          replacementOrderNumber: r.orderNumber,
          replacementInvoiceNumber: r.invoiceNumber ?? `INV-${r.orderNumber}`,
          replacementOrderId: r.exchangeOrderId ?? "",
          returnedValue: r.returnAmount ?? refundPreview,
          replacementValue: r.replaceTotal ?? replacePreview,
          net: r.net,
        });
        toast.success(
          r.message ||
            `✓ Exchange Completed · net ${money(r.net)} · ${r.orderNumber}`,
        );
      } else if (r.status === "pending" || r.status === "requested") {
        toast.success(
          r.message ||
            `Return requested — awaiting approval · ${money(r.amount ?? 0)}`,
        );
        onRequested?.();
        onClose();
      } else {
        const credit =
          r.storeCreditBalance != null
            ? ` · store credit bal ${money(r.storeCreditBalance)}`
            : "";
        toast.success(
          r.message ||
            `✓ Return Completed · ${money(r.amount)}${credit}`,
        );
        onCompleted?.();
        onClose();
      }
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

  if (completedExchange) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center">
        <div
          className="absolute inset-0 bg-[#0b1f33]/45"
          onClick={() => {
            onCompleted?.();
            onClose();
          }}
        />
        <div className="relative z-10 w-full max-w-lg overflow-y-auto rounded-[14px] border border-[#d9e0ea] bg-white p-5 shadow-2xl">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h2 className="mt-3 text-xl font-bold text-[#0b1f33]">
              Exchange Completed Successfully
            </h2>
            <p className="mt-1 text-sm text-[#5a6b7d]">
              Return event, credit note, replacement order, and invoice have been processed.
            </p>
          </div>

          <div className="mt-5 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-4 text-xs space-y-3">
            <div className="grid grid-cols-2 gap-3 border-b border-[#e2e8f0] pb-3">
              <div>
                <span className="text-[#64748b]">Original Order</span>
                <p className="font-bold text-[#0f172a]">{completedExchange.originalOrderNumber}</p>
              </div>
              <div>
                <span className="text-[#64748b]">Return Document / Credit Note</span>
                <p className="font-bold text-[#0f172a]">{completedExchange.creditNoteId}</p>
              </div>
              <div>
                <span className="text-[#64748b]">Replacement Order</span>
                <p className="font-bold text-[#1a56db]">{completedExchange.replacementOrderNumber}</p>
              </div>
              <div>
                <span className="text-[#64748b]">Replacement Invoice</span>
                <p className="font-bold text-[#1a56db]">{completedExchange.replacementInvoiceNumber}</p>
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between">
                <span className="text-[#475569]">Returned Product Value:</span>
                <span className="font-semibold text-[#0f172a] tabular-nums">{money(completedExchange.returnedValue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#475569]">Replacement Value:</span>
                <span className="font-semibold text-[#0f172a] tabular-nums">{money(completedExchange.replacementValue)}</span>
              </div>
              <div className="flex justify-between font-bold border-t border-[#e2e8f0] pt-2 text-sm">
                <span>Net Difference Settlement:</span>
                <span className={cn(
                  "tabular-nums font-extrabold",
                  completedExchange.net > 0 ? "text-amber-700" :
                  completedExchange.net < 0 ? "text-emerald-700" : "text-slate-700"
                )}>
                  {completedExchange.net > 0
                    ? `Customer Paid ${money(completedExchange.net)}`
                    : completedExchange.net < 0
                    ? `Customer Refunded ${money(Math.abs(completedExchange.net))}`
                    : "₹0.00 (Equal Exchange)"}
                </span>
              </div>
            </div>
          </div>

          {completedExchange.replacementOrderId ? (
            <Button
              type="button"
              className="mt-4 w-full bg-[#1a56db] text-white hover:bg-[#1546b3] flex items-center justify-center gap-2 py-2.5 font-bold"
              onClick={() => setPrintExchangeOrderId(completedExchange.replacementOrderId)}
            >
              <Printer className="size-4" /> Print Exchange Bill ({completedExchange.replacementInvoiceNumber})
            </Button>
          ) : null}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link
              href={`/orders/view?id=${orderId}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#d9e0ea] bg-white px-3 py-2 text-xs font-semibold text-[#334155] hover:bg-[#f8fafc]"
              onClick={() => {
                onCompleted?.();
                onClose();
              }}
            >
              View Original Order
            </Link>
            {completedExchange.replacementOrderId ? (
              <Link
                href={`/orders/view?id=${completedExchange.replacementOrderId}`}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#1a56db] bg-[#eef2ff] px-3 py-2 text-xs font-semibold text-[#1a56db] hover:bg-[#e0e7ff]"
                onClick={() => {
                  onCompleted?.();
                  onClose();
                }}
              >
                <ExternalLink className="size-3.5" /> View Replacement Order
              </Link>
            ) : null}
          </div>

          <Button
            type="button"
            className="mt-3 w-full bg-[#0f172a] hover:bg-[#1e293b]"
            onClick={() => {
              onCompleted?.();
              onClose();
            }}
          >
            Done / Close
          </Button>

          {printExchangeOrderId ? (
            <ReceiptModal
              data={(printExchangeReceiptQ.data as any) ?? null}
              loading={printExchangeReceiptQ.isLoading}
              onClose={() => setPrintExchangeOrderId(null)}
            />
          ) : null}
        </div>
      </div>
    );
  }

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
                ? "Give items back, then scan or select replacement SKUs. Pay or refund difference."
                : "Refund uses original sale price, tax, and discounts. Qty cannot exceed returnable."}
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

        {/* Original Order Summary Header Card */}
        <div className="mt-3 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-2.5 text-xs">
          <div className="flex flex-wrap justify-between gap-2 border-b border-[#e2e8f0] pb-2">
            <div>
              <span className="text-[#64748b]">Customer:</span>{" "}
              <span className="font-semibold text-[#0f172a]">
                {order.data?.customer?.fullName ?? "Walk-in Guest"}
              </span>
            </div>
            <div>
              <span className="text-[#64748b]">Invoice #:</span>{" "}
              <span className="font-semibold text-[#0f172a]">
                {(order.data as any)?.invoices?.[0]?.invoiceNumber ?? orderNumber}
              </span>
            </div>
          </div>
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
            <ul className="mt-2 divide-y divide-[#eef2f8] ml-[16px]">
              {lines.map((l) => {
                const qtyRaw = qtyByLevel[l.stockLevelId] ?? "0";
                const qtyErr = returnQtyErrors[l.stockLevelId];
                const qtyN = parseReturnQty(qtyRaw) ?? 0;
                const canDec = l.remaining > 0 && qtyN > 0;
                const canInc =
                  l.remaining > 0 && qtyN < l.remaining - 1e-9;
                return (
                <li
                  key={l.stockLevelId}
                  className="flex flex-wrap items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#0b1f33]">
                      {l.name}
                    </p>
                    <dl className="mt-1 grid grid-cols-3 gap-x-2 text-[0.7rem] text-[#5a6b7d]">
                      <div>
                        <dt className="text-[#8b9bb0]">Sold</dt>
                        <dd className="font-semibold tabular-nums text-[#0b1f33]">
                          {l.soldQty}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[#8b9bb0]">Returned</dt>
                        <dd className="font-semibold tabular-nums text-[#0b1f33]">
                          {l.alreadyReturned}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[#8b9bb0]">Returnable</dt>
                        <dd className="font-semibold tabular-nums text-[#1a56db]">
                          {l.remaining}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-0.5 font-mono text-[0.65rem] text-[#8b9bb0]">
                      {money(l.unitPrice)} each (original sale)
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                    <Label className="sr-only">Return qty</Label>
                    <div className="inline-flex items-center rounded-md border border-[#d9e0ea] bg-white">
                      <button
                        type="button"
                        className="flex h-9 w-8 items-center justify-center text-[#5a6b7d] disabled:opacity-40"
                        disabled={!canDec}
                        aria-label="Decrease return qty"
                        onClick={() =>
                          setReturnQty(
                            l.stockLevelId,
                            String(Math.max(0, qtyN - 1)),
                            l.remaining,
                          )
                        }
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <Input
                        className={cn(
                          "h-9 w-14 border-0 text-center shadow-none focus:shadow-none",
                          qtyErr && "text-rose-600",
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
                      <button
                        type="button"
                        className="flex h-9 w-8 items-center justify-center text-[#5a6b7d] disabled:opacity-40"
                        disabled={!canInc}
                        aria-label="Increase return qty"
                        onClick={() =>
                          setReturnQty(
                            l.stockLevelId,
                            String(Math.min(l.remaining, qtyN + 1)),
                            l.remaining,
                          )
                        }
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
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
                      <option value="refurbish">Refurbish / Quarantine</option>
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
          <div className="mt-4 rounded-[12px] border border-[#e5e7eb] bg-white p-3 space-y-3">
            <div className="space-y-1.5">
              <Label className="font-semibold text-[#0b1f33] text-xs">
                Scan Barcode / Enter SKU
              </Label>
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                <BarcodeScanInput
                  value={barcodeInput}
                  onChange={setBarcodeInput}
                  onScan={(code) => void handleBarcodeScan(code)}
                  placeholder="Scan barcode with POS scanner or type SKU..."
                  inputClassName="h-9 font-mono text-xs uppercase"
                  compact
                  showHint={false}
                  className="min-w-0 flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-9 shrink-0 rounded-lg bg-[#1a56db] hover:bg-[#1546b3] text-xs font-semibold px-3.5 inline-flex items-center justify-center gap-1.5 self-center"
                  onClick={() => void handleBarcodeScan()}
                  disabled={isScanning || !barcodeInput.trim()}
                >
                  {isScanning ? "Scanning…" : "Scan / Search"}
                </Button>
              </div>
              {scanError ? (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-2 text-xs text-rose-700 font-medium flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="size-3.5 text-rose-500" />
                    <span>{scanError}</span>
                  </div>
                  <button type="button" onClick={() => setScanError(null)} className="text-rose-500 hover:text-rose-700">
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : null}
            </div>

            <div className="pt-2 border-t border-[#e2e8f0]">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-[#334155]">Replacement Candidates</span>
                <Input
                  className="h-7 w-40 text-xs"
                  value={catalogQ}
                  onChange={(e) => setCatalogQ(e.target.value)}
                  placeholder="Filter catalog…"
                />
              </div>

              <ul className="max-h-48 divide-y divide-[#f3f4f6] overflow-y-auto text-sm pr-1">
                {[...scannedItems, ...(catalog.data?.items ?? []).filter((i) => !scannedItems.some((s) => s.id === i.id))].map((c) => {
                  const repRaw = replaceQty[c.id] ?? "";
                  const repErr =
                    replaceQtyErrors[c.id] ??
                    replaceQtyError(repRaw, c.qtyOnHand);
                  const isOutOfStock = c.qtyOnHand <= 0;
                  return (
                    <li
                      key={c.id}
                      className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-[#f1f5f9] last:border-0"
                    >
                      <div className="min-w-0 flex items-center gap-2.5">
                        {c.photoUrl ? (
                          <img src={c.photoUrl} alt={c.name} className="size-9 rounded-md object-cover border border-[#e2e8f0]" />
                        ) : (
                          <div className="size-9 rounded-md bg-[#f1f5f9] flex items-center justify-center text-[#94a3b8]">
                            <Package className="size-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[#111827] text-xs sm:text-sm">
                            {c.name}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 text-[0.7rem] text-[#6b7280]">
                            <span>SKU: {c.productSku ?? c.sku}</span>
                            {c.barcode ? <span>· Barcode: {c.barcode}</span> : null}
                            <span>· {money(c.sellPrice)}</span>
                          </div>
                          {isOutOfStock ? (
                            <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-[0.65rem] font-bold text-rose-800 mt-0.5">
                              Out of Stock
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[0.65rem] font-medium text-emerald-700 mt-0.5">
                              Available Stock: {c.qtyOnHand}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 mt-1 sm:mt-0">
                        <div className="flex items-center gap-1.5">
                          <Input
                            className={cn(
                              "h-8 w-16 text-center text-xs font-semibold",
                              repErr && "border-rose-400 focus:border-rose-500 text-rose-600",
                              isOutOfStock && "opacity-50 cursor-not-allowed"
                            )}
                            type="number"
                            min={0}
                            max={c.qtyOnHand}
                            disabled={isOutOfStock}
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
                {!catalog.isLoading && !(catalog.data?.items ?? []).length && !scannedItems.length ? (
                  <li className="py-4 text-center text-[#6b7280] text-xs">No replacement items found</li>
                ) : null}
              </ul>
            </div>

            <div className="mt-3 rounded-lg bg-[#f8fafc] p-3 text-xs space-y-1 text-[#334155] border border-[#e2e8f0]">
              <div className="flex justify-between">
                <span>Returned Product Value:</span>
                <span className="font-semibold tabular-nums">{money(refundPreview)}</span>
              </div>
              <div className="flex justify-between">
                <span>Replacement Selling Value:</span>
                <span className="font-semibold tabular-nums">{money(replacePreview)}</span>
              </div>
              <div className="flex justify-between font-bold border-t border-[#e2e8f0] pt-1.5 mt-1 text-xs sm:text-sm">
                <span>Net Difference:</span>
                <span className={cn(
                  "tabular-nums font-extrabold",
                  replacePreview > refundPreview ? "text-amber-700" :
                  replacePreview < refundPreview ? "text-emerald-700" : "text-slate-700"
                )}>
                  {replacePreview > refundPreview
                    ? `Customer Pays ${money(replacePreview - refundPreview)}`
                    : replacePreview < refundPreview
                    ? `Customer Receives ${money(refundPreview - replacePreview)}`
                    : "₹0.00 (Equal Exchange)"}
                </span>
              </div>
            </div>
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
                ? replacePreview > refundPreview
                  ? `Customer Pays ${money(replacePreview - refundPreview)}`
                  : replacePreview < refundPreview
                  ? `Customer Refund ${money(refundPreview - replacePreview)}`
                  : `Net ${money(0)}`
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
