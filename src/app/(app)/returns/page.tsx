"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Settings } from "lucide-react";
import {
  ordersApi,
  paymentsApi,
  posApi,
  returnsApi,
  subscriptionsApi,
} from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import {
  createReturnSchema,
  type CreateReturnInput,
} from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { formatDate, newIdempotencyKey, cn } from "@/lib/utils";
import { useBootstrap } from "@/lib/bootstrap";
import {
  EmptyState,
  PageHeader,
  PageSkeleton,
} from "@/components/page-header";
import { TablePager } from "@/components/table-pager";
import { usePagedList } from "@/lib/use-paged-list";
import { SaleReturnDialog } from "@/components/sale-return-dialog";
import { canApproveRefund } from "@/lib/roles";
import { useAuthStore } from "@/lib/auth-store";
import { useBranchStore } from "@/lib/branch-store";
import {
  formatReturnLine,
  parseSaleReturnItems,
  type SaleReturnLineRow,
} from "@/lib/sale-return-items";

const formCard =
  "rounded-xl border border-[#e4e9f0] bg-white p-4 shadow-sm sm:p-5";
const fieldSelect =
  "mt-1.5 h-10 w-full rounded-lg border border-[#e4e9f0] bg-white px-3 text-sm";

type ReturnTab = "sale" | "rental" | "service" | "subscription";
type SaleDeskTab = "new" | "pending" | "history";

function statusPill(status: string) {
  const s = status.toLowerCase();
  if (s === "completed" || s === "approved")
    return "bg-[#dcfce7] text-[#15803d]";
  if (s === "pending" || s === "requested" || s === "processing")
    return "bg-[#fef3c7] text-[#b45309]";
  if (s === "rejected" || s === "cancelled" || s === "damaged")
    return "bg-[#fee2e2] text-[#b91c1c]";
  if (s === "needs_cleaning" || s === "clean_ready")
    return "bg-[#e0e7ff] text-[#3730a3]";
  return "bg-[#f1f5f9] text-[#5a6b7d]";
}

function statusLabel(status: string) {
  switch (status) {
    case "completed":
      return "Completed";
    case "pending":
    case "requested":
      return "Pending";
    case "processing":
      return "Processing";
    case "rejected":
      return "Rejected";
    case "clean_ready":
      return "OK";
    case "needs_cleaning":
      return "Needs cleaning";
    case "damaged":
      return "Damaged";
    default:
      return status.replace(/_/g, " ");
  }
}

type ReturnEventRow = {
  items?: unknown;
  returnedItems?: SaleReturnLineRow[];
  replacedItems?: SaleReturnLineRow[];
  isExchange?: boolean;
  reasonCode?: string | null;
};

