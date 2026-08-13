"use client";

import { useEffect, useMemo, useState, Fragment } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRightLeft, Package } from "lucide-react";
import { inventoryApi, tenantsApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { canWriteCatalog } from "@/lib/roles";
import { useAuthStore } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, PageSkeleton } from "@/components/page-header";
import { FieldError } from "@/components/ui/form";
import {
  stockTransferSchema,
  zodFieldErrors,
  zodMessages,
} from "@/lib/validations";

type Line = {
  productId: string;
  name: string;
  sku: string;
  qty: string;
  max: number;
  unit: string;
};

/**
 * Zoho-style Inventory → Stock transfer — history list + new transfer.
 */
export default function StockTransferPage() {
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.user?.roles);
  const canWrite = canWriteCatalog(roles);
  const [q, setQ] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const history = useQuery({
    queryKey: ["stock-transfers"],
    queryFn: () => inventoryApi.listStockTransfers(100),
  });

  const items = useMemo(() => {
    const list = history.data?.items ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (r) =>
        r.fromLocationName.toLowerCase().includes(needle) ||
        r.toLocationName.toLowerCase().includes(needle) ||
        (r.notes ?? "").toLowerCase().includes(needle) ||
        r.actorName.toLowerCase().includes(needle) ||
        r.lines.some(
          (l) =>
            l.productName.toLowerCase().includes(needle) ||
            l.sku.toLowerCase().includes(needle),
        ),
    );
  }, [history.data, q]);

  if (history.isLoading && !history.data) {
    return <PageSkeleton rows={8} />;
  }

  return (
    <div className="flex min-h-0 flex-col gap-4 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.65rem] font-bold tracking-[0.12em] text-[#1a56db] uppercase">
            Inventory
          </p>
          <h1 className="mt-0.5 text-[1.35rem] font-semibold tracking-tight text-[#0b1f33]">
            Stock transfer
          </h1>
          <p className="mt-1 max-w-xl text-[0.85rem] text-[#5a6b7d]">
            Move quantity between locations. History lists every completed
            transfer with lines and staff.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link href="/adjustments">Adjustments</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/inventory">Stock levels</Link>
          </Button>
          {canWrite ? (
            <Button size="sm" onClick={() => setComposerOpen(true)}>
              + New transfer
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e4e9f0] bg-white px-4 py-2.5">
        <Input
          className="h-9 max-w-sm flex-1 text-[0.8125rem]"
          placeholder="Search location, product, SKU, notes, or staff"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="text-[0.75rem] text-[#8b9bb0]">
          {items.length} record{items.length === 1 ? "" : "s"}
        </span>
      </div>

      {!items.length ? (
        <EmptyState
          title="No stock transfers yet"
          detail="Transfers between stores or warehouses appear here with from → to, qty, and who moved them."
          action={
            canWrite ? (
              <Button type="button" onClick={() => setComposerOpen(true)}>
                + New transfer
              </Button>
            ) : undefined
          }
        />
      ) : (
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#e4e9f0] bg-white shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
          <div className="max-h-[min(60dvh,32rem)] overflow-auto overscroll-contain [scrollbar-gutter:stable]">
            <table className="w-full min-w-[48rem] text-left text-[0.8125rem]">
              <thead className="sticky top-0 z-[1] border-b border-[#eef1f4] bg-[#f8fafc] text-[0.7rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-3 py-2.5">From</th>
                  <th className="px-3 py-2.5">To</th>
                  <th className="px-3 py-2.5 text-right">Lines</th>
                  <th className="px-3 py-2.5 text-right">Qty</th>
                  <th className="px-3 py-2.5">Notes</th>
                  <th className="px-4 py-2.5">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef1f4]">
                {items.map((r) => {
                  const open = expandedId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        className="cursor-pointer hover:bg-[#fafbfc]"
                        onClick={() =>
                          setExpandedId(open ? null : r.id)
                        }
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-[#5a6b7d]">
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-3 font-medium text-[#0b1f33]">
                          {r.fromLocationName}
                        </td>
                        <td className="px-3 py-3 font-medium text-[#0b1f33]">
                          {r.toLocationName}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-[#5a6b7d]">
                          {r.lineCount}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums text-[#1341a8]">
                          {r.totalQty}
                        </td>
                        <td className="max-w-[12rem] truncate px-3 py-3 text-[#5a6b7d]">
                          {r.notes || "—"}
                        </td>
                        <td className="px-4 py-3 text-[#5a6b7d]">
                          {r.actorName}
                        </td>
                      </tr>
                      {open ? (
                        <tr className="bg-[#f8fafc]">
                          <td colSpan={7} className="px-4 py-3">
                            <ul className="space-y-1.5 text-[0.8rem]">
                              {r.lines.map((l, i) => (
                                <li
                                  key={`${r.id}-${l.sku}-${i}`}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#eef1f4] bg-white px-3 py-2"
                                >
                                  <span className="min-w-0">
                                    <span className="font-medium text-[#0b1f33]">
                                      {l.productName}
                                    </span>
                                    <span className="ml-2 font-mono text-[0.72rem] text-[#8b9bb0]">
                                      {l.sku}
                                    </span>
                                  </span>
                                  <span className="tabular-nums font-semibold text-[#1341a8]">
                                    {l.qty}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {composerOpen ? (
        <TransferComposer
          onClose={() => setComposerOpen(false)}
          onDone={() => {
            setComposerOpen(false);
            void qc.invalidateQueries({ queryKey: ["stock-transfers"] });
          }}
        />
      ) : null}
    </div>
  );
}

function TransferComposer({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [q, setQ] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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
      const payload = lines
        .map((l) => ({ productId: l.productId, qty: l.qty }))
        .filter((l) => Number(l.qty) > 0);
      const parsed = stockTransferSchema.safeParse({
        fromLocationId: fromId,
        toLocationId: toId,
        notes,
        lines: payload,
      });
      if (!parsed.success) {
        setFieldErrors(zodFieldErrors(parsed.error));
        toast.error(zodMessages(parsed.error)[0] ?? "Check the form");
        throw new Error(zodMessages(parsed.error)[0] ?? "Invalid transfer");
      }
      setFieldErrors({});
      return inventoryApi.transferStock({
        fromLocationId: parsed.data.fromLocationId,
        toLocationId: parsed.data.toLocationId,
        notes: parsed.data.notes?.trim() || undefined,
        lines: parsed.data.lines,
      });
    },
    onSuccess: (data) => {
      toast.success(`Transferred ${data.lines.length} line(s)`);
      onDone();
    },
    onError: (e) => {
      if (e instanceof ApiError) toast.error(e.messages.join(", "));
    },
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
    setFieldErrors((f) => ({ ...f, lines: "" }));
  }

  const canSubmit = !transfer.isPending;

  const fromName = activeLocations.find((l) => l.id === fromId)?.name ?? "—";
  const toName = activeLocations.find((l) => l.id === toId)?.name ?? "—";

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#0b1f33]/45"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[#e4e9f0] bg-white shadow-xl sm:rounded-xl">
        <div className="shrink-0 border-b border-[#eef1f4] px-5 py-4">
          <h2 className="text-lg font-semibold text-[#0b1f33]">New transfer</h2>
          <p className="mt-1 text-[0.8rem] text-[#5a6b7d]">
            Move stock from one location to another.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
          {activeLocations.length < 2 ? (
            <div className="rounded-xl border border-[#f5c2c2] bg-[#fff6f6] px-4 py-3 text-sm text-[#a01818]">
              You need at least two active locations to transfer.
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr]">
            <div>
              <Label>From location</Label>
              <select
                className="mt-1.5 h-10 w-full rounded-lg border border-[#e4e9f0] bg-white px-2 text-sm"
                value={fromId}
                onChange={(e) => {
                  setFromId(e.target.value);
                  setLines([]);
                  setFieldErrors((f) => ({
                    ...f,
                    fromLocationId: "",
                    toLocationId: "",
                  }));
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
              <FieldError message={fieldErrors.fromLocationId} />
            </div>
            <div className="flex items-end justify-center pb-2">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e8eefb] text-[#1a56db]">
                <ArrowRightLeft className="h-5 w-5" />
              </span>
            </div>
            <div>
              <Label>To location</Label>
              <select
                className="mt-1.5 h-10 w-full rounded-lg border border-[#e4e9f0] bg-white px-2 text-sm"
                value={toId}
                onChange={(e) => {
                  setToId(e.target.value);
                  setFieldErrors((f) => ({ ...f, toLocationId: "" }));
                }}
              >
                <option value="">Select…</option>
                {activeLocations.map((l) => (
                  <option key={l.id} value={l.id} disabled={l.id === fromId}>
                    {l.name}
                    {l.code ? ` (${l.code})` : ""}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.toLocationId} />
            </div>
          </div>

          <div>
            <Label>Notes (optional)</Label>
            <Input
              className="mt-1.5"
              placeholder="Optional note (for example: weekend restock)"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setFieldErrors((f) => ({ ...f, notes: "" }));
              }}
            />
            <FieldError message={fieldErrors.notes} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-[#e4e9f0] bg-[#fafbfc] p-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-[#0b1f33]">
                    On hand at {fromName}
                  </h3>
                </div>
                <Input
                  className="h-9 w-40"
                  placeholder="Search…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <ul className="mt-2 max-h-52 divide-y divide-[#eef1f4] overflow-y-auto">
                {(stock.data ?? []).map((row) => (
                  <li
                    key={row.stockLevelId}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#0b1f33]">
                        {row.name}
                      </p>
                      <p className="truncate text-xs text-[#5a6b7d]">
                        {row.productSku || row.sku} · {row.qtyOnHand}{" "}
                        {row.sellUnit}
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
                  <li className="py-6 text-center text-sm text-[#5a6b7d]">
                    Loading…
                  </li>
                ) : null}
                {!stock.isLoading && !(stock.data ?? []).length ? (
                  <li className="py-6 text-center text-sm text-[#5a6b7d]">
                    No quantity on hand here.
                  </li>
                ) : null}
              </ul>
            </section>

            <section className="rounded-xl border border-[#e4e9f0] bg-[#fafbfc] p-3">
              <h3 className="text-sm font-semibold text-[#0b1f33]">
                Transfer cart → {toName}
              </h3>
              <FieldError message={fieldErrors.lines} />
              <ul className="mt-2 max-h-52 space-y-2 overflow-y-auto">
                {lines.map((l) => (
                  <li
                    key={l.productId}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-[#eef1f4] bg-white px-3 py-2"
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
                      onChange={(e) => {
                        setLines((prev) =>
                          prev.map((x) =>
                            x.productId === l.productId
                              ? { ...x, qty: e.target.value }
                              : x,
                          ),
                        );
                        setFieldErrors((f) => ({ ...f, lines: "" }));
                      }}
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
                  <li className="rounded-lg bg-white px-4 py-8 text-center text-sm text-[#5a6b7d]">
                    Add products from the left.
                  </li>
                ) : null}
              </ul>
            </section>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[#eef1f4] px-5 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSubmit}
            onClick={() => transfer.mutate()}
          >
            {transfer.isPending
              ? "Transferring…"
              : `Move to ${toName || "destination"}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
