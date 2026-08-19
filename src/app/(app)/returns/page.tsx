"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ordersApi, posApi, returnsApi, subscriptionsApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import {
  createReturnSchema,
  type CreateReturnInput,
} from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/form";
import { formatDate, newIdempotencyKey, cn } from "@/lib/utils";
import { useBootstrap } from "@/lib/bootstrap";
import { SaleReturnDialog } from "@/components/sale-return-dialog";
import { canApproveRefund } from "@/lib/roles";
import { useAuthStore } from "@/lib/auth-store";

function RentalReturnsDesk() {
  const qc = useQueryClient();
  const [settleOrderId, setSettleOrderId] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [settleReason, setSettleReason] = useState("");

  const list = useQuery({
    queryKey: ["returns"],
    queryFn: () => returnsApi.list({ limit: 50 }),
  });
  const candidates = useQuery({
    queryKey: ["returns-candidates"],
    queryFn: () => returnsApi.candidates(),
  });

  const form = useForm<CreateReturnInput>({
    resolver: zodResolver(createReturnSchema),
    defaultValues: {
      orderId: "",
      inventoryUnitId: "",
      cleaningRequired: false,
      inspectNotes: "",
    },
  });

  const orderId = useWatch({ control: form.control, name: "orderId" });

  const selected = useMemo(
    () => (candidates.data?.items ?? []).find((o) => o.id === orderId),
    [candidates.data, orderId],
  );

  const returnableUnits = useMemo(
    () =>
      (selected?.unitsOut ?? []).map((u) => ({
        id: u.stockUnitId,
        label: `${u.barcodeSku}${u.variant ? ` · ${u.variant}` : ""}${
          u.title ? ` · ${u.title}` : ""
        }`,
      })),
    [selected],
  );

  const create = useMutation({
    mutationFn: (v: CreateReturnInput) =>
      returnsApi.create({
        orderId: v.orderId,
        stockUnitId: v.inventoryUnitId,
        inventoryUnitId: v.inventoryUnitId,
        cleaningRequired: v.cleaningRequired,
        inspectNotes: v.inspectNotes || undefined,
      }),
    onSuccess: (_d, v) => {
      const stillOut =
        (candidates.data?.items ?? []).find((o) => o.id === v.orderId)?.unitsOut
          .length ?? 1;
      toast.success(
        stillOut > 1
          ? "Partial return recorded — ticket stays open until all units are back"
          : "Return recorded",
      );
      form.reset();
      void qc.invalidateQueries({ queryKey: ["returns"] });
      void qc.invalidateQueries({ queryKey: ["returns-candidates"] });
      void qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const inspect = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "clean_ready" | "needs_cleaning" | "damaged";
    }) => returnsApi.inspect(id, { inspectStatus: status }),
    onSuccess: () => {
      toast.success("Inspection saved");
      void qc.invalidateQueries({ queryKey: ["returns"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const cleaningDone = useMutation({
    mutationFn: (id: string) => returnsApi.completeCleaning(id),
    onSuccess: () => {
      toast.success("Cleaning marked complete");
      void qc.invalidateQueries({ queryKey: ["returns"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const settle = useMutation({
    mutationFn: () =>
      returnsApi.settleDeposit(settleOrderId, {
        refundAmount: Number(refundAmount || 0),
        idempotencyKey: newIdempotencyKey("dep-settle"),
        reason: settleReason.trim() || undefined,
      }),
    onSuccess: (r) => {
      toast.success(
        `Deposit settled — refunded ${r.refunded}, forfeited ${r.forfeited}`,
      );
      setRefundAmount("");
      setSettleReason("");
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["order", settleOrderId] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const outOrders = candidates.data?.items ?? [];
  const returns = list.data?.items ?? [];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <section className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
        <div className="border-b border-[#e5e7eb] px-5 py-4">
          <h2 className="display text-2xl text-[#111827]">Return queue</h2>
          <p className="mt-1 text-sm text-[#6b7280]">
            {list.isLoading ? "Loading…" : `${returns.length} recorded`}
          </p>
        </div>

        {!list.isLoading && !returns.length ? (
          <div className="px-5 py-10 text-center text-sm text-[#6b7280]">
            No returns yet. Record a return on the right.
          </div>
        ) : (
          <ul className="scroll-soft max-h-[32rem] divide-y divide-[#f3f4f6] overflow-y-auto">
            {returns.map((r) => {
              const unit = r.stockUnit ?? r.inventoryUnit;
              return (
                <li key={r.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-[#111827]">
                        {r.order?.orderNumber ?? "Order"} ·{" "}
                        {unit?.barcodeSku ?? "unit"}
                      </p>
                      <p className="text-xs text-[#9ca3af]">
                        {formatDate(
                          (r as { createdAt?: string }).createdAt ?? "",
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {!r.inspectStatus ? (
                        <>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              inspect.mutate({
                                id: r.id,
                                status: "clean_ready",
                              })
                            }
                          >
                            OK
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              inspect.mutate({
                                id: r.id,
                                status: "needs_cleaning",
                              })
                            }
                          >
                            Clean
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() =>
                              inspect.mutate({ id: r.id, status: "damaged" })
                            }
                          >
                            Damaged
                          </Button>
                        </>
                      ) : (
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase",
                            "bg-[#e8eefb] text-[#0b1f33]",
                          )}
                        >
                          {r.inspectStatus}
                        </span>
                      )}
                      {r.cleaningRequired && !r.cleaningCompletedAt ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => cleaningDone.mutate(r.id)}
                        >
                          Cleaning done
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="space-y-4">
        <form
          className="rounded-2xl border border-[#e5e7eb] bg-white p-5 sm:p-6"
          onSubmit={form.handleSubmit((v) => create.mutate(v))}
          noValidate
        >
          <h2 className="display text-2xl text-[#111827]">Record return</h2>
          <p className="mt-1 text-sm text-[#6b7280]">
            Partial returns: one unit at a time. Ticket stays open until all
            units are back.
          </p>
          <div className="mt-5 space-y-4">
            <div>
              <Label>Order (units out)</Label>
              <select
                className="mt-1.5 select-field"
                {...form.register("orderId", {
                  onChange: () => form.setValue("inventoryUnitId", ""),
                })}
              >
                <option value="">Select</option>
                {outOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber} · {o.customerName} ({o.unitsOut.length} out)
                  </option>
                ))}
              </select>
              <FieldError message={form.formState.errors.orderId?.message} />
            </div>
            <div>
              <Label>Unit</Label>
              <select
                className="mt-1.5 select-field"
                disabled={!orderId}
                {...form.register("inventoryUnitId")}
              >
                <option value="">
                  {!orderId ? "Select order first" : "Select unit"}
                </option>
                {returnableUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
              <FieldError
                message={form.formState.errors.inventoryUnitId?.message}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-[#374151]">
              <input type="checkbox" {...form.register("cleaningRequired")} />
              Needs cleaning / service
            </label>
            <div>
              <Label>Notes</Label>
              <Input className="mt-1.5" {...form.register("inspectNotes")} />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={create.isPending}
            >
              {create.isPending ? "Saving…" : "Record return"}
            </Button>
          </div>
        </form>

        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5 sm:p-6">
          <h2 className="display text-2xl text-[#111827]">Settle deposit</h2>
          <p className="mt-1 text-sm text-[#6b7280]">
            Refund part or all of held deposit. Remainder forfeited. Once per
            order.
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <Label>Order</Label>
              <select
                className="mt-1.5 select-field"
                value={settleOrderId}
                onChange={(e) => setSettleOrderId(e.target.value)}
              >
                <option value="">Select order</option>
                {outOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber} · {o.customerName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Refund amount (0 = forfeit all)</Label>
              <Input
                className="mt-1.5"
                inputMode="decimal"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Reason</Label>
              <Input
                className="mt-1.5"
                value={settleReason}
                onChange={(e) => setSettleReason(e.target.value)}
                placeholder="Damage / late / full refund"
              />
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={!settleOrderId || settle.isPending}
              onClick={() => settle.mutate()}
            >
              {settle.isPending ? "Settling…" : "Settle deposit"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function SaleReturnsDesk() {
  const { money } = useBootstrap();
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.user?.roles);
  const canApprove = canApproveRefund(roles);
  const [deskTab, setDeskTab] = useState<"new" | "pending" | "history">("new");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<{
    id: string;
    orderNumber: string;
    mode?: "return" | "exchange";
  } | null>(null);

  const recent = useQuery({
    queryKey: ["sale-returns-recent", q],
    queryFn: () =>
      ordersApi.list({
        kind: "sale",
        status: "closed",
        limit: 40,
        q: q.trim() || undefined,
      }),
    enabled: deskTab === "new",
  });

  const pending = useQuery({
    queryKey: ["sale-returns-list", "pending"],
    queryFn: () => posApi.listSaleReturns({ status: "pending", limit: 50 }),
    enabled: deskTab === "pending",
  });

  const history = useQuery({
    queryKey: ["sale-returns-list", "history"],
    queryFn: () => posApi.listSaleReturns({ status: "all", limit: 50 }),
    enabled: deskTab === "history",
  });

  const approve = useMutation({
    mutationFn: (id: string) => posApi.approveSaleReturn(id),
    onSuccess: (r) => {
      const row = r as { message?: string; status?: string };
      toast.success(
        row?.message ||
          (row?.status === "completed"
            ? "✓ Return Completed"
            : "Return approved"),
      );
      void qc.invalidateQueries({ queryKey: ["sale-returns-list"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const reject = useMutation({
    mutationFn: (id: string) => posApi.rejectSaleReturn(id),
    onSuccess: () => {
      toast.success("Return rejected");
      void qc.invalidateQueries({ queryKey: ["sale-returns-list"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const items = recent.data?.items ?? [];
  const pendingItems = pending.data?.items ?? [];
  const historyItems = (history.data?.items ?? []).filter(
    (r) => r.status !== "pending" && r.status !== "requested",
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-[12px] bg-[#eef2f8] p-1 sm:w-fit">
        {(
          [
            ["new", "New return"],
            ["pending", "Pending approval"],
            ["history", "History"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setDeskTab(id)}
            className={cn(
              "rounded-[9px] px-4 py-2 text-sm font-semibold transition",
              deskTab === id
                ? "bg-white text-[#0b1f33] shadow-sm"
                : "text-[#5a6b7d]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {deskTab === "new" ? (
        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <h2 className="text-lg font-semibold text-[#111827]">
            Closed sales — refund, restock, or exchange
          </h2>
          <p className="mt-1 text-sm text-[#6b7280]">
            Cashiers can request returns; managers approve. Exchange settles the
            net difference.
          </p>
          <div className="mt-4 max-w-sm">
            <Label>Search order # / customer</Label>
            <Input
              className="mt-1.5"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ORD-…"
            />
          </div>
          <ul className="mt-4 max-h-[28rem] divide-y divide-[#f3f4f6] overflow-y-auto text-sm">
            {items.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[#111827]">{o.orderNumber}</p>
                  <p className="truncate text-xs text-[#6b7280]">
                    {o.customer?.fullName ?? "Walk-in"}
                    {o.subtotal != null ? ` · ${money(o.subtotal)}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setActive({
                        id: o.id,
                        orderNumber: o.orderNumber,
                        mode: "return",
                      })
                    }
                  >
                    Return…
                  </Button>
                  {canApprove ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        setActive({
                          id: o.id,
                          orderNumber: o.orderNumber,
                          mode: "exchange",
                        })
                      }
                    >
                      Exchange…
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
            {!items.length && !recent.isLoading ? (
              <li className="py-8 text-center text-[#6b7280]">
                No closed sales found
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {deskTab === "pending" ? (
        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <h2 className="text-lg font-semibold text-[#111827]">
            Pending approval
          </h2>
          <ul className="mt-4 divide-y divide-[#f3f4f6] text-sm">
            {pendingItems.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-semibold text-[#111827]">
                    {r.orderNumber ?? r.orderId.slice(0, 8)}
                  </p>
                  <p className="text-xs text-[#6b7280]">
                    {r.customerName ?? "—"} · {money(r.refundAmount ?? 0)} ·{" "}
                    {r.reasonCode ?? "—"} · {r.receivedBy ?? "—"}
                  </p>
                </div>
                {canApprove ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={approve.isPending}
                      onClick={() => approve.mutate(r.id)}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={reject.isPending}
                      onClick={() => reject.mutate(r.id)}
                    >
                      Reject
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs font-medium text-amber-700">
                    Awaiting manager
                  </span>
                )}
              </li>
            ))}
            {!pendingItems.length && !pending.isLoading ? (
              <li className="py-8 text-center text-[#6b7280]">
                No pending returns
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {deskTab === "history" ? (
        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <h2 className="text-lg font-semibold text-[#111827]">History</h2>
          <ul className="mt-4 divide-y divide-[#f3f4f6] text-sm">
            {historyItems.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold text-[#111827]">
                    {r.orderNumber ?? r.orderId.slice(0, 8)} ·{" "}
                    {r.statusLabel ??
                      (r.status === "completed"
                        ? "✓ Return Completed"
                        : r.status)}
                  </p>
                  <p className="text-xs text-[#6b7280]">
                    {money(r.refundAmount ?? 0)}
                    {r.refundMethod ? ` · ${r.refundMethod}` : ""} ·{" "}
                    {r.reasonCode ?? "—"} · {formatDate(r.createdAt)}
                  </p>
                  {r.exchangeOrderNumber || r.invoiceNumber ? (
                    <p className="mt-0.5 text-xs text-[#1a56db]">
                      {r.exchangeOrderNumber
                        ? `Exchange ${r.exchangeOrderNumber}`
                        : null}
                      {r.exchangeOrderNumber && r.invoiceNumber ? " · " : null}
                      {r.invoiceNumber ? `Invoice ${r.invoiceNumber}` : null}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
            {!historyItems.length && !history.isLoading ? (
              <li className="py-8 text-center text-[#6b7280]">No history yet</li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {active ? (
        <SaleReturnDialog
          orderId={active.id}
          orderNumber={active.orderNumber}
          defaultMode={active.mode ?? "return"}
          onClose={() => setActive(null)}
        />
      ) : null}
    </div>
  );
}

/** Subscription cancellation panel — inside unified returns desk */
function SubscriptionCancelDesk() {
  const qc = useQueryClient();
  const { money } = useBootstrap();

  const subs = useQuery({
    queryKey: ["returns-subscriptions"],
    queryFn: () =>
      subscriptionsApi.list({ status: "active", limit: 80 }) as Promise<{
        items: Array<{
          id: string;
          status: string;
          currentPeriodEnd: string;
          price: string | number;
          customer: { id: string; fullName: string; phone: string };
          plan: { id: string; title: string };
        }>;
      }>,
  });

  const cancel = useMutation({
    mutationFn: (id: string) => subscriptionsApi.cancel(id),
    onSuccess: () => {
      toast.success("Subscription cancelled");
      void qc.invalidateQueries({ queryKey: ["returns-subscriptions"] });
    },
    onError: (e: unknown) =>
      toast.error(
        e instanceof Error ? e.message : "Could not cancel subscription",
      ),
  });

  const items = subs.data?.items ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#6b7280]">
        Cancel an active subscription / membership. The subscription will
        remain active until its current period ends.
      </p>
      {subs.isLoading ? (
        <p className="text-sm text-[#6b7280]">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-[#6b7280]">
          No active subscriptions found.
        </p>
      ) : (
        <ul className="divide-y divide-[#eef2f8] rounded-xl border border-[#e5e7eb] bg-white">
          {items.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-[#0b1f33]">
                  {s.customer.fullName}
                </p>
                <p className="text-[0.75rem] text-[#5a6b7d]">
                  {s.plan.title} · {money(Number(s.price))} ·{" "}
                  renews {new Date(s.currentPeriodEnd).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                onClick={() => cancel.mutate(s.id)}
                disabled={cancel.isPending}
              >
                Cancel
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Service order refund panel — inside unified returns desk */
function ServiceRefundDesk() {
  const qc = useQueryClient();
  const { money } = useBootstrap();

  const orders = useQuery({
    queryKey: ["returns-service-orders"],
    queryFn: () =>
      ordersApi.list({ kind: "service_order", status: "completed", limit: 50 }),
  });

  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState("");

  const doRefund = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Select an order to refund");
      return posApi.saleReturn({
        orderId: selectedId,
        items: [],
        refundMethod: "store_credit",
        reasonCode: "service_refund",
        reason: reason.trim() || "service_refund",
        idempotencyKey: `svcref-${selectedId}-${Date.now()}`,
      });
    },
    onSuccess: () => {
      toast.success("Service refund recorded as store credit");
      setSelectedId("");
      setReason("");
      void qc.invalidateQueries({ queryKey: ["returns-service-orders"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Refund failed"),
  });

  const items = orders.data?.items ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#6b7280]">
        Issue a refund or store credit for a completed service order.
      </p>
      {orders.isLoading ? (
        <p className="text-sm text-[#6b7280]">Loading…</p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[#5a6b7d] uppercase tracking-wide mb-1">
              Select service order
            </label>
            <select
              className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">— choose order —</option>
              {items.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.orderNumber} · {o.customer?.fullName ?? "Walk-in"} ·{" "}
                  {money(Number(o.subtotal))}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#5a6b7d] uppercase tracking-wide mb-1">
              Reason (optional)
            </label>
            <input
              type="text"
              className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm"
              placeholder="Cancellation reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            disabled={!selectedId || doRefund.isPending}
            onClick={() => doRefund.mutate()}
          >
            {doRefund.isPending ? "Processing…" : "Refund as store credit"}
          </button>
        </div>
      )}
    </div>
  );
}

type ReturnTab = "sale" | "rental" | "service" | "subscription";

export default function ReturnsPage() {
  const { hasMode, isLoading } = useBootstrap();
  const hasSale = hasMode("sale");
  const hasRental = hasMode("rental");
  const hasSvc = hasMode("service");
  const hasSub = hasMode("subscription");

  const [tab, setTab] = useState<ReturnTab>(() => {
    if (hasSale) return "sale";
    if (hasRental) return "rental";
    if (hasSvc) return "service";
    return "subscription";
  });

  if (isLoading) {
    return (
      <p className="py-16 text-center text-sm text-[#5a6b7d]">Loading…</p>
    );
  }

  const availableTabs = [
      { id: "sale" as const, label: "Sale refunds", show: hasSale },
      { id: "rental" as const, label: "Rental receive", show: hasRental },
      { id: "service" as const, label: "Service refunds", show: hasSvc },
      { id: "subscription" as const, label: "Cancel subscription", show: hasSub },
    ].filter((t) => t.show);

  if (!availableTabs.length) {
    return (
      <div className="rounded-xl border border-[#d9e0ea] bg-white p-8 text-center">
        <p className="text-sm font-semibold text-[#0b1f33]">
          No commerce modes enabled
        </p>
        <p className="mt-1.5 text-sm text-[#5a6b7d]">
          Enable commerce modes in shop setup.
        </p>
      </div>
    );
  }

  const activeTab = availableTabs.some((t) => t.id === tab)
    ? tab
    : (availableTabs[0]?.id ?? "sale");

  const showTabs = availableTabs.length > 1;

  return (
    <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
      <header>
        <p className="text-sm tracking-[0.2em] text-[#0b1f33] uppercase">
          Returns &amp; Cancellations
        </p>
        <h1 className="display mt-2 text-3xl text-[#111827] sm:text-4xl">
          Returns desk
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#6b7280]">
          Sale refunds · rental returns · service refunds · subscription
          cancellations — all in one place.
        </p>
        {showTabs ? (
          <div className="mt-4 flex flex-wrap gap-1 rounded-[12px] bg-[#eef2f8] p-1 sm:w-fit">
            {availableTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded-[9px] px-4 py-2 text-sm font-semibold transition",
                  activeTab === t.id
                    ? "bg-white text-[#0b1f33] shadow-sm"
                    : "text-[#5a6b7d]",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      {activeTab === "sale" ? <SaleReturnsDesk /> : null}
      {activeTab === "rental" ? <RentalReturnsDesk /> : null}
      {activeTab === "service" ? <ServiceRefundDesk /> : null}
      {activeTab === "subscription" ? <SubscriptionCancelDesk /> : null}
    </div>
  );
}
