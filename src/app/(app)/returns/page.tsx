"use client";

import { useMemo } from "react";
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
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default function ReturnsPage() {
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["returns"],
    queryFn: () => returnsApi.list({ limit: 50 }),
  });
  const orders = useQuery({
    queryKey: ["orders", "return-pick"],
    queryFn: () => ordersApi.list({ limit: 100, status: "checked_out" }),
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

  const orderDetail = useQuery({
    queryKey: ["order", orderId, "return-units"],
    queryFn: () => ordersApi.get(orderId),
    enabled: Boolean(orderId),
  });

  const returnableUnits = useMemo(() => {
    const items = orderDetail.data?.items ?? [];
    return items
      .filter((i) => i.inventoryUnitId && i.inventoryUnit)
      .map((i) => ({
        id: i.inventoryUnitId as string,
        label: `${i.inventoryUnit?.barcodeSku ?? "Unit"}${
          i.inventoryUnit?.size ? ` · ${i.inventoryUnit.size}` : ""
        }`,
      }));
  }, [orderDetail.data]);

  const create = useMutation({
    mutationFn: (v: CreateReturnInput) =>
      returnsApi.create({
        orderId: v.orderId,
        inventoryUnitId: v.inventoryUnitId,
        cleaningRequired: v.cleaningRequired,
        inspectNotes: v.inspectNotes || undefined,
      }),
    onSuccess: () => {
      toast.success("Return recorded");
      form.reset();
      void qc.invalidateQueries({ queryKey: ["returns"] });
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
    }) =>
      returnsApi.inspect(id, {
        inspectStatus: status,
      }),
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

  const checkedOut = orders.data?.items ?? [];
  const returns = list.data?.items ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
      <header>
        <p className="text-sm tracking-[0.2em] text-[#0f766e] uppercase">
          Returns
        </p>
        <h1 className="display mt-2 text-3xl text-[#111827] sm:text-4xl">
          Receive &amp; inspect
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#6b7280]">
          Left side lists returns you already recorded. Use the form to receive
          a checked-out rental (try demo order{" "}
          <span className="font-medium text-[#111827]">ORD-DEMO-OUT</span>).
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
          <div className="flex items-end justify-between border-b border-[#e5e7eb] px-5 py-4">
            <div>
              <h2 className="display text-2xl text-[#111827]">Return queue</h2>
              <p className="mt-1 text-sm text-[#6b7280]">
                {list.isLoading ? "Loading…" : `${returns.length} recorded`}
              </p>
            </div>
          </div>

          {!list.isLoading && !returns.length ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-semibold text-[#111827]">
                No returns recorded yet
              </p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[#6b7280]">
                Yeh list empty isliye hai kyunki abhi koi return event save nahi
                hua. Pehle right side se{" "}
                <strong className="font-semibold text-[#374151]">
                  Record return
                </strong>{" "}
                karo — phir yahan dikhega.
              </p>
              <p className="mt-4 text-xs text-[#9ca3af]">
                Checked-out orders ready: {checkedOut.length || "…"}
                {checkedOut[0]
                  ? ` (e.g. ${checkedOut[0].orderNumber})`
                  : ""}
              </p>
            </div>
          ) : (
            <ul className="scroll-soft max-h-[32rem] divide-y divide-[#f3f4f6] overflow-y-auto">
              {returns.map((r) => (
                <li key={r.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-[#111827]">
                        {r.inventoryUnit?.barcodeSku ?? "Unit"}
                        {r.inventoryUnit?.size ? (
                          <span className="font-normal text-[#6b7280]">
                            {" "}
                            · {r.inventoryUnit.size}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-xs text-[#9ca3af]">
                        Inspect: {r.inspectStatus ?? "pending"}
                        {" · "}
                        Cleaning:{" "}
                        {r.cleaningCompletedAt
                          ? formatDate(r.cleaningCompletedAt)
                          : r.cleaningRequired
                            ? "Required"
                            : "—"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {!r.inspectStatus ||
                      r.inspectStatus === "needs_cleaning" ? (
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
                      ) : (
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase",
                            "bg-[#ecfdf8] text-[#0f766e]",
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
              ))}
            </ul>
          )}
        </section>

        <form
          className="rounded-2xl border border-[#e5e7eb] bg-white p-5 sm:p-6"
          onSubmit={form.handleSubmit((v) => create.mutate(v))}
          noValidate
        >
          <h2 className="display text-2xl text-[#111827]">Record return</h2>
          <p className="mt-1 text-sm leading-relaxed text-[#6b7280]">
            Select a checked-out order, then the unit that was on that ticket.
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <Label>Checked-out order</Label>
              <select
                className="mt-1.5 select-field"
                {...form.register("orderId", {
                  onChange: () => form.setValue("inventoryUnitId", ""),
                })}
              >
                <option value="">Select</option>
                {checkedOut.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber} · {o.customer?.fullName ?? "Customer"}
                  </option>
                ))}
              </select>
              <FieldError message={form.formState.errors.orderId?.message} />
              {!orders.isLoading && !checkedOut.length ? (
                <p className="mt-1.5 text-xs text-[#b91c1c]">
                  No checked-out orders. Seed demo or checkout from Terminal
                  first.
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-[#9ca3af]">
                  {checkedOut.length} checked-out order
                  {checkedOut.length === 1 ? "" : "s"} available
                </p>
              )}
            </div>

            <div>
              <Label>Inventory unit on this order</Label>
              <select
                className="mt-1.5 select-field"
                disabled={!orderId || orderDetail.isLoading}
                {...form.register("inventoryUnitId")}
              >
                <option value="">
                  {!orderId
                    ? "Select order first"
                    : orderDetail.isLoading
                      ? "Loading units…"
                      : "Select unit"}
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
              {orderId &&
              !orderDetail.isLoading &&
              !returnableUnits.length ? (
                <p className="mt-1.5 text-xs text-[#b91c1c]">
                  Is order pe koi rental unit nahi mila.
                </p>
              ) : null}
            </div>

            <label className="flex items-center gap-2 text-sm text-[#374151]">
              <input type="checkbox" {...form.register("cleaningRequired")} />
              Cleaning required
            </label>

            <div>
              <Label>Notes</Label>
              <Input className="mt-1.5" {...form.register("inspectNotes")} />
            </div>

            <Button type="submit" className="w-full" disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Record return"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
