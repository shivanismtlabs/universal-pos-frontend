"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ordersApi, returnsApi } from "@/lib/api";
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
  const [q, setQ] = useState("");
  const [active, setActive] = useState<{
    id: string;
    orderNumber: string;
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
  });

  const items = recent.data?.items ?? [];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
        <h2 className="text-lg font-semibold text-[#111827]">
          Closed sales — refund &amp; restock
        </h2>
        <p className="mt-1 text-sm text-[#6b7280]">
          Cash/card/UPI refund or store credit (needs customer on original
          sale). Stock returns to shelf.
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
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  setActive({ id: o.id, orderNumber: o.orderNumber })
                }
              >
                Return…
              </Button>
            </li>
          ))}
          {!items.length && !recent.isLoading ? (
            <li className="py-8 text-center text-[#6b7280]">
              No closed sales found
            </li>
          ) : null}
        </ul>
      </section>
      {active ? (
        <SaleReturnDialog
          orderId={active.id}
          orderNumber={active.orderNumber}
          onClose={() => setActive(null)}
        />
      ) : null}
    </div>
  );
}

export default function ReturnsPage() {
  const { hasMode, isLoading } = useBootstrap();
  const hasSale = hasMode("sale");
  const hasRental = hasMode("rental");
  const [tab, setTab] = useState<"sale" | "rental">(
    hasRental && !hasSale ? "rental" : "sale",
  );

  if (isLoading) {
    return (
      <p className="py-16 text-center text-sm text-[#5a6b7d]">Loading…</p>
    );
  }

  if (!hasSale && !hasRental) {
    return (
      <div className="rounded-xl border border-[#d9e0ea] bg-white p-8 text-center">
        <p className="text-sm font-semibold text-[#0b1f33]">
          Returns need Sale or Rental mode
        </p>
        <p className="mt-1.5 text-sm text-[#5a6b7d]">
          Enable commerce modes in shop setup.
        </p>
      </div>
    );
  }

  const showTabs = hasSale && hasRental;
  const effective = showTabs
    ? tab
    : hasSale
      ? "sale"
      : "rental";

  return (
    <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
      <header>
        <p className="text-sm tracking-[0.2em] text-[#0b1f33] uppercase">
          Returns
        </p>
        <h1 className="display mt-2 text-3xl text-[#111827] sm:text-4xl">
          Returns desk
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#6b7280]">
          Sale refunds with restock / store credit, or rental unit receive &amp;
          deposit settle.
        </p>
        {showTabs ? (
          <div className="mt-4 flex gap-1 rounded-[12px] bg-[#eef2f8] p-1 sm:w-fit">
            {(
              [
                ["sale", "Sale refunds"],
                ["rental", "Rental receive"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "rounded-[9px] px-4 py-2 text-sm font-semibold transition",
                  tab === id
                    ? "bg-white text-[#0b1f33] shadow-sm"
                    : "text-[#5a6b7d]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      {effective === "sale" ? <SaleReturnsDesk /> : <RentalReturnsDesk />}
    </div>
  );
}
