"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { restaurantApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { cn } from "@/lib/utils";
import {
  DiningEmpty,
  DiningShell,
  DiningStatusBadge,
} from "@/components/dining-chrome";
import { Button } from "@/components/ui/button";

const STEPS = [
  "new",
  "accepted",
  "preparing",
  "ready",
  "served",
  "cancelled",
] as const;

const COLS = [
  { id: "new", title: "New", match: (s: string) => s === "new" },
  {
    id: "preparing",
    title: "Preparing",
    match: (s: string) => s === "accepted" || s === "preparing",
  },
  { id: "ready", title: "Ready", match: (s: string) => s === "ready" },
] as const;

export default function KitchenPage() {
  const qc = useQueryClient();
  const { hasCapability } = useBootstrap();
  const allowed =
    hasCapability("KOT") || hasCapability("KITCHEN") || hasCapability("KDS");
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
      <DiningShell
        title="Kitchen"
        subtitle="Enable KOT in Capabilities to show kitchen tickets."
      >
        <DiningEmpty
          title="Kitchen is off"
          detail="This screen stays hidden for shops that do not use kitchen tickets."
        />
      </DiningShell>
    );
  }

  const items = kots.data ?? [];

  return (
    <DiningShell
      title="Kitchen"
      subtitle="Ticket status only. KOTs are never deleted. Inventory is not deducted here."
    >
      {!kots.isLoading && !items.length ? (
        <DiningEmpty
          title="No kitchen tickets"
          detail="Open a dining order, add items at Counter, then Send KOT."
        />
      ) : hasCapability("KDS") ? (
        <div className="grid gap-3 md:grid-cols-3">
          {COLS.map((col) => {
            const list = items.filter((o) => col.match(o.status));
            return (
              <section
                key={col.id}
                className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc]"
              >
                <div className="flex items-center justify-between border-b border-[#eef1f4] px-3 py-2.5">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8b9bb0]">
                    {col.title}
                  </h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[0.7rem] font-semibold tabular-nums text-[#0b1f33] ring-1 ring-[#e2e8f0]">
                    {list.length}
                  </span>
                </div>
                <div className="space-y-2 p-2.5">
                  {list.map((o) => (
                    <KotCard
                      key={o.id}
                      o={o}
                      compact
                      cancelId={cancelId}
                      cancelReason={cancelReason}
                      setCancelId={setCancelId}
                      setCancelReason={setCancelReason}
                      pending={setStatus.isPending}
                      onStatus={(status) => {
                        if (status === "cancelled") {
                          setCancelId(o.id);
                          return;
                        }
                        setStatus.mutate({ id: o.id, status });
                      }}
                      onCancel={() =>
                        setStatus.mutate({
                          id: o.id,
                          status: "cancelled",
                          cancelReason: cancelReason.trim(),
                        })
                      }
                    />
                  ))}
                  {!list.length ? (
                    <p className="px-2 py-6 text-center text-xs text-[#8b9bb0]">
                      Empty
                    </p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {items.map((o) => (
            <KotCard
              key={o.id}
              o={o}
              cancelId={cancelId}
              cancelReason={cancelReason}
              setCancelId={setCancelId}
              setCancelReason={setCancelReason}
              pending={setStatus.isPending}
              onStatus={(status) => {
                if (status === "cancelled") {
                  setCancelId(o.id);
                  return;
                }
                setStatus.mutate({ id: o.id, status });
              }}
              onCancel={() =>
                setStatus.mutate({
                  id: o.id,
                  status: "cancelled",
                  cancelReason: cancelReason.trim(),
                })
              }
            />
          ))}
        </div>
      )}
    </DiningShell>
  );
}

function KotCard({
  o,
  compact,
  cancelId,
  cancelReason,
  setCancelId,
  setCancelReason,
  pending,
  onStatus,
  onCancel,
}: {
  o: {
    id: string;
    kotNumber: string;
    orderNumber?: string;
    tableName?: string | null;
    stationName?: string | null;
    diningMode?: string;
    aging: string;
    status: string;
    specialInstructions?: string | null;
    lines: Array<{ id: string; quantity: number; name: string; notes?: string | null }>;
  };
  compact?: boolean;
  cancelId: string | null;
  cancelReason: string;
  setCancelId: (id: string | null) => void;
  setCancelReason: (v: string) => void;
  pending: boolean;
  onStatus: (status: string) => void;
  onCancel: () => void;
}) {
  return (
    <article
      className={cn(
        "rounded-xl border border-[#e2e8f0] bg-white",
        compact ? "p-3" : "p-4",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#0b1f33]">
            {o.kotNumber}
            {o.tableName ? (
              <span className="ml-1.5 font-medium text-[#5a6b7d]">
                · {o.tableName}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-[#8b9bb0]">
            {o.stationName ?? "Unassigned"}
            {o.diningMode ? ` · ${o.diningMode.replaceAll("_", " ")}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <DiningStatusBadge value={o.status} />
          <DiningStatusBadge value={o.aging} />
        </div>
      </div>
      <ul className="mt-2.5 space-y-1 rounded-lg bg-[#f8fafc] px-3 py-2 text-sm text-[#0b1f33]">
        {o.lines.map((line) => (
          <li key={line.id}>
            <span className="tabular-nums text-[#5a6b7d]">{line.quantity}×</span>{" "}
            {line.name}
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
      <div className="mt-2.5 flex flex-wrap gap-1">
        {STEPS.map((step) => {
          const active = o.status === step;
          return (
            <button
              key={step}
              type="button"
              disabled={active || pending}
              onClick={() => onStatus(step)}
              className={cn(
                "rounded-md border px-2 py-1 text-[0.65rem] font-semibold capitalize",
                active
                  ? "border-[#1a56db] bg-[#eff6ff] text-[#1a56db]"
                  : "border-[#e2e8f0] bg-white text-[#5a6b7d] hover:bg-[#f8fafc]",
              )}
            >
              {step}
            </button>
          );
        })}
      </div>
      {cancelId === o.id ? (
        <div className="mt-2 flex gap-2">
          <input
            className="h-8 flex-1 rounded-md border border-[#d9e0ea] px-2 text-sm"
            placeholder="Cancel reason (required)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            disabled={!cancelReason.trim()}
            onClick={onCancel}
          >
            Confirm
          </Button>
        </div>
      ) : null}
    </article>
  );
}