function ReturnEventLines({ row }: { row: ReturnEventRow }) {
  const fromApi =
    row.returnedItems?.length || row.replacedItems?.length
      ? {
          returned: row.returnedItems ?? [],
          replaced: row.replacedItems ?? [],
          isExchange: Boolean(row.isExchange || row.replacedItems?.length),
        }
      : parseSaleReturnItems(row.items);

  if (!fromApi.returned.length && !fromApi.replaced.length) return null;

  return (
    <div className="mt-1 space-y-1 text-[0.7rem] text-[#5a6b7d]">
      {fromApi.returned.length ? (
        <div>
          <p className="font-semibold text-[#334155]">Returned</p>
          <ul className="mt-0.5 space-y-0.5">
            {fromApi.returned.slice(0, 6).map((it, i) => (
              <li key={`ret-${i}`}>{formatReturnLine(it)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {fromApi.replaced.length ? (
        <div>
          <p className="font-semibold text-[#334155]">Exchanged for</p>
          <ul className="mt-0.5 space-y-0.5">
            {fromApi.replaced.slice(0, 6).map((it, i) => (
              <li key={`rep-${i}`}>{formatReturnLine(it)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ModeTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: ReturnTab; label: string }>;
  active: ReturnTab;
  onChange: (id: ReturnTab) => void;
}) {
  if (tabs.length <= 1) return null;
  return (
    <div className="flex flex-wrap gap-1 border-b border-[#e5e7eb]">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
            active === t.id
              ? "border-[#1a56db] text-[#1a56db]"
              : "border-transparent text-[#6b7280] hover:text-[#0b1f33]",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function ChipTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: T; label: string }>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-[#f1f5f9] p-1 text-xs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={cn(
            "rounded-md px-3 py-1.5 font-medium transition",
            active === tab.id
              ? "bg-white font-semibold text-[#0b1f33] shadow-sm"
              : "text-[#5a6b7d] hover:text-[#0b1f33]",
          )}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function RentalReturnsDesk() {
  const { money } = useBootstrap();
  const currencySymbol = useMemo(
    () => money(0).replace(/[0-9.,\s]/g, "").trim() || "$",
    [money],
  );
  const qc = useQueryClient();
  const [settleOrderId, setSettleOrderId] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [manualLateFee, setManualLateFee] = useState("");
  const [manualDamageFee, setManualDamageFee] = useState("");
  const [settleReason, setSettleReason] = useState("");
  const [returnQty, setReturnQty] = useState(1);
  const [selectedCondition, setSelectedCondition] = useState<"ok" | "cleaning" | "damaged">("ok");
  const [damageFee, setDamageFee] = useState("");

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
  const selectedUnitId = useWatch({ control: form.control, name: "inventoryUnitId" });

  const selected = useMemo(
    () => (candidates.data?.items ?? []).find((o) => o.id === orderId),
    [candidates.data, orderId],
  );

  const returnableUnits = useMemo(() => {
    const raw = selected?.unitsOut ?? [];
    type GroupItem = {
      id: string;
      allIds: string[];
      barcodeSku: string;
      variant?: string | null;
      title: string;
      count: number;
    };
    const map = new Map<string, GroupItem>();
    for (const u of raw) {
      const key = u.productId
        ? `prod:${u.productId}`
        : `unit:${u.barcodeSku || u.barcode || u.stockUnitId}`;
      const qty = Number((u as { quantity?: number }).quantity ?? 1);
      if (!map.has(key)) {
        map.set(key, {
          id: u.stockUnitId,
          allIds: [u.stockUnitId],
          barcodeSku: u.barcodeSku || u.barcode,
          variant: u.variant,
          title: u.title,
          count: qty,
        });
      } else {
        const item = map.get(key)!;
        item.count += qty;
        item.allIds.push(u.stockUnitId);
      }
    }
    return Array.from(map.values()).map((g) => ({
      id: g.id,
      allIds: g.allIds,
      count: g.count,
      label:
        g.count > 1
          ? `${g.count} × ${g.barcodeSku}${g.variant ? ` · ${g.variant}` : ""}${
              g.title ? ` · ${g.title}` : ""
            }`
          : `${g.barcodeSku}${g.variant ? ` · ${g.variant}` : ""}${
              g.title ? ` · ${g.title}` : ""
            }`,
    }));
  }, [selected]);

  const selectedGroup = useMemo(
    () => returnableUnits.find((u) => u.id === selectedUnitId),
    [returnableUnits, selectedUnitId],
  );

  const create = useMutation({
    mutationFn: async (v: CreateReturnInput) => {
      const group = returnableUnits.find((u) => u.id === v.inventoryUnitId);
      const allTargetIds = group?.allIds?.length ? group.allIds : [v.inventoryUnitId];
      const maxAvailable = group?.count ?? 1;
      const actualQty = Math.min(returnQty, maxAvailable);
      const targetIds = allTargetIds.slice(0, actualQty);
      const qtyPerCall = Math.max(1, Math.floor(actualQty / Math.max(1, targetIds.length)));

      for (const targetId of targetIds) {
        await returnsApi.create({
          orderId: v.orderId,
          stockUnitId: targetId,
          inventoryUnitId: targetId,
          cleaningRequired: selectedCondition === "cleaning",
          inspectStatus: selectedCondition === "damaged" ? "damaged" : selectedCondition === "cleaning" ? "needs_cleaning" : "clean_ready",
          damageFee: selectedCondition === "damaged" && damageFee.trim() ? Number(damageFee) : undefined,
          inspectNotes: v.inspectNotes || undefined,
          quantityToReturn: qtyPerCall,
        });
      }
    },
    onSuccess: (_d, v) => {
      toast.success("Return recorded");
      form.reset();
      setReturnQty(1);
      setSelectedCondition("ok");
      setDamageFee("");
      void qc.invalidateQueries({ queryKey: ["returns"] });
      void qc.invalidateQueries({ queryKey: ["returns-candidates"] });
      void qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e) => {
      const raw = e instanceof ApiError ? e.messages.join(", ") : "Failed to record return";
      const clean = raw.includes("not checked out yet") || raw.includes("not returnable yet")
        ? "Selected order is not ready for return processing."
        : raw;
      toast.error(clean);
    },
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

  const allCandidates = candidates.data?.items ?? [];
  const outOrders = useMemo(
    () => allCandidates.filter((o) => o.unitsOut.length > 0),
    [allCandidates],
  );
  const returns = list.data?.items ?? [];
  const pagedReturns = usePagedList(returns, 12);

  if (list.isLoading && !list.data) return <PageSkeleton rows={6} />;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <section className={formCard}>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[#0b1f33]">
              Return queue
            </h2>
            <p className="mt-0.5 text-[0.75rem] text-[#5a6b7d]">
              {returns.length} recorded · inspect &amp; clean
            </p>
          </div>
        </div>

        {!returns.length ? (
          <EmptyState
            title="No rental returns yet"
            detail="Record a unit return on the right when gear comes back."
          />
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-[#e5e7eb]">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-[#f7f9fb] text-[0.7rem] tracking-wide text-[#5a6b7d] uppercase">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Order / unit</th>
                    <th className="px-3 py-2 font-semibold">Date</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {pagedReturns.slice.map((r) => {
                    const unit = r.stockUnit ?? r.inventoryUnit;
                    return (
                      <tr
                        key={r.id}
                        className="border-t border-[#f0f3f7] align-top"
                      >
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-[#0b1f33]">
                            {r.order?.orderNumber ?? "Order"}
                          </p>
                          <p className="font-mono text-[0.7rem] text-[#5a6b7d]">
                            {unit?.barcodeSku ?? "—"}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-[0.75rem] text-[#5a6b7d]">
                          {formatDate(
                            (r as { createdAt?: string }).createdAt ?? "",
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {r.inspectStatus ? (
                            <span
                              className={cn(
                                "inline-flex rounded-md px-2 py-0.5 text-[0.7rem] font-semibold",
                                statusPill(r.inspectStatus),
                              )}
                            >
                              {statusLabel(r.inspectStatus)}
                            </span>
                          ) : (
                            <span className="text-[0.75rem] text-[#8a9bb0]">
                              Awaiting inspect
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex flex-wrap justify-end gap-1.5">
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
                                    inspect.mutate({
                                      id: r.id,
                                      status: "damaged",
                                    })
                                  }
                                >
                                  Damaged
                                </Button>
                              </>
                            ) : null}
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePager {...pagedReturns.pagerProps} />
          </>
        )}
      </section>

      <div className="space-y-4">
        <form
          className={formCard}
          onSubmit={form.handleSubmit((v) => create.mutate(v))}
          noValidate
        >
          <h2 className="text-sm font-semibold text-[#0b1f33]">
            Record return
          </h2>
          <p className="mt-0.5 text-[0.75rem] text-[#5a6b7d]">
            One unit at a time. Ticket stays open until all units are back.
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <Label>Order (units out)</Label>
              <Select
                className={fieldSelect}
                {...form.register("orderId", {
                  onChange: () => form.setValue("inventoryUnitId", ""),
                })}
              >
                <option value="">Select…</option>
                {outOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber} · {o.customerName} ({o.unitsOut.length} out)
                  </option>
                ))}
              </Select>
              <FieldError message={form.formState.errors.orderId?.message} />
            </div>
            <div>
              <Label>Unit</Label>
              <Select
                className={fieldSelect}
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
              </Select>
              <FieldError
                message={form.formState.errors.inventoryUnitId?.message}
              />
            </div>
            {selectedUnitId ? (() => {
              const maxQty = selectedGroup?.count ?? 1;
              return (
                <div className="rounded-lg border border-[#e4e9f0] bg-[#f8fafc] p-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-[#334155]">
                      Quantity to Return Today
                    </Label>
                    <span className="text-[0.72rem] font-medium text-[#64748b]">
                      Out of {maxQty} checked out
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex items-center rounded-lg border border-[#d6deea] bg-white shadow-sm">
                      <button
                        type="button"
                        className="flex h-9 w-9 items-center justify-center text-lg font-bold text-[#334155] hover:bg-[#f1f5f9] disabled:opacity-30"
                        disabled={returnQty <= 1}
                        onClick={() => setReturnQty((q) => Math.max(1, q - 1))}
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={maxQty}
                        value={returnQty}
                        onChange={(e) => {
                          const v = Number(e.target.value) || 1;
                          setReturnQty(Math.min(maxQty, Math.max(1, v)));
                        }}
                        className="h-9 w-14 text-center text-sm font-semibold text-[#0b1f33] focus:outline-none"
                      />
                      <button
                        type="button"
                        className="flex h-9 w-9 items-center justify-center text-lg font-bold text-[#334155] hover:bg-[#f1f5f9] disabled:opacity-30"
                        disabled={returnQty >= maxQty}
                        onClick={() => setReturnQty((q) => Math.min(maxQty, q + 1))}
                      >
                        +
                      </button>
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-[#1a56db]">{returnQty}</span> returning today,{" "}
                      <span className="font-semibold text-[#d97706]">{Math.max(0, maxQty - returnQty)}</span> remain checked out
                    </div>
                  </div>
                </div>
              );
            })() : null}
            <div>
              <Label>Item Condition</Label>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-xs">
                <button
                  type="button"
                  className={cn(
                    "rounded-md border py-2 font-medium transition",
                    selectedCondition === "ok"
                      ? "border-[#1a56db] bg-[#eff6ff] text-[#1a56db]"
                      : "border-[#e5e7eb] bg-white text-[#5a6b7d]",
                  )}
                  onClick={() => {
                    setSelectedCondition("ok");
                    form.setValue("cleaningRequired", false);
                  }}
                >
                  ✓ Good (OK)
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-md border py-2 font-medium transition",
                    selectedCondition === "cleaning"
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700 font-semibold"
                      : "border-[#e5e7eb] bg-white text-[#5a6b7d]",
                  )}
                  onClick={() => {
                    setSelectedCondition("cleaning");
                    form.setValue("cleaningRequired", true);
                  }}
                >
                  🧹 Needs Clean
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-md border py-2 font-medium transition",
                    selectedCondition === "damaged"
                      ? "border-red-500 bg-red-50 text-red-700 font-semibold"
                      : "border-[#e5e7eb] bg-white text-[#5a6b7d] hover:border-red-300 hover:text-red-600",
                  )}
                  onClick={() => {
                    setSelectedCondition("damaged");
                    form.setValue("cleaningRequired", false);
                  }}
                >
                  ⚠️ Damaged
                </button>
              </div>
            </div>

            {selectedCondition === "damaged" && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1.5">
                <Label className="text-xs font-semibold text-red-900">
                  Damage Fee Charge ({currencySymbol})
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={damageFee}
                  onChange={(e) => setDamageFee(e.target.value)}
                  placeholder="Enter repair or damage fee (e.g. 50)"
                  className="mt-1 bg-white font-semibold text-red-950 border-red-300 focus:border-red-500"
                />
                <p className="text-[0.7rem] text-red-700">
                  Fee recorded with damage report
                </p>
              </div>
            )}

            <div>
              <Label>Notes & Inspection Details</Label>
              <Input
                className="mt-1.5"
                placeholder="Condition notes, wear & tear, or damage description…"
                {...form.register("inspectNotes")}
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-[#1a56db] hover:bg-[#1546b3]"
              disabled={create.isPending}
            >
              {create.isPending ? "Saving…" : "Record return"}
            </Button>
          </div>
        </form>

        <section className={formCard}>
          <h2 className="text-sm font-semibold text-[#0b1f33]">
            Settle deposit
          </h2>
          <p className="mt-0.5 text-[0.75rem] text-[#5a6b7d]">
            Refund part or all of held deposit. Remainder forfeited. Once per
            order.
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <Label>Order</Label>
              <Select
                className={fieldSelect}
                value={settleOrderId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSettleOrderId(id);
                  const ord = allCandidates.find((o) => o.id === id) as (typeof allCandidates[0] & { overdueDays?: number; overdueFee?: number; totalDamageFees?: number; suggestedRefund?: number }) | undefined;
                  if (ord) {
                    const overdueFee = ord.overdueFee ?? 0;
                    const damageFees = ord.totalDamageFees ?? 0;
                    const balanceDue = Number(ord.balanceDue ?? 0);
                    const rawHeld = Number(ord.heldDeposit ?? 0);
                    setManualLateFee(String(overdueFee));
                    setManualDamageFee(String(damageFees));
                    const suggested = Math.max(0, rawHeld - balanceDue - overdueFee - damageFees);
                    setRefundAmount(String(suggested));
                    
                    const reasons: string[] = [];
                    if (damageFees > 0) {
                      reasons.push(`Deducted ${money(damageFees)} damage fee`);
                    }
                    if (overdueFee > 0) {
                      reasons.push(`Deducted ${money(overdueFee)} late fee (${ord.overdueDays} days overdue)`);
                    }
                    if (balanceDue > 0) {
                      reasons.push(`Deducted ${money(balanceDue)} unpaid balance`);
                    }
                    if (reasons.length === 0) {
                      reasons.push("Full deposit refund");
                    }
                    setSettleReason(reasons.join(". "));
                  }
                }}
              >
                <option value="">Select order</option>
                {allCandidates
                  .map((o) => {
                    const held = Number(o.heldDeposit ?? 0);
                    const due = Number(o.balanceDue ?? 0);
                    const retAmt = Math.max(0, held - due);
                    const overdue = (o as { overdueDays?: number }).overdueDays ?? 0;
                    return { o, retAmt, overdue };
                  })
                  .filter(({ retAmt }) => retAmt > 0)
                  .map(({ o, retAmt, overdue }) => (
                    <option key={o.id} value={o.id}>
                      {o.orderNumber} · {o.customerName} · Deposit: {money(retAmt)}{overdue > 0 ? ` ⚠️ (${overdue}d overdue)` : ""}
                    </option>
                  ))}
              </Select>
            </div>
            {settleOrderId ? (() => {
              const ord = allCandidates.find((o) => o.id === settleOrderId) as (typeof allCandidates[0] & { overdueDays?: number; overdueFee?: number; totalDamageFees?: number; suggestedRefund?: number }) | undefined;
              if (!ord) return null;
              const held = Math.max(0, Number(ord.heldDeposit ?? 0) - Number(ord.balanceDue ?? 0));
              const overdueDays = ord.overdueDays ?? 0;
              const currentLateFee = Number(manualLateFee || 0);
              const currentDamageFee = Number(manualDamageFee || 0);
              const suggested = Math.max(0, held - currentLateFee - currentDamageFee);

              const updateDeductionState = (late: number, dmg: number) => {
                const newRefund = Math.max(0, held - late - dmg);
                setRefundAmount(String(newRefund));
                const reasons: string[] = [];
                if (dmg > 0) reasons.push(`Deducted ${money(dmg)} damage fee`);
                if (late > 0) reasons.push(`Deducted ${money(late)} late fee`);
                if (reasons.length === 0) reasons.push("Full deposit refund");
                setSettleReason(reasons.join(". "));
              };

              return (
                <div className="space-y-3">
                  {overdueDays > 0 ? (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                      <p className="font-semibold text-amber-950 flex items-center gap-1.5">
                        <span className="inline-block rounded bg-amber-200 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-amber-900">Overdue</span>
                        Item return is {overdueDays} {overdueDays === 1 ? "day" : "days"} late
                      </p>
                      <p className="text-amber-800">
                        Suggested auto late fee: {money(ord.overdueFee ?? 0)}. You can adjust fees below manually.
                      </p>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Damage Charge ({currencySymbol})</Label>
                      <Input
                        className="mt-1.5 font-semibold text-red-700"
                        inputMode="decimal"
                        value={manualDamageFee}
                        onChange={(e) => {
                          const valStr = e.target.value;
                          setManualDamageFee(valStr);
                          updateDeductionState(currentLateFee, Number(valStr || 0));
                        }}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label>Overdue / Late Fee ({currencySymbol})</Label>
                      <Input
                        className="mt-1.5 font-semibold text-[#0b1f33]"
                        inputMode="decimal"
                        value={manualLateFee}
                        onChange={(e) => {
                          const valStr = e.target.value;
                          setManualLateFee(valStr);
                          updateDeductionState(Number(valStr || 0), currentDamageFee);
                        }}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {held > 0 ? (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 space-y-1">
                      <p className="font-semibold text-sm text-emerald-800">
                        Net Refund: {money(suggested)} <span className="text-xs font-normal text-emerald-700">(Held Deposit: {money(held)})</span>
                      </p>
                      <p className="text-emerald-700">
                        Refunding <strong>{money(suggested)}</strong> back to customer after <strong>{money(currentDamageFee)}</strong> damage fee and <strong>{money(currentLateFee)}</strong> late fee deduction.
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })() : null}
            <div>
              <Label>Refund amount (0 = forfeit all)</Label>
              <Input
                className="mt-1.5 font-semibold text-[#15803d]"
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
              variant="secondary"
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
  const [deskTab, setDeskTab] = useState<SaleDeskTab>("new");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<{
    id: string;
    orderNumber: string;
    mode?: "return" | "exchange";
  } | null>(null);

  const recent = useQuery({
    queryKey: ["sale-returns-recent", q],
    queryFn: () => posApi.listRecentSales(40),
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
            ? "Return completed"
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

  const items = (recent.data?.items ?? []).filter((o) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return (
      o.orderNumber.toLowerCase().includes(needle) ||
      (o.customerName ?? "").toLowerCase().includes(needle) ||
      (o.productSummary ?? "").toLowerCase().includes(needle)
    );
  });
  const pendingItems = pending.data?.items ?? [];
  const historyItems = (history.data?.items ?? []).filter(
    (r) => r.status !== "pending" && r.status !== "requested",
  );

  const loading =
    (deskTab === "new" && recent.isLoading && !recent.data) ||
    (deskTab === "pending" && pending.isLoading && !pending.data) ||
    (deskTab === "history" && history.isLoading && !history.data);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e4e9f0] bg-white p-3 shadow-sm">
        <ChipTabs
          tabs={[
            { id: "new" as const, label: "New return" },
            { id: "pending" as const, label: "Pending approval" },
            { id: "history" as const, label: "History" },
          ]}
          active={deskTab}
          onChange={setDeskTab}
        />
        {deskTab === "new" ? (
          <div className="min-w-[12rem] flex-1 sm:max-w-xs">
            <Input
              className="h-9"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search order # / customer…"
            />
          </div>
        ) : null}
      </div>

      {loading ? <PageSkeleton rows={6} /> : null}

      {deskTab === "new" && !loading ? (
        <section className={formCard}>
          <h2 className="text-sm font-semibold text-[#0b1f33]">
            Closed sales
          </h2>
          <p className="mt-0.5 text-[0.75rem] text-[#5a6b7d]">
            Refund / restock, or exchange (manager). Cashiers can request;
            managers approve.
          </p>
          <div className="mt-4 overflow-x-auto rounded-lg border border-[#e5e7eb]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-[#f7f9fb] text-[0.7rem] tracking-wide text-[#5a6b7d] uppercase">
                <tr>
                  <th className="px-3 py-2 font-semibold">Order</th>
                  <th className="px-3 py-2 font-semibold">Customer</th>
                  <th className="px-3 py-2 font-semibold">Items</th>
                  <th className="px-3 py-2 text-right font-semibold">Total</th>
                  <th className="px-3 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.id} className="border-t border-[#f0f3f7]">
                    <td className="px-3 py-2.5 font-medium text-[#0b1f33]">
                      {o.orderNumber}
                    </td>
                    <td className="px-3 py-2.5 text-[#5a6b7d]">
                      {o.customerName || "Walk-in"}
                    </td>
                    <td className="max-w-[14rem] truncate px-3 py-2.5 text-[#334155]">
                      {o.productSummary || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {o.total != null || o.subtotal != null
                        ? money(o.total ?? o.subtotal)
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex justify-end gap-2">
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
                          Return
                        </Button>
                        {canApprove ? (
                          <Button
                            type="button"
                            size="sm"
                            className="bg-[#1a56db] hover:bg-[#1546b3]"
                            onClick={() =>
                              setActive({
                                id: o.id,
                                orderNumber: o.orderNumber,
                                mode: "exchange",
                              })
                            }
                          >
                            Exchange
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!items.length ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-10 text-center text-[#5a6b7d]"
                    >
                      No closed sales found
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {deskTab === "pending" && !loading ? (
        <section className={formCard}>
          <h2 className="text-sm font-semibold text-[#0b1f33]">
            Pending approval
          </h2>
          <div className="mt-4 overflow-x-auto rounded-lg border border-[#e5e7eb]">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-[#f7f9fb] text-[0.7rem] tracking-wide text-[#5a6b7d] uppercase">
                <tr>
                  <th className="px-3 py-2 font-semibold">Order</th>
                  <th className="px-3 py-2 font-semibold">Customer / lines</th>
                  <th className="px-3 py-2 text-right font-semibold">Refund</th>
                  <th className="px-3 py-2 font-semibold">Staff</th>
                  <th className="px-3 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {pendingItems.map((r) => (
                  <tr key={r.id} className="border-t border-[#f0f3f7] align-top">
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-[#0b1f33]">
                        {r.orderNumber ?? r.orderId.slice(0, 8)}
                      </p>
                      <p className="text-[0.7rem] text-[#5a6b7d]">
                        {r.isExchange || r.reasonCode === "exchange"
                          ? "Exchange"
                          : (r.reasonCode ?? "—")}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-[#0b1f33]">
                        {r.customerName ?? "—"}
                      </p>
                      <ReturnEventLines row={r} />
                      {r.notes ? (
                        <p className="mt-1 text-[0.7rem] text-[#8a9bb0]">
                          {r.notes}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                      {money(r.refundAmount ?? 0)}
                    </td>
                    <td className="px-3 py-2.5 text-[0.75rem] text-[#5a6b7d]">
                      {r.receivedBy ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {canApprove ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="bg-[#1a56db] hover:bg-[#1546b3]"
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
                    </td>
                  </tr>
                ))}
                {!pendingItems.length ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-10 text-center text-[#5a6b7d]"
                    >
                      No pending returns
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {deskTab === "history" && !loading ? (
        <section className={formCard}>
          <h2 className="text-sm font-semibold text-[#0b1f33]">History</h2>
          <div className="mt-4 overflow-x-auto rounded-lg border border-[#e5e7eb]">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-[#f7f9fb] text-[0.7rem] tracking-wide text-[#5a6b7d] uppercase">
                <tr>
                  <th className="px-3 py-2 font-semibold">Order</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 text-right font-semibold">Refund</th>
                  <th className="px-3 py-2 font-semibold">Details</th>
                  <th className="px-3 py-2 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {historyItems.map((r) => (
                  <tr key={r.id} className="border-t border-[#f0f3f7] align-top">
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-[#0b1f33]">
                        {r.orderNumber ?? r.orderId.slice(0, 8)}
                      </p>
                      {r.customerName ? (
                        <p className="text-[0.7rem] text-[#5a6b7d]">
                          {r.customerName}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex rounded-md px-2 py-0.5 text-[0.7rem] font-semibold",
                          statusPill(r.status),
                        )}
                      >
                        {r.statusLabel ?? statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {money(r.refundAmount ?? 0)}
                      {r.refundMethod ? (
                        <span className="mt-0.5 block text-[0.65rem] text-[#8a9bb0]">
                          via {r.refundMethod}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-[0.75rem] text-[#5a6b7d]">
                      <p>Reason: {r.reasonCode ?? "—"}</p>
                      {r.isExchange || r.reasonCode === "exchange" ? (
                        <p className="mt-0.5 font-semibold text-[#1a56db]">
                          Exchange
                        </p>
                      ) : null}
                      {r.exchangeOrderNumber || r.invoiceNumber ? (
                        <p className="mt-0.5 text-[#1a56db]">
                          {r.exchangeOrderNumber
                            ? `New sale ${r.exchangeOrderNumber}`
                            : null}
                          {r.exchangeOrderNumber && r.invoiceNumber
                            ? " · "
                            : null}
                          {r.invoiceNumber
                            ? `Invoice ${r.invoiceNumber}`
                            : null}
                        </p>
                      ) : null}
                      <ReturnEventLines row={r} />
                    </td>
                    <td className="px-3 py-2.5 text-[0.75rem] text-[#5a6b7d]">
                      {formatDate(r.createdAt)}
                    </td>
                  </tr>
                ))}
                {!historyItems.length ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-10 text-center text-[#5a6b7d]"
                    >
                      No history yet
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {active ? (
        <SaleReturnDialog
          orderId={active.id}
          orderNumber={active.orderNumber}
          defaultMode={active.mode ?? "return"}
          onClose={() => setActive(null)}
          onRequested={() => setDeskTab("pending")}
          onCompleted={() => {
            setActive(null);
            setDeskTab("history");
          }}
        />
      ) : null}
    </div>
  );
}

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
        e instanceof ApiError
          ? e.messages.join(", ")
          : e instanceof Error
            ? e.message
            : "Could not cancel subscription",
      ),
  });

  const items = subs.data?.items ?? [];

  if (subs.isLoading && !subs.data) return <PageSkeleton rows={5} />;

  return (
    <section className={formCard}>
      <h2 className="text-sm font-semibold text-[#0b1f33]">
        Active subscriptions
      </h2>
      <p className="mt-0.5 text-[0.75rem] text-[#5a6b7d]">
        Cancel stays active until the current period ends.
      </p>
      {!items.length ? (
        <div className="mt-4">
          <EmptyState
            title="No active subscriptions"
            detail="Nothing to cancel right now."
          />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-[#e5e7eb]">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-[#f7f9fb] text-[0.7rem] tracking-wide text-[#5a6b7d] uppercase">
              <tr>
                <th className="px-3 py-2 font-semibold">Customer</th>
                <th className="px-3 py-2 font-semibold">Plan</th>
                <th className="px-3 py-2 text-right font-semibold">Price</th>
                <th className="px-3 py-2 font-semibold">Period end</th>
                <th className="px-3 py-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} className="border-t border-[#f0f3f7]">
                  <td className="px-3 py-2.5 font-medium text-[#0b1f33]">
                    {s.customer.fullName}
                  </td>
                  <td className="px-3 py-2.5 text-[#5a6b7d]">{s.plan.title}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {money(Number(s.price))}
                  </td>
                  <td className="px-3 py-2.5 text-[0.75rem] text-[#5a6b7d]">
                    {new Date(s.currentPeriodEnd).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate(s.id)}
                    >
                      Cancel
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Refund a completed service job via payment refund (not sale-return API). */
function ServiceRefundDesk() {
  const qc = useQueryClient();
  const { money } = useBootstrap();
  const locationId = useBranchStore((s) => s.currentLocationId);

  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");

  const orders = useQuery({
    queryKey: ["returns-service-orders", locationId],
    queryFn: () =>
      ordersApi.list({
        kind: "service_order",
        status: "completed",
        limit: 50,
        locationId: locationId || undefined,
      }),
  });

  const detail = useQuery({
    queryKey: ["order", selectedId],
    queryFn: () => ordersApi.get(selectedId),
    enabled: Boolean(selectedId),
  });

  const refundablePayment = useMemo(() => {
    const pays = detail.data?.payments ?? [];
    return (
      pays.find(
        (p) =>
          p.status === "succeeded" &&
          (p.type === "payment" || p.type === "deposit" || !p.type),
      ) ?? pays.find((p) => p.status === "succeeded")
    );
  }, [detail.data]);

  useEffect(() => {
    if (!refundablePayment) {
      setAmount("");
      return;
    }
    setAmount(String(Number(refundablePayment.amount) || ""));
  }, [refundablePayment]);

  const doRefund = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Select an order to refund");
      if (!refundablePayment?.id) {
        throw new Error("No succeeded payment found on this order");
      }
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error("Enter a valid refund amount");
      }
      return paymentsApi.refund(refundablePayment.id, {
        amount: n,
        idempotencyKey: newIdempotencyKey(`svcref-${selectedId}`),
        reason: reason.trim() || "Service refund",
      });
    },
    onSuccess: () => {
      toast.success("Service refund recorded");
      setSelectedId("");
      setReason("");
      setAmount("");
      void qc.invalidateQueries({ queryKey: ["returns-service-orders"] });
      void qc.invalidateQueries({ queryKey: ["order"] });
    },
    onError: (e: unknown) =>
      toast.error(
        e instanceof ApiError
          ? e.messages.join(", ")
          : e instanceof Error
            ? e.message
            : "Refund failed",
      ),
  });

  const items = orders.data?.items ?? [];

  if (orders.isLoading && !orders.data) return <PageSkeleton rows={5} />;

  return (
    <section className={formCard}>
      <h2 className="text-sm font-semibold text-[#0b1f33]">
        Service order refund
      </h2>
      <p className="mt-0.5 text-[0.75rem] text-[#5a6b7d]">
        Refund against the original payment on a completed service job.
      </p>

      {!items.length ? (
        <div className="mt-4">
          <EmptyState
            title="No completed service orders"
            detail="Finish a service job first, then refund from here."
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-3 sm:col-span-2 sm:max-w-xl">
            <div>
              <Label>Service order</Label>
              <Select
                className={fieldSelect}
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                <option value="">Select…</option>
                {items.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber} · {o.customer?.fullName ?? "Walk-in"} ·{" "}
                    {money(Number(o.subtotal))}
                  </option>
                ))}
              </Select>
            </div>
            {selectedId && detail.isLoading ? (
              <p className="text-sm text-[#5a6b7d]">Loading payment…</p>
            ) : null}
            {selectedId && detail.data && !refundablePayment ? (
              <p className="text-sm text-amber-700">
                No refundable payment on this order.
              </p>
            ) : null}
            <div>
              <Label>Refund amount</Label>
              <Input
                className="mt-1.5"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={!refundablePayment}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Reason (optional)</Label>
              <Input
                className="mt-1.5"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Cancellation / quality / other"
              />
            </div>
            <Button
              type="button"
              className="bg-[#1a56db] hover:bg-[#1546b3]"
              disabled={
                !selectedId || !refundablePayment || doRefund.isPending
              }
              onClick={() => doRefund.mutate()}
            >
              {doRefund.isPending ? "Processing…" : "Refund payment"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function ReturnsPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={8} />}>
      <ReturnsPageInner />
    </Suspense>
  );
}

function ReturnsPageInner() {
  const { hasMode, commerceModes, businessType, isLoading } = useBootstrap();
  const search = useSearchParams();
  const router = useRouter();
  const hasSale = hasMode("sale");
  const hasRental = hasMode("rental");
  const hasSvc = hasMode("service");
  const hasSub = hasMode("subscription");
  const tabFromUrl = search.get("tab");

  const availableTabs = useMemo(
    () =>
      (
        [
          { id: "sale" as const, label: "Sale refunds", show: hasSale },
          { id: "rental" as const, label: "Rental receive", show: hasRental },
          { id: "service" as const, label: "Service refunds", show: hasSvc },
          {
            id: "subscription" as const,
            label: "Cancel subscription",
            show: hasSub,
          },
        ] as const
      )
        .filter((t) => t.show)
        .sort((a, b) => {
          const idxA = commerceModes.indexOf(a.id);
          const idxB = commerceModes.indexOf(b.id);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          return 0;
        }),
    [hasSale, hasRental, hasSvc, hasSub, commerceModes],
  );

  const [tab, setTab] = useState<ReturnTab | null>(null);

  useEffect(() => {
    if (!availableTabs.length) return;
    if (
      tabFromUrl &&
      availableTabs.some((t) => t.id === tabFromUrl)
    ) {
      setTab(tabFromUrl as ReturnTab);
      return;
    }
    if (tab && availableTabs.some((t) => t.id === tab)) return;
    const defaultTab =
      (businessType === "rental" && hasRental ? "rental" : null) ??
      availableTabs[0]!.id;
    setTab(defaultTab);
  }, [availableTabs, tab, tabFromUrl, businessType, hasRental]);

  function selectTab(id: ReturnTab) {
    setTab(id);
    const qs = new URLSearchParams(search.toString());
    const first = availableTabs[0]?.id;
    if (id === first) qs.delete("tab");
    else qs.set("tab", id);
    const next = qs.toString();
    router.replace(next ? `/returns?${next}` : "/returns", { scroll: false });
  }

  if (isLoading) return <PageSkeleton rows={8} />;

  if (!availableTabs.length) {
    return (
      <div className="space-y-4 px-3 sm:px-4">
        <PageHeader
          eyebrow="Sales"
          title="Returns desk"
          subtitle="Refunds, rental returns, and cancellations."
        />
        <EmptyState
          title="No commerce modes enabled"
          detail="Enable sale, rental, service, or subscription in shop setup."
        />
      </div>
    );
  }

  const activeTab = (tab && availableTabs.some((t) => t.id === tab)
    ? tab
    : availableTabs[0]!.id) as ReturnTab;

  return (
    <div className="space-y-5 px-3 sm:px-4 pb-10">
      <PageHeader
        eyebrow="Sales"
        title="Returns desk"
        subtitle="Sale refunds, rental receive, service refunds, and subscription cancellations — one desk."
        action={
          <Button asChild size="sm" variant="secondary">
            <Link href="/settings/returns">
              <Settings className="mr-1.5 size-4" />
              Return settings
            </Link>
          </Button>
        }
      />

      <ModeTabs
        tabs={availableTabs.map((t) => ({ id: t.id, label: t.label }))}
        active={activeTab}
        onChange={selectTab}
      />

      {activeTab === "sale" ? <SaleReturnsDesk /> : null}
      {activeTab === "rental" ? <RentalReturnsDesk /> : null}
      {activeTab === "service" ? <ServiceRefundDesk /> : null}
      {activeTab === "subscription" ? <SubscriptionCancelDesk /> : null}
    </div>
  );
}
