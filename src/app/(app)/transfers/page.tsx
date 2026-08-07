"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRightLeft, Package } from "lucide-react";
import { inventoryApi, tenantsApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

type Line = {
  productId: string;
  name: string;
  sku: string;
  qty: string;
  max: number;
  unit: string;
};

/**
 * Multi-location stock transfer — works for any qty-tracked catalog product
 * across any business type (grocery, fashion, furniture, pool, hybrid…).
 */
export default function StockTransferPage() {
  const qc = useQueryClient();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [q, setQ] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);

  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });

  const activeLocations = useMemo(
    () => (locations.data ?? []).filter((l) => l.isActive !== false),
    [locations.data],
  );

  useEffect(() => {
    if (!activeLocations.length || fromId) return;
    setFromId(activeLocations[0]?.id ?? "");
    if (activeLocations.length > 1) setToId(activeLocations[1]?.id ?? "");
  }, [activeLocations, fromId]);

  const stock = useQuery({
    queryKey: ["stock-at-location", fromId, q],
    queryFn: () => inventoryApi.listStockAtLocation(fromId, q || undefined),
    enabled: Boolean(fromId),
  });

  const transfer = useMutation({
    mutationFn: () => {
      if (!fromId || !toId) throw new Error("Pick both locations");
      if (fromId === toId) throw new Error("Source and destination must differ");
      const payload = lines
        .map((l) => ({ productId: l.productId, qty: Number(l.qty) }))
        .filter((l) => l.qty > 0);
      if (!payload.length) throw new Error("Add at least one product qty");
      return inventoryApi.transferStock({
        fromLocationId: fromId,
        toLocationId: toId,
        notes: notes.trim() || undefined,
        lines: payload,
      });
    },
    onSuccess: (data) => {
      toast.success(`Transferred ${data.lines.length} line(s)`);
      setLines([]);
      setNotes("");
      void qc.invalidateQueries({ queryKey: ["stock-at-location"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-catalog"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-floor"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-low-stock"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError
          ? e.messages.join(", ")
          : e instanceof Error
            ? e.message
            : "Transfer failed",
      ),
  });

  function addProduct(row: {
    productId: string;
    name: string;
    productSku?: string;
    sku: string;
    qtyOnHand: number;
    sellUnit?: string;
  }) {
    if (lines.some((l) => l.productId === row.productId)) {
      toast.message("Already in transfer — update qty below");
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        productId: row.productId,
        name: row.name,
        sku: row.productSku || row.sku,
        qty: "1",
        max: row.qtyOnHand,
        unit: row.sellUnit || "pcs",
      },
    ]);
  }

  const canSubmit =
    Boolean(fromId) &&
    Boolean(toId) &&
    fromId !== toId &&
    lines.some((l) => Number(l.qty) > 0) &&
    !transfer.isPending;

  const fromName = activeLocations.find((l) => l.id === fromId)?.name ?? "—";
  const toName = activeLocations.find((l) => l.id === toId)?.name ?? "—";

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Stock transfer"
        subtitle="Move quantity between branches or warehouses — any product type that tracks stock (not serial-only rental units)."
      />

      {activeLocations.length < 2 ? (
        <div className="rounded-xl border border-[#f5c2c2] bg-[#fff6f6] px-4 py-3 text-sm text-[#a01818]">
          You need at least two active locations (stores / warehouses) to
          transfer. Add another location for multi-branch shops of any kind.
        </div>
      ) : null}

      <section className="rounded-2xl border border-[#d9e0ea] bg-white p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <div>
            <Label>From location</Label>
            <select
              className="mt-1.5 select-field w-full"
              value={fromId}
              onChange={(e) => {
                setFromId(e.target.value);
                setLines([]);
              }}
            >
              <option value="">Select…</option>
              {activeLocations.map((l) => (
                <option key={l.id} value={l.id} disabled={l.id === toId}>
                  {l.name}
                  {l.code ? ` (${l.code})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end justify-center pb-2">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e8eefb] text-[#1a56db]">
              <ArrowRightLeft className="h-5 w-5" />
            </span>
          </div>
          <div>
            <Label>To location</Label>
            <select
              className="mt-1.5 select-field w-full"
              value={toId}
              onChange={(e) => setToId(e.target.value)}
            >
              <option value="">Select…</option>
              {activeLocations.map((l) => (
                <option key={l.id} value={l.id} disabled={l.id === fromId}>
                  {l.name}
                  {l.code ? ` (${l.code})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4">
          <Label>Notes (optional)</Label>
          <Input
            className="mt-1.5"
            placeholder="e.g. Weekend restock — works for every industry"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#d9e0ea] bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[#0b1f33]">
                On hand at {fromName}
              </h2>
              <p className="text-xs text-[#5a6b7d]">
                Search any SKU or product name
              </p>
            </div>
            <Input
              className="h-9 w-44"
              placeholder="Search…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <ul className="mt-3 max-h-[22rem] divide-y divide-[#eef1f4] overflow-y-auto">
            {(stock.data ?? []).map((row) => (
              <li
                key={row.stockLevelId}
                className="flex items-center justify-between gap-2 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#0b1f33]">
                    {row.name}
                  </p>
                  <p className="truncate text-xs text-[#5a6b7d]">
                    {row.productSku || row.sku} · {row.qtyOnHand} {row.sellUnit}
                    {row.fulfillmentMode ? ` · ${row.fulfillmentMode}` : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!toId || fromId === toId}
                  onClick={() => addProduct(row)}
                >
                  Add
                </Button>
              </li>
            ))}
            {stock.isLoading ? (
              <li className="py-8 text-center text-sm text-[#5a6b7d]">
                Loading stock…
              </li>
            ) : null}
            {!stock.isLoading && !(stock.data ?? []).length ? (
              <li className="py-8 text-center text-sm text-[#5a6b7d]">
                No quantity on hand at this location.
              </li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-2xl border border-[#d9e0ea] bg-white p-5">
          <h2 className="text-sm font-semibold text-[#0b1f33]">
            Transfer cart → {toName}
          </h2>
          <ul className="mt-3 space-y-2">
            {lines.map((l) => (
              <li
                key={l.productId}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-[#eef1f4] bg-[#f8fafc] px-3 py-2"
              >
                <Package className="h-4 w-4 shrink-0 text-[#1a56db]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.name}</p>
                  <p className="text-xs text-[#5a6b7d]">
                    {l.sku} · max {l.max} {l.unit}
                  </p>
                </div>
                <Input
                  className="h-9 w-20"
                  inputMode="decimal"
                  value={l.qty}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((x) =>
                        x.productId === l.productId
                          ? { ...x, qty: e.target.value }
                          : x,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="text-xs font-medium text-[#c81e1e]"
                  onClick={() =>
                    setLines((prev) =>
                      prev.filter((x) => x.productId !== l.productId),
                    )
                  }
                >
                  Remove
                </button>
              </li>
            ))}
            {!lines.length ? (
              <li className="rounded-xl bg-[#f4f6fa] px-4 py-10 text-center text-sm text-[#5a6b7d]">
                Add products from the left. Qty may be fractional (kg / L).
              </li>
            ) : null}
          </ul>

          <Button
            type="button"
            className={cn("mt-4 w-full")}
            disabled={!canSubmit}
            onClick={() => transfer.mutate()}
          >
            {transfer.isPending
              ? "Transferring…"
              : `Move to ${toName || "destination"}`}
          </Button>
          <p className="mt-2 text-center text-[0.7rem] text-[#5a6b7d]">
            Atomic: source decreases only when destination is updated.
          </p>
        </section>
      </div>
    </div>
  );
}
