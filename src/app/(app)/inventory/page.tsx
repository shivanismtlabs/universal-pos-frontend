"use client";

/**
 * Inventory Management hub — Universal POS
 * Stock levels, in/out, reorder, damage, physical audit, ledger.
 * Purchases/suppliers/transfer live as linked modules.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  inventoryApi,
  tenantsApi,
} from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { canWriteCatalog } from "@/lib/roles";
import { useAuthStore } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Tab =
  | "levels"
  | "in"
  | "out"
  | "damage"
  | "audit"
  | "ledger"
  | "alerts"
  | "warehouses";

export default function InventoryPage() {
  const roles = useAuthStore((s) => s.user?.roles);
  const canWrite = canWriteCatalog(roles);
  const [tab, setTab] = useState<Tab>("levels");
  const [locationId, setLocationId] = useState("");

  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });

  const activeLoc =
    locationId ||
    locations.data?.find((l) => l.isActive !== false)?.id ||
    locations.data?.[0]?.id ||
    "";

  const tabs: { id: Tab; label: string }[] = [
    { id: "levels", label: "Stock levels" },
    { id: "alerts", label: "Low stock" },
    { id: "in", label: "Stock In" },
    { id: "out", label: "Stock Out" },
    { id: "damage", label: "Damaged" },
    { id: "audit", label: "Physical audit" },
    { id: "ledger", label: "Ledger" },
    { id: "warehouses", label: "Locations" },
  ];

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#eef1f4] pb-3">
        <div>
          <p className="text-[0.65rem] font-bold tracking-[0.12em] text-[#1a56db] uppercase">
            Inventory
          </p>
          <h1 className="mt-0.5 text-[1.4rem] font-semibold text-[#0b1f33]">
            Inventory management
          </h1>
          <p className="mt-0.5 text-[0.8rem] text-[#5a6b7d]">
            Multi-location stock · transfers · purchases · audits
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" asChild>
            <Link href="/transfers">Stock transfer</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/suppliers">Suppliers & POs</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/adjustments">Adjustments history</Link>
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-[0.7rem]">Location</Label>
          <select
            className="block h-9 min-w-[180px] rounded-md border border-[#dce3ec] px-2 text-sm"
            value={activeLoc}
            onChange={(e) => setLocationId(e.target.value)}
          >
            {(locations.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.type ? ` (${l.type})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-[#eef1f4]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px",
              tab === t.id
                ? "border-[#1a56db] text-[#1a56db]"
                : "border-transparent text-[#5a6b7d]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "levels" && activeLoc ? (
        <LevelsTab locationId={activeLoc} canWrite={canWrite} />
      ) : null}
      {tab === "alerts" ? <AlertsTab locationId={activeLoc} /> : null}
      {tab === "in" && activeLoc ? (
        <MoveTab mode="in" locationId={activeLoc} canWrite={canWrite} />
      ) : null}
      {tab === "out" && activeLoc ? (
        <MoveTab mode="out" locationId={activeLoc} canWrite={canWrite} />
      ) : null}
      {tab === "damage" && activeLoc ? (
        <DamageTab locationId={activeLoc} canWrite={canWrite} />
      ) : null}
      {tab === "audit" && activeLoc ? (
        <AuditTab locationId={activeLoc} canWrite={canWrite} />
      ) : null}
      {tab === "ledger" ? <LedgerTab locationId={activeLoc} /> : null}
      {tab === "warehouses" ? <WarehousesTab canWrite={canWrite} /> : null}
    </div>
  );
}

function LevelsTab({
  locationId,
  canWrite,
}: {
  locationId: string;
  canWrite: boolean;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const levels = useQuery({
    queryKey: ["inv-levels", locationId, q, lowOnly],
    queryFn: () =>
      inventoryApi.listLevels({
        locationId,
        q: q || undefined,
        lowStock: lowOnly || undefined,
        includeZero: true,
      }),
  });

  const [reorderId, setReorderId] = useState<string | null>(null);
  const [rp, setRp] = useState("");
  const [rq, setRq] = useState("");

  const saveReorder = useMutation({
    mutationFn: () =>
      inventoryApi.setReorder({
        locationId,
        stockLevelId: reorderId!,
        reorderPoint: rp === "" ? undefined : Number(rp),
        reorderQty: rq === "" ? undefined : Number(rq),
      }),
    onSuccess: () => {
      toast.success("Reorder levels saved");
      setReorderId(null);
      void qc.invalidateQueries({ queryKey: ["inv-levels"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Failed"),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          placeholder="Search SKU / name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => setLowOnly(e.target.checked)}
          />
          Low stock only
        </label>
      </div>
      <div className="overflow-x-auto rounded-md border bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-[#f7f9fb] text-left text-[0.7rem] uppercase text-[#5a6b7d]">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2 text-right">On hand</th>
              <th className="px-3 py-2 text-right">Damaged</th>
              <th className="px-3 py-2 text-right">Reorder @</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {(levels.data?.items ?? []).map((r) => (
              <tr key={r.stockLevelId} className="border-t border-[#f0f3f7]">
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.qtyOnHand} {r.sellUnit}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-amber-800">
                  {r.qtyDamaged}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.reorderPoint ?? "—"}
                </td>
                <td className="px-3 py-2">
                  {r.isLowStock ? (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[0.7rem] font-medium text-amber-800">
                      Low
                    </span>
                  ) : (
                    <span className="text-[#8a9bb0]">OK</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {canWrite ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setReorderId(r.stockLevelId);
                        setRp(
                          r.reorderPoint != null ? String(r.reorderPoint) : "",
                        );
                        setRq(
                          r.reorderQty != null ? String(r.reorderQty) : "",
                        );
                      }}
                    >
                      Reorder
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!levels.data?.items?.length ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-[#5a6b7d]">
                  No stock levels at this location
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {reorderId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-lg bg-white p-4 shadow-lg">
            <h3 className="font-semibold">Set reorder levels</h3>
            <div>
              <Label>Reorder point</Label>
              <Input
                type="number"
                min={0}
                value={rp}
                onChange={(e) => setRp(e.target.value)}
              />
            </div>
            <div>
              <Label>Reorder qty</Label>
              <Input
                type="number"
                min={0}
                value={rq}
                onChange={(e) => setRq(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setReorderId(null)}>
                Cancel
              </Button>
              <Button onClick={() => saveReorder.mutate()}>Save</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AlertsTab({ locationId }: { locationId: string }) {
  const alerts = useQuery({
    queryKey: ["inv-low", locationId],
    queryFn: () => inventoryApi.lowStock(locationId || undefined),
  });
  return (
    <div className="rounded-md border bg-white p-4">
      <p className="mb-3 text-sm text-[#5a6b7d]">
        Items at or below reorder point (defaults to 5 if unset).
      </p>
      <p className="mb-2 text-sm font-semibold">
        {alerts.data?.count ?? 0} alert(s)
      </p>
      <ul className="divide-y text-sm">
        {(alerts.data?.items ?? []).map((i) => (
          <li key={i.stockLevelId} className="flex justify-between py-2">
            <span>
              {i.name}{" "}
              <span className="font-mono text-xs text-[#8a9bb0]">{i.sku}</span>
            </span>
            <span className="text-amber-800">
              {i.qtyOnHand} / reorder {i.reorderPoint ?? 5}
            </span>
          </li>
        ))}
        {!alerts.data?.items?.length ? (
          <li className="py-6 text-center text-[#5a6b7d]">No low stock</li>
        ) : null}
      </ul>
    </div>
  );
}

function MoveTab({
  mode,
  locationId,
  canWrite,
}: {
  mode: "in" | "out";
  locationId: string;
  canWrite: boolean;
}) {
  const qc = useQueryClient();
  const levels = useQuery({
    queryKey: ["inv-levels", locationId],
    queryFn: () =>
      inventoryApi.listLevels({ locationId, includeZero: true }),
  });
  const [stockLevelId, setStockLevelId] = useState("");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");

  const run = useMutation({
    mutationFn: () => {
      const body = {
        locationId,
        reason: reason || undefined,
        lines: [{ stockLevelId, qty: Number(qty) }],
      };
      return mode === "in"
        ? inventoryApi.stockIn(body)
        : inventoryApi.stockOut(body);
    },
    onSuccess: () => {
      toast.success(mode === "in" ? "Stock in recorded" : "Stock out recorded");
      setQty("1");
      setReason("");
      void qc.invalidateQueries({ queryKey: ["inv-levels"] });
      void qc.invalidateQueries({ queryKey: ["inv-ledger"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Failed"),
  });

  if (!canWrite) {
    return <p className="text-sm text-[#5a6b7d]">Read-only for your role.</p>;
  }

  return (
    <div className="max-w-md space-y-3 rounded-md border bg-white p-4">
      <h3 className="font-semibold">
        {mode === "in" ? "Stock In" : "Stock Out"}
      </h3>
      <div>
        <Label>Item</Label>
        <select
          className="h-9 w-full rounded-md border px-2 text-sm"
          value={stockLevelId}
          onChange={(e) => setStockLevelId(e.target.value)}
        >
          <option value="">Select…</option>
          {(levels.data?.items ?? []).map((i) => (
            <option key={i.stockLevelId} value={i.stockLevelId}>
              {i.name} ({i.sku}) — {i.qtyOnHand}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Quantity</Label>
        <Input
          type="number"
          min={0.001}
          step="any"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
      </div>
      <div>
        <Label>Reason</Label>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            mode === "in" ? "GRN, found stock, return…" : "Write-off, usage…"
          }
        />
      </div>
      <Button
        disabled={!stockLevelId || !Number(qty) || run.isPending}
        onClick={() => run.mutate()}
      >
        {mode === "in" ? "Receive stock" : "Issue stock"}
      </Button>
    </div>
  );
}

function DamageTab({
  locationId,
  canWrite,
}: {
  locationId: string;
  canWrite: boolean;
}) {
  const qc = useQueryClient();
  const levels = useQuery({
    queryKey: ["inv-levels", locationId],
    queryFn: () =>
      inventoryApi.listLevels({ locationId, includeZero: true }),
  });
  const damaged = useMemo(
    () => (levels.data?.items ?? []).filter((i) => i.qtyDamaged > 0),
    [levels.data],
  );
  const [stockLevelId, setStockLevelId] = useState("");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");

  const mark = useMutation({
    mutationFn: () =>
      inventoryApi.markDamaged({
        locationId,
        stockLevelId,
        qty: Number(qty),
        reason: reason || undefined,
      }),
    onSuccess: () => {
      toast.success("Moved to damaged");
      void qc.invalidateQueries({ queryKey: ["inv-levels"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Failed"),
  });

  const restore = useMutation({
    mutationFn: (id: string) =>
      inventoryApi.restoreDamaged({
        locationId,
        stockLevelId: id,
        qty: 1,
        reason: "Restored to sellable",
      }),
    onSuccess: () => {
      toast.success("Restored 1 unit");
      void qc.invalidateQueries({ queryKey: ["inv-levels"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Failed"),
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {canWrite ? (
        <div className="space-y-3 rounded-md border bg-white p-4">
          <h3 className="font-semibold">Mark damaged</h3>
          <select
            className="h-9 w-full rounded-md border px-2 text-sm"
            value={stockLevelId}
            onChange={(e) => setStockLevelId(e.target.value)}
          >
            <option value="">Select item…</option>
            {(levels.data?.items ?? []).map((i) => (
              <option key={i.stockLevelId} value={i.stockLevelId}>
                {i.name} — sellable {i.qtyOnHand}
              </option>
            ))}
          </select>
          <Input
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
          <Input
            placeholder="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            disabled={!stockLevelId || mark.isPending}
            onClick={() => mark.mutate()}
          >
            Quarantine
          </Button>
        </div>
      ) : null}
      <div className="rounded-md border bg-white p-4">
        <h3 className="mb-2 font-semibold">Damaged stock</h3>
        <ul className="divide-y text-sm">
          {damaged.map((d) => (
            <li key={d.stockLevelId} className="flex justify-between py-2">
              <span>
                {d.name} · {d.qtyDamaged} {d.sellUnit}
              </span>
              {canWrite ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => restore.mutate(d.stockLevelId)}
                >
                  Restore 1
                </Button>
              ) : null}
            </li>
          ))}
          {!damaged.length ? (
            <li className="py-4 text-[#5a6b7d]">No damaged qty</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

function AuditTab({
  locationId,
  canWrite,
}: {
  locationId: string;
  canWrite: boolean;
}) {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [countsLocal, setCountsLocal] = useState<Record<string, string>>({});

  const list = useQuery({
    queryKey: ["inv-counts", locationId],
    queryFn: () => inventoryApi.listCounts(locationId),
  });
  const detail = useQuery({
    queryKey: ["inv-count", activeId],
    queryFn: () => inventoryApi.getCount(activeId!),
    enabled: Boolean(activeId),
  });

  const create = useMutation({
    mutationFn: () => inventoryApi.createCount({ locationId }),
    onSuccess: (s: { id?: string }) => {
      toast.success("Count session started");
      void qc.invalidateQueries({ queryKey: ["inv-counts"] });
      if (s?.id) setActiveId(s.id);
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Failed"),
  });

  const save = useMutation({
    mutationFn: () => {
      const lines = (detail.data?.lines ?? [])
        .map((l) => ({
          stockLevelId: l.stockLevelId,
          countedQty: Number(
            countsLocal[l.stockLevelId] ??
              (l.countedQty != null ? l.countedQty : l.systemQty),
          ),
        }))
        .filter((l) => Number.isFinite(l.countedQty));
      return inventoryApi.saveCountLines(activeId!, lines);
    },
    onSuccess: () => {
      toast.success("Counts saved");
      void qc.invalidateQueries({ queryKey: ["inv-count", activeId] });
    },
  });

  const complete = useMutation({
    mutationFn: async () => {
      await save.mutateAsync();
      return inventoryApi.completeCount(activeId!, true);
    },
    onSuccess: () => {
      toast.success("Audit complete — stock adjusted to counted qty");
      void qc.invalidateQueries({ queryKey: ["inv-counts"] });
      void qc.invalidateQueries({ queryKey: ["inv-levels"] });
      setActiveId(null);
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Failed"),
  });

  return (
    <div className="space-y-4">
      {canWrite ? (
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          Start physical stock audit
        </Button>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#f7f9fb] text-left text-[0.7rem] uppercase text-[#5a6b7d]">
              <tr>
                <th className="px-3 py-2">Session</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Lines</th>
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).map((c) => (
                <tr
                  key={c.id}
                  className="border-t cursor-pointer hover:bg-[#fafcfe]"
                  onClick={() => setActiveId(c.id)}
                >
                  <td className="px-3 py-2">
                    {new Date(c.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 capitalize">{c.status}</td>
                  <td className="px-3 py-2">{c.lineCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {activeId && detail.data ? (
          <div className="space-y-2 rounded-md border bg-white p-3">
            <h3 className="font-semibold">Count lines</h3>
            <div className="max-h-[360px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[0.7rem] uppercase text-[#5a6b7d]">
                  <tr>
                    <th className="py-1">Item</th>
                    <th className="py-1 text-right">System</th>
                    <th className="py-1 text-right">Counted</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.data.lines.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="py-1.5">
                        {l.product?.name}
                        <div className="font-mono text-[0.65rem] text-[#8a9bb0]">
                          {l.product?.skuCode}
                        </div>
                      </td>
                      <td className="py-1.5 text-right">{l.systemQty}</td>
                      <td className="py-1.5 text-right">
                        <Input
                          className="ml-auto h-8 w-20 text-right"
                          disabled={detail.data.status === "completed"}
                          value={
                            countsLocal[l.stockLevelId] ??
                            (l.countedQty != null
                              ? String(l.countedQty)
                              : String(l.systemQty))
                          }
                          onChange={(e) =>
                            setCountsLocal((m) => ({
                              ...m,
                              [l.stockLevelId]: e.target.value,
                            }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detail.data.status !== "completed" && canWrite ? (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => save.mutate()}>
                  Save counts
                </Button>
                <Button onClick={() => complete.mutate()}>
                  Complete & apply
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LedgerTab({ locationId }: { locationId: string }) {
  const [type, setType] = useState("");
  const ledger = useQuery({
    queryKey: ["inv-ledger", locationId, type],
    queryFn: () =>
      inventoryApi.listLedger({
        locationId: locationId || undefined,
        type: type || undefined,
        limit: 100,
      }),
  });

  return (
    <div className="space-y-2">
      <select
        className="h-9 rounded-md border px-2 text-sm"
        value={type}
        onChange={(e) => setType(e.target.value)}
      >
        <option value="">All types</option>
        {[
          "stock_in",
          "stock_out",
          "adjustment",
          "transfer_in",
          "transfer_out",
          "purchase_receive",
          "purchase_return",
          "damage",
          "audit",
        ].map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <div className="overflow-x-auto rounded-md border bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-[#f7f9fb] text-left text-[0.7rem] uppercase text-[#5a6b7d]">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">Δ</th>
              <th className="px-3 py-2 text-right">After</th>
              <th className="px-3 py-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {(ledger.data?.items ?? []).map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 text-xs text-[#5a6b7d]">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{r.type}</td>
                <td className="px-3 py-2">{r.product?.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.qtyDelta > 0 ? `+${r.qtyDelta}` : r.qtyDelta}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.qtyAfter}
                </td>
                <td className="px-3 py-2 text-[#5a6b7d]">
                  {r.reason || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WarehousesTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient();
  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState("warehouse");
  const [address, setAddress] = useState("");

  const create = useMutation({
    mutationFn: () =>
      tenantsApi.createLocation({
        name: name.trim(),
        code: code.trim() || undefined,
        type,
        address: address.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Location created");
      setName("");
      setCode("");
      setAddress("");
      void qc.invalidateQueries({ queryKey: ["locations"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Failed"),
  });

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      {canWrite ? (
        <div className="space-y-2 rounded-md border bg-white p-4">
          <h3 className="font-semibold">Add location / warehouse</h3>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
          <Label>Code</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} />
          <Label>Type</Label>
          <select
            className="h-9 w-full rounded-md border px-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="store">Store</option>
            <option value="branch">Branch</option>
            <option value="warehouse">Warehouse</option>
            <option value="office">Office</option>
            <option value="other">Other</option>
          </select>
          <Label>Address</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          <Button
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            Create
          </Button>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#f7f9fb] text-left text-[0.7rem] uppercase text-[#5a6b7d]">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(locations.data ?? []).map((l) => (
              <tr key={l.id} className="border-t">
                <td className="px-3 py-2 font-medium">{l.name}</td>
                <td className="px-3 py-2 font-mono text-xs">{l.code}</td>
                <td className="px-3 py-2 capitalize">{l.type ?? "store"}</td>
                <td className="px-3 py-2">
                  {l.isActive === false ? "Inactive" : "Active"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
