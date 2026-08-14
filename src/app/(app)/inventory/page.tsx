"use client";

/**
 * Inventory Management hub — Universal POS
 * Stock levels, in/out, reorder, damage, physical audit, ledger.
 * Purchases/suppliers/transfer live as linked modules.
 */
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  inventoryApi,
  tenantsApi,
} from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { canWriteCatalog } from "@/lib/roles";
import { useAuthStore } from "@/lib/auth-store";
import { useBranchStore } from "@/lib/branch-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { EntityRowActions } from "@/components/entity-row-actions";
import { PageSkeleton } from "@/components/page-header";
import { FieldError } from "@/components/ui/form";
import {
  stockMoveSchema,
  zodFieldErrors,
  zodMessages,
} from "@/lib/validations";

type Tab =
  | "levels"
  | "in"
  | "out"
  | "damage"
  | "audit"
  | "ledger"
  | "alerts"
  | "warehouses";

const TAB_IDS: Tab[] = [
  "levels",
  "alerts",
  "in",
  "out",
  "damage",
  "audit",
  "ledger",
  "warehouses",
];

function parseTab(raw: string | null): Tab {
  if (raw && TAB_IDS.includes(raw as Tab)) return raw as Tab;
  return "levels";
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={8} />}>
      <InventoryPageInner />
    </Suspense>
  );
}

