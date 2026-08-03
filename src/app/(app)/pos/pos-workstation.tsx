"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  customersApi,
  inventoryApi,
  ordersApi,
  paymentsApi,
  posApi,
} from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import {
  ITEMS_MUTABLE_STATUSES,
  ORDER_STATUS_TRANSITIONS,
} from "@/lib/order-status";
import { StripeCheckoutModal } from "@/components/stripe-checkout-modal";
import { ReceiptModal } from "@/components/receipt-modal";
import {
  formatDate,
  formatInr,
  moneyNumber,
  newIdempotencyKey,
  todayYmd,
  toYmd,
  cn,
} from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  enqueueOfflineEvent,
  flushOfflineQueue,
  isOnline,
  pendingOfflineCount,
} from "@/lib/offline-queue";
import { useAuthStore } from "@/lib/auth-store";

type QueueTab = "ready" | "pickup" | "balance" | "all";
type PayMethod = "cash" | "upi" | "card";
type PayType = "payment" | "deposit";

export default function PosWorkstation() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const barcodeRef = useRef<HTMLInputElement>(null);

  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("order"),
  );
  const [findQuery, setFindQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [tab, setTab] = useState<QueueTab>("ready");
  const [method, setMethod] = useState<PayMethod>("upi");
  const [payType, setPayType] = useState<PayType>("payment");
  const [amount, setAmount] = useState("");
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [stripeCheckout, setStripeCheckout] = useState<{
    publishableKey: string;
    clientSecret: string;
    paymentIntentId: string;
    amount: number;
    description: string;
    markReady?: boolean;
  } | null>(null);
  const [scannedUnit, setScannedUnit] = useState<{
    id: string;
    barcodeSku: string;
    size: string;
    rentalPrice: string | number;
    availabilityStatus: string;
    productStyle?: { name: string; styleCode: string };
  } | null>(null);

  const today = todayYmd();

  const queue = useQuery({
    queryKey: ["orders", "terminal"],
    queryFn: () => ordersApi.list({ limit: 100 }),
  });

  const ticket = useQuery({
    queryKey: ["order", selectedId],
    queryFn: () => ordersApi.get(selectedId!),
    enabled: Boolean(selectedId),
  });

  const receipt = useQuery({
    queryKey: ["receipt", selectedId],
    queryFn: () => posApi.receipt(selectedId!),
    enabled: receiptOpen && Boolean(selectedId),
  });

  const stripeConfig = useQuery({
    queryKey: ["stripe-config"],
    queryFn: () => paymentsApi.stripeConfig(),
    staleTime: 60_000,
  });

  const [offlinePending, setOfflinePending] = useState(0);
  const storeId = useAuthStore((s) => s.user?.storeId);

  useEffect(() => {
    const sync = () => setOfflinePending(pendingOfflineCount());
    sync();
    const onOnline = () => {
      void flushOfflineQueue().then((r) => {
        if (r.synced) toast.success(`Synced ${r.synced} offline event(s)`);
        sync();
      });
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    const fromUrl = searchParams.get("order");
    if (fromUrl) setSelectedId(fromUrl);
  }, [searchParams]);

  useEffect(() => {
    if (!ticket.data) return;
    const due = moneyNumber(ticket.data.balanceDue);
    setAmount(due > 0 ? String(due) : "");
  }, [ticket.data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredQueue = useMemo(() => {
    let rows = queue.data?.items ?? [];
    if (tab === "ready") rows = rows.filter((o) => o.status === "ready");
    if (tab === "pickup") {
      rows = rows.filter(
        (o) =>
          toYmd(o.pickupDate) === today &&
          ["reserved", "fitted", "ready"].includes(o.status),
      );
    }
    if (tab === "balance") {
      rows = rows.filter((o) => moneyNumber(o.balanceDue) > 0);
    }
    if (tab === "all") {
      rows = rows.filter((o) => !["closed", "cancelled"].includes(o.status));
    }
    return rows;
  }, [queue.data, tab, today]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["orders"] });
    void qc.invalidateQueries({ queryKey: ["order", selectedId] });
    void qc.invalidateQueries({ queryKey: ["reports"] });
  };

  async function collectViaStripe(opts?: { markReady?: boolean }) {
    if (!selectedId) throw new Error("No ticket");
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      throw new Error("Enter a valid amount");
    }
    if (!stripeConfig.data?.enabled) {
      await posApi.checkout({
        orderId: selectedId,
        markReady: Boolean(opts?.markReady),
        payments: [
          {
            method,
            amount: amt,
            type: payType,
            idempotencyKey: newIdempotencyKey("off"),
          },
        ],
      });
      toast.success(
        opts?.markReady
          ? `${method.toUpperCase()} recorded · ticket ready`
          : `${method.toUpperCase()} payment recorded (offline)`,
      );
      invalidate();
      return;
    }

    setStripeBusy(true);
    try {
      const session = await paymentsApi.createStripeIntent({
        orderId: selectedId,
        amount: amt,
        type: payType,
        method,
      });
      setStripeCheckout({
        publishableKey: session.publishableKey,
        clientSecret: session.clientSecret,
        paymentIntentId: session.paymentIntentId,
        amount: amt,
        description: session.description,
        markReady: opts?.markReady,
      });
    } catch (e) {
      setStripeBusy(false);
      throw e;
    }
  }

  async function finishStripePayment(paymentIntentId: string) {
    if (!selectedId || !stripeCheckout) return;
    await paymentsApi.verifyStripe({
      orderId: selectedId,
      paymentIntentId,
      amount: stripeCheckout.amount,
      type: payType,
      method,
    });
    if (stripeCheckout.markReady) {
      await posApi.checkout({
        orderId: selectedId,
        markReady: true,
        payments: [],
      });
      toast.success("Paid · ticket ready");
    } else {
      toast.success("Stripe payment successful");
    }
    invalidate();
  }

  const takePayment = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("No ticket");
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        throw new Error("Enter a valid amount");
      }

      if (method === "upi" || method === "card") {
        if (!isOnline()) {
          throw new Error("Card/UPI needs internet — use cash or collect later");
        }
        await collectViaStripe();
        return;
      }

      if (!isOnline()) {
        if (!storeId) throw new Error("No store on session for offline queue");
        enqueueOfflineEvent("pos.cash_payment", storeId, {
          orderId: selectedId,
          method,
          amount: amt,
          type: payType,
        });
        setOfflinePending(pendingOfflineCount());
        return { offline: true as const };
      }

      return posApi.checkout({
        orderId: selectedId,
        markReady: false,
        payments: [
          {
            method,
            amount: amt,
            type: payType,
            idempotencyKey: newIdempotencyKey("pay"),
          },
        ],
      });
    },
    onSuccess: (res) => {
      if (res && typeof res === "object" && "offline" in res && res.offline) {
        toast.success("Queued offline — will sync when online");
        return;
      }
      if (method === "cash") {
        toast.success("Cash payment recorded");
        invalidate();
      }
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError
          ? e.messages.join(", ")
          : e instanceof Error
            ? e.message
            : "Payment failed",
      ),
  });

  const checkoutReady = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("No ticket");
      const due = moneyNumber(ticket.data?.balanceDue);
      const amt = Number(amount);

      if ((method === "upi" || method === "card") && Number.isFinite(amt) && amt > 0) {
        await collectViaStripe({ markReady: true });
        return;
      }

      const payments =
        Number.isFinite(amt) && amt > 0
          ? [
              {
                method,
                amount: amt,
                type: payType,
                idempotencyKey: newIdempotencyKey("chk"),
              },
            ]
          : due > 0 && method === "cash"
            ? [
                {
                  method: "cash" as const,
                  amount: due,
                  type: "payment" as const,
                  idempotencyKey: newIdempotencyKey("chk"),
                },
              ]
            : [];

      return posApi.checkout({
        orderId: selectedId,
        markReady: true,
        payments,
      });
    },
    onSuccess: () => {
      if (method === "cash") {
        toast.success("Ticket marked ready");
        invalidate();
      }
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError
          ? e.messages.join(", ")
          : e instanceof Error
            ? e.message
            : "Failed",
      ),
  });

  async function findTicket() {
    const q = findQuery.trim();
    if (!q) return;

    try {
      if (/^\d{10}$/.test(q)) {
        const customers = await customersApi.list({ q, limit: 5 });
        const customer = customers.items[0];
        if (!customer) {
          toast.error("No customer with that phone");
          return;
        }
        const orders = await ordersApi.list({
          customerId: customer.id,
          limit: 20,
        });
        const open = (orders.items ?? []).find(
          (o) => !["closed", "cancelled"].includes(o.status),
        );
        if (!open) {
          toast.error(`No open order for ${customer.fullName}`);
          return;
        }
        setSelectedId(open.id);
        toast.success(`Loaded ${open.orderNumber}`);
        return;
      }

      const byNumber = await ordersApi.list({ q, limit: 10 });
      const hit = byNumber.items[0];
      if (!hit) {
        toast.error("Order not found");
        return;
      }
      setSelectedId(hit.id);
      toast.success(`Loaded ${hit.orderNumber}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Find failed");
    }
  }

  async function scanBarcode() {
    const sku = barcode.trim().toUpperCase();
    if (!sku) return;
    try {
      const res = await inventoryApi.listUnits({ barcodeSku: sku, limit: 1 });
      const unit = res.items[0];
      if (!unit) {
        toast.error("Barcode not in inventory");
        setScannedUnit(null);
        return;
      }
      setScannedUnit(unit);
      setBarcode("");
      toast.success(`${unit.barcodeSku} · ${unit.productStyle?.name ?? "Unit"}`);
      barcodeRef.current?.focus();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Scan failed");
    }
  }

  const addScanned = useMutation({
    mutationFn: async () => {
      if (!selectedId || !scannedUnit) throw new Error("Select ticket + scan");
      return ordersApi.addItem(selectedId, {
        itemType: "rental_unit",
        inventoryUnitId: scannedUnit.id,
      });
    },
    onSuccess: () => {
      toast.success("Garment added to ticket");
      setScannedUnit(null);
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Add failed"),
  });

  const handover = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("No ticket");
      const status = ticket.data?.status;
      if (status === "ready") {
        return ordersApi.updateStatus(selectedId, "checked_out");
      }
      if (status === "reserved" || status === "fitted") {
        await posApi.checkout({
          orderId: selectedId,
          markReady: true,
          payments: [],
        });
        return ordersApi.updateStatus(selectedId, "checked_out");
      }
      throw new Error("Move ticket to ready before handover");
    },
    onSuccess: () => {
      toast.success("Garments checked out — customer has them");
      invalidate();
      setReceiptOpen(true);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError
          ? e.messages.join(", ")
          : e instanceof Error
            ? e.message
            : "Handover failed",
      ),
  });

  const advance = useMutation({
    mutationFn: (status: string) => ordersApi.updateStatus(selectedId!, status),
    onSuccess: (_, status) => {
      toast.success(`Status → ${status}`);
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const data = ticket.data;
  const balance = moneyNumber(data?.balanceDue);
  const settled = Boolean(data) && balance <= 0;
  const credit = settled ? Math.abs(balance) : 0;
  const canAddItems = data ? ITEMS_MUTABLE_STATUSES.has(data.status) : false;
  const nextStatuses = data
    ? (ORDER_STATUS_TRANSITIONS[data.status] ?? []).filter(
        (s) => s !== "cancelled",
      )
    : [];

  const payLabel = settled
    ? null
    : method === "cash"
      ? "Collect cash"
      : stripeBusy
        ? "Opening Stripe…"
        : stripeConfig.data?.enabled
          ? `Charge ${method.toUpperCase()}`
          : `Record ${method.toUpperCase()}`;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="display mr-auto text-xl text-[#111827]">Terminal</h1>
        {!isOnline() || offlinePending > 0 ? (
          <span className="rounded bg-amber-50 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-900">
            {!isOnline()
              ? "Offline mode"
              : `${offlinePending} pending sync`}
          </span>
        ) : null}
        <Input
          className="h-8 w-44 text-sm"
          placeholder="Order or phone"
          value={findQuery}
          onChange={(e) => setFindQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void findTicket();
            }
          }}
        />
        <Input
          ref={barcodeRef}
          className="h-8 w-40 font-mono text-sm"
          placeholder="Scan SKU"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void scanBarcode();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          className="h-8"
          onClick={() => void findTicket()}
        >
          Load
        </Button>
      </div>

      {scannedUnit ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#99f6e4]/70 bg-[#ecfdf8] px-3 py-1.5 text-sm">
          <p className="min-w-0 truncate">
            <span className="font-semibold">{scannedUnit.barcodeSku}</span>
            <span className="text-[#6b7280]">
              {" "}
              · {scannedUnit.productStyle?.name ?? "Unit"} · {scannedUnit.size} ·{" "}
              {formatInr(scannedUnit.rentalPrice)}
            </span>
          </p>
          <div className="flex gap-1.5">
            {canAddItems ? (
              <Button
                type="button"
                size="sm"
                className="h-7"
                disabled={addScanned.isPending}
                onClick={() => addScanned.mutate()}
              >
                Add
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7"
              onClick={() => setScannedUnit(null)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid overflow-hidden rounded-xl border border-[#e5e7eb] bg-white lg:grid-cols-[13.5rem_minmax(0,1fr)]">
        {/* Queue */}
        <aside className="border-b border-[#e5e7eb] lg:border-r lg:border-b-0">
          <div className="flex gap-0.5 border-b border-[#e5e7eb] p-1.5">
            {(
              [
                ["ready", "Ready"],
                ["pickup", "Today"],
                ["balance", "Due"],
                ["all", "Open"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "flex-1 rounded px-1 py-1 text-[0.65rem] font-medium transition",
                  tab === key
                    ? "bg-[#111827] text-white"
                    : "text-[#6b7280] hover:bg-[#f3f4f6]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <ul className="max-h-[22rem] overflow-y-auto lg:max-h-[calc(100vh-12rem)]">
            {filteredQueue.map((o) => {
              const active = selectedId === o.id;
              return (
                <li key={o.id} className="border-b border-[#f3f4f6] last:border-0">
                  <button
                    type="button"
                    onClick={() => setSelectedId(o.id)}
                    className={cn(
                      "w-full px-2.5 py-2 text-left",
                      active ? "bg-[#ecfdf8]" : "hover:bg-[#f9fafb]",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-1">
                      <p
                        className={cn(
                          "truncate text-[0.8rem] font-semibold",
                          active ? "text-[#0f766e]" : "text-[#111827]",
                        )}
                      >
                        {o.orderNumber.replace(/^ORD-/, "")}
                      </p>
                      <span className="shrink-0 text-[0.7rem] tabular-nums text-[#4b5563]">
                        {formatInr(o.balanceDue)}
                      </span>
                    </div>
                    <p className="truncate text-[0.7rem] text-[#6b7280]">
                      {o.customer?.fullName ?? "—"}
                    </p>
                  </button>
                </li>
              );
            })}
            {!filteredQueue.length ? (
              <li className="px-3 py-8 text-center text-xs text-[#6b7280]">
                Empty
              </li>
            ) : null}
          </ul>
        </aside>

        {/* Ticket + pay */}
        <div className="flex min-h-[28rem] flex-col">
          {!selectedId ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <div>
                <p className="text-sm font-medium text-[#111827]">
                  No ticket selected
                </p>
                <p className="mt-1 text-xs text-[#6b7280]">
                  Search above or pick from the queue
                </p>
              </div>
            </div>
          ) : ticket.isLoading ? (
            <p className="p-4 text-sm text-[#6b7280]">Loading…</p>
          ) : !data ? (
            <p className="p-4 text-sm text-red-600">Could not load ticket</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e5e7eb] px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-[#111827]">
                      {data.orderNumber}
                    </h2>
                    <span className="rounded bg-[#f3f4f6] px-1.5 py-0.5 text-[0.65rem] font-medium tracking-wide text-[#4b5563] uppercase">
                      {data.status.replaceAll("_", " ")}
                    </span>
                    {settled ? (
                      <span className="rounded bg-[#ecfdf8] px-1.5 py-0.5 text-[0.65rem] font-medium text-[#0f766e]">
                        Paid
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-sm text-[#374151]">
                    {data.customer?.fullName}
                    {data.customer?.phone ? ` · ${data.customer.phone}` : ""}
                  </p>
                  <p className="text-[0.7rem] text-[#6b7280]">
                    {formatDate(data.pickupDate)} → {formatDate(data.returnDueDate)}
                  </p>
                </div>
                <div className="flex items-start gap-4 text-right">
                  <div>
                    <p className="text-[0.6rem] font-medium tracking-wide text-[#9ca3af] uppercase">
                      Due
                    </p>
                    <p
                      className={cn(
                        "text-lg font-semibold tabular-nums",
                        settled ? "text-[#0f766e]" : "text-[#111827]",
                      )}
                    >
                      {settled
                        ? credit > 0
                          ? formatInr(credit)
                          : formatInr(0)
                        : formatInr(balance)}
                    </p>
                  </div>
                  <Link
                    href={`/orders/${data.id}`}
                    className="pt-1 text-xs font-medium text-[#0f766e] hover:underline"
                  >
                    Details
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-3 divide-x divide-[#e5e7eb] border-b border-[#e5e7eb] bg-[#fafafa] text-sm">
                {[
                  ["Balance", formatInr(data.balanceDue)],
                  ["Deposit", formatInr(data.depositTotal)],
                  ["Subtotal", formatInr(data.subtotal)],
                ].map(([k, v]) => (
                  <div key={k} className="px-3 py-2">
                    <p className="text-[0.6rem] font-medium tracking-wide text-[#9ca3af] uppercase">
                      {k}
                    </p>
                    <p className="font-semibold tabular-nums text-[#111827]">
                      {v}
                    </p>
                  </div>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-white text-[0.65rem] tracking-wide text-[#9ca3af] uppercase">
                    <tr className="border-b border-[#e5e7eb]">
                      <th className="px-4 py-2 font-medium">Item</th>
                      <th className="px-2 py-2 font-medium">Size</th>
                      <th className="px-4 py-2 text-right font-medium">Rent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-[#f3f4f6]"
                      >
                        <td className="px-4 py-2 font-medium text-[#111827]">
                          {item.inventoryUnit?.barcodeSku ??
                            item.retailSku?.sku ??
                            item.itemType}
                        </td>
                        <td className="px-2 py-2 text-[#6b7280]">
                          {item.size ?? item.inventoryUnit?.size ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatInr(item.unitPrice)}
                        </td>
                      </tr>
                    ))}
                    {!data.items.length ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-4 py-8 text-center text-[#6b7280]"
                        >
                          Scan a barcode to add garments
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {nextStatuses.length ? (
                <div className="flex flex-wrap gap-1 border-t border-[#e5e7eb] px-3 py-2">
                  {nextStatuses.map((s) => (
                    <Button
                      key={s}
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs"
                      disabled={advance.isPending}
                      onClick={() => advance.mutate(s)}
                    >
                      → {s.replaceAll("_", " ")}
                    </Button>
                  ))}
                </div>
              ) : null}

              {/* Compact pay strip */}
              <div className="border-t border-[#e5e7eb] bg-[#fafafa] px-3 py-2.5">
                {!settled ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex shrink-0 gap-0.5 rounded-md bg-[#f3f4f6] p-0.5">
                      {(
                        [
                          ["payment", "Rent"],
                          ["deposit", "Dep"],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setPayType(key)}
                          className={cn(
                            "h-7 rounded px-2.5 text-xs font-medium",
                            payType === key
                              ? "bg-white text-[#111827] shadow-sm"
                              : "text-[#6b7280]",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="flex shrink-0 gap-0.5 rounded-md border border-[#e5e7eb] bg-white p-0.5">
                      {(
                        [
                          ["upi", "UPI"],
                          ["cash", "Cash"],
                          ["card", "Card"],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setMethod(key)}
                          className={cn(
                            "h-7 rounded px-2.5 text-xs font-medium",
                            method === key
                              ? "bg-[#111827] text-white"
                              : "text-[#6b7280] hover:text-[#111827]",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="relative min-w-0 flex-1">
                      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-[#9ca3af]">
                        ₹
                      </span>
                      <Input
                        className="h-8 bg-white pl-6 text-sm font-semibold tabular-nums"
                        type="number"
                        step="0.01"
                        min="0"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </div>

                    <button
                      type="button"
                      className="text-[0.7rem] font-medium text-[#0f766e] hover:underline disabled:opacity-40"
                      disabled={balance <= 0}
                      onClick={() => setAmount(String(balance))}
                    >
                      Full
                    </button>

                    <Button
                      type="button"
                      size="sm"
                      className="h-8 shrink-0"
                      disabled={
                        !selectedId || takePayment.isPending || stripeBusy
                      }
                      onClick={() => takePayment.mutate()}
                    >
                      {payLabel}
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-[#6b7280]">Ticket settled</p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7"
                    disabled={
                      !selectedId || checkoutReady.isPending || stripeBusy
                    }
                    onClick={() => checkoutReady.mutate()}
                  >
                    Ready
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7"
                    disabled={!selectedId || handover.isPending}
                    onClick={() => handover.mutate()}
                  >
                    Handover
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7"
                    disabled={!selectedId}
                    onClick={() => setReceiptOpen(true)}
                  >
                    Receipt
                  </Button>
                  <span className="ml-auto text-[0.6rem] text-[#9ca3af]">
                    {stripeConfig.data?.enabled
                      ? `Stripe ${stripeConfig.data.mode}`
                      : "Offline payments"}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {stripeCheckout ? (
        <StripeCheckoutModal
          publishableKey={stripeCheckout.publishableKey}
          clientSecret={stripeCheckout.clientSecret}
          amount={stripeCheckout.amount}
          description={stripeCheckout.description}
          onSuccess={finishStripePayment}
          onClose={() => {
            setStripeCheckout(null);
            setStripeBusy(false);
          }}
        />
      ) : null}

      {receiptOpen && selectedId ? (
        <ReceiptModal
          loading={receipt.isLoading}
          data={receipt.data}
          onClose={() => setReceiptOpen(false)}
        />
      ) : null}
    </div>
  );
}
