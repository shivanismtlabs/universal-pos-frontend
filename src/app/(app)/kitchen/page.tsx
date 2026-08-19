"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ordersApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { cn } from "@/lib/utils";

const KITCHEN_STEPS = [
  "KOT_CREATED",
  "KOT_SENT",
  "PREPARING",
  "READY",
  "SERVED",
  "CANCELLED",
] as const;

type KitchenStep = (typeof KITCHEN_STEPS)[number];

export default function KitchenPage() {
  const qc = useQueryClient();
  const { hasCapability } = useBootstrap();

  const allowed = hasCapability("KOT") || hasCapability("KITCHEN");

  const orders = useQuery({
    queryKey: ["kitchen-orders"],
    queryFn: () => ordersApi.list({ kind: "sale", limit: 80 }),
    enabled: allowed,
    refetchInterval: 15000,
  });

  const items = useMemo(() => {
    const raw = orders.data?.items ?? [];
    return raw
      .filter((o) => {
        const meta = (o.meta ?? {}) as Record<string, unknown>;
        return (
          meta.tableId != null ||
          meta.orderType != null ||
          meta.kitchenStatus != null
        );
      })
      .map((o) => {
        const meta = (o.meta ?? {}) as Record<string, unknown>;
        return {
          ...o,
          kitchenStatus: String(meta.kitchenStatus ?? "KOT_CREATED"),
          orderType: String(meta.orderType ?? "walk_in"),
          tableId: meta.tableId ? String(meta.tableId) : null,
          covers:
            typeof meta.covers === "number"
              ? meta.covers
              : Number(meta.covers ?? 0) || null,
          note: typeof meta.note === "string" ? meta.note : null,
        };
      })
      .sort((a, b) => {
        const ai = KITCHEN_STEPS.indexOf(a.kitchenStatus as KitchenStep);
        const bi = KITCHEN_STEPS.indexOf(b.kitchenStatus as KitchenStep);
        return (ai === -1 ? 0 : ai) - (bi === -1 ? 0 : bi);
      });
  }, [orders.data]);

  const setKitchenStatus = useMutation({
    mutationFn: ({
      orderId,
      next,
      existingMeta,
    }: {
      orderId: string;
      next: KitchenStep;
      existingMeta: Record<string, unknown>;
    }) =>
      ordersApi.update(orderId, {
        meta: {
          ...existingMeta,
          kitchenStatus: next,
          servedAt: next === "SERVED" ? new Date().toISOString() : existingMeta.servedAt,
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["kitchen-orders"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not update order"),
  });

  if (!allowed) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-[#0b1f33]">Kitchen</h1>
        <p className="mt-2 text-sm text-[#5a6b7d]">
          Enable kitchen tickets in Commerce modes &amp; features to use this queue.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-sm uppercase tracking-[0.18em] text-[#5a6b7d]">
          Kitchen / prep queue
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-[#0b1f33]">
          Kitchen display
        </h1>
        <p className="mt-1 text-sm text-[#5a6b7d]">
          Generic preparation queue for any business that uses resources, prep
          stations, or table/order workflows.
        </p>
      </div>

      {!orders.isLoading && !items.length ? (
        <div className="rounded-xl border border-[#d9e0ea] bg-white p-8 text-center text-sm text-[#5a6b7d]">
          No kitchen / prep orders right now.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {items.map((o) => {
            const meta = (o.meta ?? {}) as Record<string, unknown>;
            return (
              <section
                key={o.id}
                className="rounded-2xl border border-[#d9e0ea] bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#0b1f33]">
                      {o.orderNumber}
                    </p>
                    <p className="mt-1 text-xs text-[#5a6b7d]">
                      {o.orderType.replaceAll("_", " ")}
                      {o.tableId ? ` · table ${o.tableId}` : ""}
                      {o.covers ? ` · ${o.covers} covers` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#eff6ff] px-2.5 py-1 text-[0.7rem] font-semibold text-[#1a56db]">
                    {o.kitchenStatus}
                  </span>
                </div>

                <div className="mt-3 rounded-xl bg-[#f8fafc] p-3">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#8b9bb0]">
                    Items
                  </p>
                  <p className="mt-1 text-sm text-[#0b1f33]">
                    {o.productSummary || (o.productNames ?? []).join(", ") || "Order items"}
                  </p>
                  {typeof meta.note === "string" && meta.note.trim() ? (
                    <p className="mt-2 text-xs text-[#5a6b7d]">
                      Note: {meta.note}
                    </p>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {KITCHEN_STEPS.map((step) => {
                    const active = o.kitchenStatus === step;
                    return (
                      <button
                        key={step}
                        type="button"
                        disabled={active || setKitchenStatus.isPending}
                        onClick={() =>
                          setKitchenStatus.mutate({
                            orderId: o.id,
                            next: step,
                            existingMeta: meta,
                          })
                        }
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                          active
                            ? "border-[#1a56db] bg-[#eff6ff] text-[#1a56db]"
                            : "border-[#d9e0ea] bg-white text-[#5a6b7d] hover:bg-[#f8fafc]",
                        )}
                      >
                        {step.replaceAll("_", " ")}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