function InventoryPageInner() {
  const roles = useAuthStore((s) => s.user?.roles);
  const canWrite = canWriteCatalog(roles);
  const search = useSearchParams();
  const router = useRouter();
  /** URL is source of truth — avoids stale state when opening /inventory?tab=alerts */
  const tab = parseTab(search.get("tab"));
  const [locationId, setLocationId] = useState("");
  const branchId = useBranchStore((s) => s.currentLocationId);
  const setBranchId = useBranchStore((s) => s.setCurrentLocationId);

  function selectTab(next: Tab) {
    const qs = next === "levels" ? "" : `?tab=${next}`;
    router.replace(`/inventory${qs}`, { scroll: false });
  }

  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });

  const activeLoc =
    locationId ||
    (branchId && locations.data?.some((l) => l.id === branchId)
      ? branchId
      : "") ||
    locations.data?.find((l) => l.isActive !== false)?.id ||
    locations.data?.[0]?.id ||
    "";

  const activeLocName =
    locations.data?.find((l) => l.id === activeLoc)?.name ?? "—";

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
          <Button variant="ghost" asChild>
            <Link href="/transfers">Stock transfer</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/suppliers">Suppliers & POs</Link>
          </Button>
          <Button variant="ghost" asChild>
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
            onChange={(e) => {
              setLocationId(e.target.value);
              setBranchId(e.target.value);
            }}
          >
            {(locations.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.type ? ` (${l.type})` : ""}
              </option>
            ))}
          </select>
        </div>
        {locations.data && locations.data.length > 1 ? (
          <p className="pb-2 text-[0.75rem] text-[#8b9bb0]">
            Stock is per location — switch the dropdown if this store looks empty.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-[#eef1f4]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => selectTab(t.id)}
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
      {tab === "alerts" ? (
        <AlertsTab locationId={activeLoc} locationName={activeLocName} />
      ) : null}
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
  const [sp, setSp] = useState("");

  const saveReorder = useMutation({
    mutationFn: () =>
      inventoryApi.setReorder({
        locationId,
        stockLevelId: reorderId!,
        reorderPoint: rp === "" ? undefined : Number(rp),
        reorderQty: rq === "" ? undefined : Number(rq),
        sellPrice: sp === "" ? undefined : Number(sp),
      }),
    onSuccess: () => {
      toast.success("Branch price & reorder saved");
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
      <div className="overflow-x-auto rounded-md border border-[#e4e9f0] bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-[#f7f9fb] text-left text-[0.7rem] uppercase text-[#5a6b7d]">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2 text-right">On hand</th>
              <th className="px-3 py-2 text-right">Price</th>
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
                <td className="px-3 py-2 text-right tabular-nums">
                  ₹{Number(r.sellPrice ?? 0).toLocaleString("en-IN")}
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
                    <EntityRowActions
                      onEdit={() => {
                        setReorderId(r.stockLevelId);
                        setRp(
                          r.reorderPoint != null ? String(r.reorderPoint) : "",
                        );
                        setRq(
                          r.reorderQty != null ? String(r.reorderQty) : "",
                        );
                        setSp(
                          r.sellPrice != null ? String(r.sellPrice) : "",
                        );
                      }}
                      editTitle="Edit branch price & reorder"
                    />
                  ) : null}
                </td>
              </tr>
            ))}
            {!levels.data?.items?.length ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-8 text-center text-[#5a6b7d]"
                >
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
            <h3 className="font-semibold">Branch price & reorder</h3>
            <div>
              <Label>Sell price (this branch)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={sp}
                onChange={(e) => setSp(e.target.value)}
              />
            </div>
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

function AlertsTab({
  locationId,
  locationName,
}: {
  locationId: string;
  locationName: string;
}) {
  const [q, setQ] = useState("");
  const alerts = useQuery({
    queryKey: ["inv-low", locationId],
    queryFn: () => inventoryApi.lowStock(locationId || undefined),
  });

  const rows = useMemo(() => {
    const list = alerts.data?.items ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (i) =>
        i.name.toLowerCase().includes(needle) ||
        i.sku.toLowerCase().includes(needle) ||
        (i.location?.name ?? "").toLowerCase().includes(needle),
    );
  }, [alerts.data, q]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e4e9f0] bg-white px-4 py-2.5">
        <Input
          className="h-9 max-w-sm flex-1 text-[0.8125rem]"
          placeholder="Search name or SKU"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="text-[0.75rem] text-[#8b9bb0]">
          {rows.length} alert{rows.length === 1 ? "" : "s"} · at or below
          reorder
        </span>
      </div>

      <section className="overflow-hidden rounded-xl border border-[#e4e9f0] bg-white shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
        <div className="max-h-[min(60dvh,32rem)] overflow-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[0.8125rem]">
            <thead className="sticky top-0 z-[1] bg-[#f8fafc] text-[0.65rem] font-semibold tracking-[0.06em] text-[#5a6b7d] uppercase">
              <tr className="border-b border-[#e4e9f0]">
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5">SKU</th>
                <th className="px-3 py-2.5 text-right">On hand</th>
                <th className="px-3 py-2.5 text-right">Reorder</th>
                <th className="px-3 py-2.5 text-right">Gap</th>
                <th className="px-3 py-2.5">Location</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const rp = i.reorderPoint ?? 5;
                const gap = Math.max(0, rp - Number(i.qtyOnHand));
                return (
                  <tr
                    key={i.stockLevelId}
                    className="border-b border-[#eef2f8] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-medium text-[#0b1f33]">
                      {i.name}
                    </td>
                    <td className="px-3 py-2 font-mono text-[0.75rem] text-[#5a6b7d]">
                      {i.sku}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-800">
                      {i.qtyOnHand}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#5a6b7d]">
                      {rp}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#b45309]">
                      {gap}
                    </td>
                    <td className="px-3 py-2 text-[#5a6b7d]">
                      {i.location?.name ?? locationName}
                    </td>
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-10 text-center text-[#8b9bb0]"
                  >
                    No low stock alerts
                    {locationId ? " at this location" : ""}.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const run = useMutation({
    mutationFn: () => {
      const parsed = stockMoveSchema.safeParse({
        locationId,
        stockLevelId,
        qty,
        reason,
      });
      if (!parsed.success) {
        setFieldErrors(zodFieldErrors(parsed.error));
        toast.error(zodMessages(parsed.error)[0] ?? "Check the form");
        throw new Error(zodMessages(parsed.error)[0] ?? "Invalid stock move");
      }
      setFieldErrors({});
      const body = {
        locationId: parsed.data.locationId,
        reason: parsed.data.reason || undefined,
        lines: [{ stockLevelId: parsed.data.stockLevelId, qty: parsed.data.qty }],
      };
      return mode === "in"
        ? inventoryApi.stockIn(body)
        : inventoryApi.stockOut(body);
    },
    onSuccess: () => {
      toast.success(mode === "in" ? "Stock in recorded" : "Stock out recorded");
      setQty("1");
      setReason("");
      setFieldErrors({});
      void qc.invalidateQueries({ queryKey: ["inv-levels"] });
      void qc.invalidateQueries({ queryKey: ["inv-ledger"] });
    },
    onError: (e: Error) => {
      if (e instanceof ApiError) toast.error(e.message);
    },
  });

  if (!canWrite) {
    return <p className="text-sm text-[#5a6b7d]">Read-only for your role.</p>;
  }

  return (
    <div className="max-w-md space-y-3 rounded-md border border-[#e4e9f0] bg-white p-4">
      <h3 className="font-semibold">
        {mode === "in" ? "Stock In" : "Stock Out"}
      </h3>
      {!locationId ? (
        <FieldError message="Select a location" />
      ) : null}
      <div>
        <Label>Item</Label>
        <select
          className="h-9 w-full rounded-md border border-[#dce3ec] px-2 text-sm"
          value={stockLevelId}
          onChange={(e) => {
            setStockLevelId(e.target.value);
            setFieldErrors((f) => ({ ...f, stockLevelId: "" }));
          }}
        >
          <option value="">Select…</option>
          {(levels.data?.items ?? []).map((i) => (
            <option key={i.stockLevelId} value={i.stockLevelId}>
              {i.name} ({i.sku}) — {i.qtyOnHand}
            </option>
          ))}
        </select>
        <FieldError message={fieldErrors.stockLevelId} />
      </div>
      <div>
        <Label>Quantity</Label>
        <Input
          type="number"
          min={0.001}
          step="any"
          value={qty}
          onChange={(e) => {
            setQty(e.target.value);
            setFieldErrors((f) => ({ ...f, qty: "" }));
          }}
        />
        <FieldError message={fieldErrors.qty} />
      </div>
      <div>
        <Label>Reason</Label>
        <Input
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setFieldErrors((f) => ({ ...f, reason: "" }));
          }}
          placeholder={
            mode === "in" ? "GRN, found stock, return…" : "Write-off, usage…"
          }
        />
        <FieldError message={fieldErrors.reason} />
      </div>
      <Button
        disabled={run.isPending}
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
  const [q, setQ] = useState("");
  const damaged = useMemo(() => {
    const list = (levels.data?.items ?? []).filter((i) => i.qtyDamaged > 0);
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (i) =>
        i.name.toLowerCase().includes(needle) ||
        i.sku.toLowerCase().includes(needle) ||
        i.productSku.toLowerCase().includes(needle),
    );
  }, [levels.data, q]);
  const [stockLevelId, setStockLevelId] = useState("");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const [restoreQty, setRestoreQty] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const mark = useMutation({
    mutationFn: () => {
      const parsed = stockMoveSchema.safeParse({
        locationId,
        stockLevelId,
        qty,
        reason,
      });
      if (!parsed.success) {
        setFieldErrors(zodFieldErrors(parsed.error));
        toast.error(zodMessages(parsed.error)[0] ?? "Check the form");
        throw new Error(zodMessages(parsed.error)[0] ?? "Invalid qty");
      }
      setFieldErrors({});
      return inventoryApi.markDamaged({
        locationId: parsed.data.locationId,
        stockLevelId: parsed.data.stockLevelId,
        qty: parsed.data.qty,
        reason: parsed.data.reason || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Moved to damaged");
      setQty("1");
      setReason("");
      setFieldErrors({});
      void qc.invalidateQueries({ queryKey: ["inv-levels"] });
    },
    onError: (e: Error) => {
      if (e instanceof ApiError) toast.error(e.message);
    },
  });

  const restore = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) => {
      const parsed = stockMoveSchema.safeParse({
        locationId,
        stockLevelId: id,
        qty: amount,
        reason: "Restored to sellable",
      });
      if (!parsed.success) {
        toast.error(zodMessages(parsed.error)[0] ?? "Invalid quantity");
        throw new Error(zodMessages(parsed.error)[0] ?? "Invalid qty");
      }
      return inventoryApi.restoreDamaged({
        locationId: parsed.data.locationId,
        stockLevelId: parsed.data.stockLevelId,
        qty: parsed.data.qty,
        reason: "Restored to sellable",
      });
    },
    onSuccess: () => {
      toast.success("Restored to sellable");
      void qc.invalidateQueries({ queryKey: ["inv-levels"] });
    },
    onError: (e: Error) => {
      if (e instanceof ApiError) toast.error(e.message);
    },
  });

  return (
    <div className="space-y-4">
      {canWrite ? (
        <div className="grid max-w-3xl gap-3 rounded-xl border border-[#e4e9f0] bg-white p-4 sm:grid-cols-2">
          <h3 className="sm:col-span-2 text-sm font-semibold text-[#0b1f33]">
            Mark damaged
          </h3>
          <div className="sm:col-span-2">
            <Label>Item</Label>
            <select
              className="mt-1 h-9 w-full rounded-md border border-[#dce3ec] px-2 text-sm"
              value={stockLevelId}
              onChange={(e) => {
                setStockLevelId(e.target.value);
                setFieldErrors((f) => ({ ...f, stockLevelId: "" }));
              }}
            >
              <option value="">Select item…</option>
              {(levels.data?.items ?? []).map((i) => (
                <option key={i.stockLevelId} value={i.stockLevelId}>
                  {i.name} — sellable {i.qtyOnHand} {i.sellUnit}
                </option>
              ))}
            </select>
            <FieldError message={fieldErrors.stockLevelId} />
          </div>
          <div>
            <Label>Qty</Label>
            <Input
              className="mt-1"
              type="number"
              min={0.001}
              step="any"
              value={qty}
              onChange={(e) => {
                setQty(e.target.value);
                setFieldErrors((f) => ({ ...f, qty: "" }));
              }}
            />
            <FieldError message={fieldErrors.qty} />
          </div>
          <div>
            <Label>Reason</Label>
            <Input
              className="mt-1"
              placeholder="Broken, expired, quarantine…"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setFieldErrors((f) => ({ ...f, reason: "" }));
              }}
            />
            <FieldError message={fieldErrors.reason} />
          </div>
          <div className="sm:col-span-2">
            <Button
              disabled={mark.isPending}
              onClick={() => mark.mutate()}
            >
              Quarantine
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e4e9f0] bg-white px-4 py-2.5">
        <Input
          className="h-9 max-w-sm flex-1 text-[0.8125rem]"
          placeholder="Search damaged items"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="text-[0.75rem] text-[#8b9bb0]">
          {damaged.length} item{damaged.length === 1 ? "" : "s"}
        </span>
      </div>

      <section className="overflow-hidden rounded-xl border border-[#e4e9f0] bg-white shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
        <div className="max-h-[min(60dvh,32rem)] overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-[0.8125rem]">
            <thead className="sticky top-0 z-[1] bg-[#f8fafc] text-[0.65rem] font-semibold tracking-[0.06em] text-[#5a6b7d] uppercase">
              <tr className="border-b border-[#e4e9f0]">
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5">SKU</th>
                <th className="px-3 py-2.5 text-right">Sellable</th>
                <th className="px-3 py-2.5 text-right">Damaged</th>
                <th className="px-3 py-2.5">Unit</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {damaged.map((d) => {
                const max = Number(d.qtyDamaged);
                const entered = restoreQty[d.stockLevelId] ?? "1";
                const amount = Math.min(
                  max,
                  Math.max(0, Number(entered) || 0),
                );
                return (
                  <tr
                    key={d.stockLevelId}
                    className="border-b border-[#eef2f8] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-medium text-[#0b1f33]">
                      {d.name}
                    </td>
                    <td className="px-3 py-2 font-mono text-[0.75rem] text-[#5a6b7d]">
                      {d.sku}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {d.qtyOnHand}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#b45309]">
                      {d.qtyDamaged}
                    </td>
                    <td className="px-3 py-2 text-[#5a6b7d]">{d.sellUnit}</td>
                    <td className="px-3 py-2">
                      {canWrite ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <Input
                            className="h-8 w-16 text-right text-xs tabular-nums"
                            type="number"
                            min={0.001}
                            max={max}
                            step="any"
                            value={entered}
                            onChange={(e) =>
                              setRestoreQty((m) => ({
                                ...m,
                                [d.stockLevelId]: e.target.value,
                              }))
                            }
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={amount <= 0 || restore.isPending}
                            onClick={() =>
                              restore.mutate({
                                id: d.stockLevelId,
                                amount,
                              })
                            }
                          >
                            Restore
                          </Button>
                        </div>
                      ) : (
                        <span className="block text-right text-[#8b9bb0]">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!damaged.length ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-10 text-center text-[#8b9bb0]"
                  >
                    No damaged quantity at this location.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
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
    onSuccess: (s) => {
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
        <div className="rounded-md border border-[#e4e9f0] bg-white">
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
          <div className="space-y-2 rounded-md border border-[#e4e9f0] bg-white p-3">
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
        className="h-9 rounded-md border border-[#dce3ec] px-2 text-sm"
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
      <div className="overflow-x-auto rounded-md border border-[#e4e9f0] bg-white">
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
        <div className="space-y-2 rounded-md border border-[#e4e9f0] bg-white p-4">
          <h3 className="font-semibold">Add location / warehouse</h3>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
          <Label>Code</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} />
          <Label>Type</Label>
          <select
            className="h-9 w-full rounded-md border border-[#dce3ec] px-2 text-sm"
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
      <div className="overflow-hidden rounded-md border border-[#e4e9f0] bg-white">
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
