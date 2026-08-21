"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { restaurantApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

const STEPS = [
  "new",
  "accepted",
  "preparing",
  "ready",
  "served",
  "cancelled",
] as const;

const AGING: Record<string, string> = {
  waiting: "bg-[#dbeafe] text-[#1e40af]",
  delayed: "bg-[#fef3c7] text-[#92400e]",
  critical: "bg-[#fee2e2] text-[#991b1b]",
};

export default function KitchenPage() {
  const qc = useQueryClient();
  const { hasCapability } = useBootstrap();
  const allowed = hasCapability("KOT") || hasCapability("KITCHEN") || hasCapability("KDS");
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const kots = useQuery({
    queryKey: ["restaurant-kots"],
    queryFn: () => restaurantApi.kots(),
    enabled: allowed,
    refetchInterval: 8_000,
  });

  const setStatus = useMutation({
    mutationFn: (opts: { id: string; status: string; cancelReason?: string }) =>
      restaurantApi.updateKot(opts.id, {
        status: opts.status,
        cancelReason: opts.cancelReason,
      }),
    onSuccess: () => {
      setCancelId(null);
      setCancelReason("");
      void qc.invalidateQueries({ queryKey: ["restaurant-kots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!allowed) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-[#0b1f33]">Kitchen</h1>
        <p className="mt-2 text-sm text-[#5a6b7d]">
          Enable KOT in Capabilities. This screen is off for retail, rental, and
          service shops that do not use kitchen tickets.
        </p>
      </div>
    );
  }

  const items = kots.data ?? [];

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Kitchen"
        title="Kitchen display"
        subtitle="KOT status only. Tickets are never deleted. Inventory is not deducted here."
      />

      {!kots.isLoading && !items.length ? (
        <div className="rounded-xl border border-[#d9e0ea] bg-white p-8 text-center text-sm text-[#5a6b7d]">
          No kitchen tickets. Open a dining order, add items, then Send KOT.
        </div>
      ) : hasCapability("KDS") ? (
        <div className="grid gap-4 md:grid-cols-3">
          {(["new", "preparing", "ready"] as const).map((col) => (
            <section key={col} className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8b9bb0]">
                {col}
              </h2>
              <div className="space-y-3">
                {items
                  .filter((o) =>
                    col === "preparing"
                      ? o.status === "accepted" || o.status === "preparing"
                      : o.status === col,
                  )
                  .map((o) => (
                    <div key={o.id} className="rounded-xl border border-[#d9e0ea] bg-white p-3">
                      <p className="text-sm font-semibold">
                        {o.kotNumber}
                        {o.tableName ? ` · ${o.tableName}` : ""}
                      </p>
                      <p className="text-xs text-[#5a6b7d]">
                        {o.stationName ?? "Unassigned"} · {o.aging}
                      </p>
                      <ul className="mt-2 text-sm">
                        {o.lines.map((l) => (
                          <li key={l.id}>
                            {l.quantity} × {l.name}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {STEPS.filter((s) => s !== "cancelled").map((step) => (
                          <Button
                            key={step}
                            variant="secondary"
                            className="h-7 px-2 text-[0.65rem]"
                            disabled={setStatus.isPending}
                            onClick={() =>
                              setStatus.mutate({ id: o.id, status: step })
                            }
                          >
                            {step}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {items.map((o) => (
            <section
              key={o.id}
              className="rounded-2xl border border-[#d9e0ea] bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#0b1f33]">
                    {o.kotNumber}
                    <span className="ml-2 text-xs font-medium text-[#5a6b7d]">
                      {o.orderNumber}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-[#5a6b7d]">
                    {o.diningMode.replaceAll("_", " ")}
                    {o.tableName ? ` · ${o.tableName}` : ""}
                    {o.stationName ? ` · ${o.stationName}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[0.7rem] font-semibold",
                    AGING[o.aging] ?? AGING.waiting,
                  )}
                >
                  {o.aging}
                </span>
              </div>

              <ul className="mt-3 space-y-1 rounded-xl bg-[#f8fafc] p-3 text-sm text-[#0b1f33]">
                {o.lines.map((line) => (
                  <li key={line.id}>
                    {line.quantity} × {line.name}
                    {line.notes ? (
                      <span className="text-xs text-[#5a6b7d]"> — {line.notes}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {o.specialInstructions ? (
                <p className="mt-2 text-xs text-[#5a6b7d]">
                  Note: {o.specialInstructions}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                {STEPS.map((step) => {
                  const active = o.status === step;
                  return (
                    <button
                      key={step}
                      type="button"
                      disabled={active || setStatus.isPending}
                      onClick={() => {
                        if (step === "cancelled") {
                          setCancelId(o.id);
                          return;
                        }
                        setStatus.mutate({ id: o.id, status: step });
                      }}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                        active
                          ? "border-[#1a56db] bg-[#eff6ff] text-[#1a56db]"
                          : "border-[#d9e0ea] bg-white text-[#5a6b7d] hover:bg-[#f8fafc]",
                      )}
                    >
                      {step}
                    </button>
                  );
                })}
              </div>

              {cancelId === o.id ? (
                <div className="mt-3 flex gap-2">
                  <input
                    className="h-9 flex-1 rounded-md border border-[#d9e0ea] px-2 text-sm"
                    placeholder="Cancel reason (required)"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={!cancelReason.trim()}
                    onClick={() =>
                      setStatus.mutate({
                        id: o.id,
                        status: "cancelled",
                        cancelReason: cancelReason.trim(),
                      })
                    }
                  >
                    Confirm cancel
                  </Button>
                </div>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
