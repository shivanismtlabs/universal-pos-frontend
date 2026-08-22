"use client";

/**
 * Inventory Management hub — Universal POS
 * Stock levels, in/out, reorder, damage, physical audit, ledger.
 * Purchases/suppliers/transfer live as linked modules.
 */
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
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
import { ItemsImportDialog } from "@/components/items-import-dialog";
import { EntityRowActions } from "@/components/entity-row-actions";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { FieldError } from "@/components/ui/form";
import { TablePager } from "@/components/table-pager";
import { pagerFromMeta } from "@/lib/use-paged-list";
import {
  stockMoveSchema,
  zodFieldErrors,
  zodMessages,
} from "@/lib/validations";
import { formatQtyWithUnit } from "@/lib/sell-units";

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

const fieldSelect =
  "mt-1 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm";
const formCard =
  "space-y-5 rounded-2xl border border-[#e5e7eb] bg-white p-5";

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
  const [importOpen, setImportOpen] = useState(false);
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
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Stock"
        title="Inventory"
        subtitle="How much stock you have in this shop. Import an Excel file to add items and opening qty."
        className="[&>div:last-child]:w-full"
        action={
          <div className="flex w-full flex-wrap items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/transfers">Stock transfer</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/suppliers">Suppliers & POs</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/adjustments">Adjustments history</Link>
            </Button>
            {canWrite ? (
              <Button
                type="button"
                className="ml-auto"
                onClick={() => setImportOpen(true)}
              >
                Import Excel / CSV
              </Button>
            ) : null}
          </div>
        }
      />

      <section className={formCard}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Location *</Label>
            <select
              className={fieldSelect}
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
            {locations.data && locations.data.length > 1 ? (
              <p className="mt-1 text-[0.72rem] text-[#6b7280]">
                Stock is per location — switch here if this store looks empty.
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-[#e5e7eb]">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTab(t.id)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
                tab === t.id
                  ? "border-[#1a56db] text-[#1a56db]"
                  : "border-transparent text-[#6b7280]",
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
      </section>
      <ItemsImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        locationId={activeLoc || undefined}
      />
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
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const levels = useQuery({
    queryKey: ["inv-levels", locationId, q, lowOnly, page],
    queryFn: () =>
      inventoryApi.listLevels({
        locationId,
        q: q || undefined,
        lowStock: lowOnly || undefined,
        includeZero: true,
        page,
        limit: pageSize,
      }),
    placeholderData: (prev) => prev,
  });

  const levelRows = levels.data?.items ?? [];
  const meta = levels.data?.meta;

  useEffect(() => {
    setPage(1);
  }, [q, lowOnly, locationId]);

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
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Search</Label>
          <Input
            className="mt-1"
            placeholder="SKU or name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm text-[#0b1f33]">
          <input
            type="checkbox"
            className="accent-[#1a56db]"
            checked={lowOnly}
            onChange={(e) => setLowOnly(e.target.checked)}
          />
          Low stock only
        </label>
      </div>
      <div className="overflow-x-auto rounded-lg border border-[#e5e7eb]">
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
            {levelRows.map((r) => (
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
      <TablePager
        {...pagerFromMeta(meta, page, pageSize, setPage, levelRows.length)}
      />

      {reorderId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-[#0b1f33]/45"
            aria-label="Close"
            onClick={() => setReorderId(null)}
          />
          <div className="relative z-10 w-full max-w-md space-y-5 rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-[#0b1f33]">
                Branch price & reorder
              </h3>
              <p className="mt-1 text-[0.8rem] text-[#6b7280]">
                Change selling price and when to reorder — only for this shop.
              </p>
            </div>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5a6b7d] hover:bg-[#f1f5f9]"
                aria-label="Close"
                onClick={() => setReorderId(null)}
              >
                ×
              </button>
            </div>
            <div>
              <Label>Sell price (this branch)</Label>
              <Input
                className="mt-1"
                type="number"
                min={0}
                step="0.01"
                value={sp}
                onChange={(e) => setSp(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Reorder point</Label>
                <Input
                  className="mt-1"
                  type="number"
                  min={0}
                  value={rp}
                  onChange={(e) => setRp(e.target.value)}
                />
              </div>
              <div>
                <Label>Reorder qty</Label>
                <Input
                  className="mt-1"
                  type="number"
                  min={0}
                  value={rq}
                  onChange={(e) => setRq(e.target.value)}
                />
              </div>
            </div>
            <Button
              disabled={saveReorder.isPending}
              onClick={() => saveReorder.mutate()}
            >
              {saveReorder.isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              variant="ghost"
              className="ml-2"
              onClick={() => setReorderId(null)}
            >
              Cancel
            </Button>
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
    <div className="space-y-5">
      <div>
        <Label>Search</Label>
        <Input
          className="mt-1"
          placeholder="Name or SKU"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <p className="mt-1 text-[0.72rem] text-[#6b7280]">
          {rows.length} alert{rows.length === 1 ? "" : "s"} at or below reorder.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#e5e7eb]">
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
      </div>
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
    <div className="space-y-5">
      <p className="text-xs text-[#6b7280]">
        {mode === "in"
          ? "Receive stock into this location. Historical ledgers keep the original movement."
          : "Issue stock from this location. Historical ledgers keep the original movement."}
      </p>
      {!locationId ? <FieldError message="Select a location" /> : null}
      <div>
        <Label>Item *</Label>
        <select
          className={fieldSelect}
          value={stockLevelId}
          onChange={(e) => {
            setStockLevelId(e.target.value);
            setFieldErrors((f) => ({ ...f, stockLevelId: "" }));
          }}
        >
          <option value="">Select item</option>
          {(levels.data?.items ?? []).map((i) => (
            <option key={i.stockLevelId} value={i.stockLevelId}>
              {i.name} ({i.sku}) — {i.qtyOnHand}
            </option>
          ))}
        </select>
        <FieldError message={fieldErrors.stockLevelId} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Quantity *</Label>
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
      </div>
      <Button disabled={run.isPending} onClick={() => run.mutate()}>
        {run.isPending ? "Saving…" : "Save"}
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
        <div className="space-y-5">
          <p className="text-xs text-[#6b7280]">
            Move sellable quantity into damaged. Historical orders keep their
            original stock snapshot.
          </p>
          <div>
            <Label>Item *</Label>
            <select
              className={fieldSelect}
              value={stockLevelId}
              onChange={(e) => {
                setStockLevelId(e.target.value);
                setFieldErrors((f) => ({ ...f, stockLevelId: "" }));
              }}
            >
              <option value="">Select item</option>
              {(levels.data?.items ?? []).map((i) => (
                <option key={i.stockLevelId} value={i.stockLevelId}>
                  {i.name} — sellable {i.qtyOnHand} {i.sellUnit}
                </option>
              ))}
            </select>
            <FieldError message={fieldErrors.stockLevelId} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Quantity *</Label>
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
                placeholder="Broken, expired…"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setFieldErrors((f) => ({ ...f, reason: "" }));
                }}
              />
              <FieldError message={fieldErrors.reason} />
            </div>
          </div>
          <Button disabled={mark.isPending} onClick={() => mark.mutate()}>
            {mark.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      ) : null}

      <div>
        <Label>Search</Label>
        <Input
          className="mt-1"
          placeholder="Search damaged items"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <p className="mt-1 text-[0.72rem] text-[#6b7280]">
          {damaged.length} item{damaged.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#e5e7eb]">
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
    <div className="space-y-5">
      {canWrite ? (
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending ? "Starting…" : "Start physical stock audit"}
        </Button>
      ) : null}
      <div className="space-y-5">
        <div className="overflow-x-auto rounded-lg border border-[#e5e7eb]">
          <table className="w-full text-sm">
            <thead className="bg-[#f8fafc] text-left text-[0.7rem] uppercase text-[#6b7280]">
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
                  className="cursor-pointer border-t border-[#e5e7eb] hover:bg-[#f8fafc]"
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
          <div className="space-y-5">
            <p className="text-xs text-[#6b7280]">
              Counted quantity is saved against the system snapshot for this
              session.
            </p>
            <div className="max-h-[360px] overflow-y-auto rounded-lg border border-[#e5e7eb]">
              <table className="w-full text-sm">
                <thead className="bg-[#f8fafc] text-left text-[0.7rem] uppercase text-[#6b7280]">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-right">System</th>
                    <th className="px-3 py-2 text-right">Counted</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.data.lines.map((l) => (
                    <tr key={l.id} className="border-t border-[#e5e7eb]">
                      <td className="px-3 py-2">
                        {l.product?.name}
                        <div className="font-mono text-[0.65rem] text-[#6b7280]">
                          {l.product?.skuCode}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">{l.systemQty}</td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          className="ml-auto h-9 w-24 text-right"
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
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={save.isPending}
                  onClick={() => save.mutate()}
                >
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => complete.mutate()}
                >
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

const LEDGER_TYPE_LABELS: Record<string, string> = {
  opening: "Opening stock",
  stock_in: "Stock in",
  stock_out: "Stock out",
  sale: "Sale",
  customer_return: "Customer return",
  adjustment: "Adjustment",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  purchase_receive: "Purchase receive",
  purchase_return: "Purchase return",
  damage: "Damaged",
  damage_restore: "Damage restore",
  audit: "Physical audit",
  consumption: "Recipe use",
  production_in: "Production in",
  production_out: "Production out",
  expiry: "Expiry",
  reservation: "Reserved",
  reservation_release: "Reserve released",
  rental_out: "Rental out",
  rental_return: "Rental return",
};

function formatLedgerQty(qty: number, unit?: string | null) {
  if (!Number.isFinite(qty)) return "—";
  if (unit) return formatQtyWithUnit(qty, unit);
  const n = Math.round(qty * 1000) / 1000;
  return String(n);
}

function LedgerTab({ locationId }: { locationId: string }) {
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const ledger = useQuery({
    queryKey: ["inv-ledger", locationId, type, q, page],
    queryFn: () =>
      inventoryApi.listLedger({
        locationId: locationId || undefined,
        type: type || undefined,
        q: q.trim() || undefined,
        page,
        limit: pageSize,
      }),
    placeholderData: (prev) => prev,
  });
  const rows = ledger.data?.items ?? [];
  const meta = ledger.data?.meta;

  useEffect(() => {
    setPage(1);
  }, [type, locationId, q]);

  return (
    <div className="space-y-5">
      <p className="text-[0.8rem] text-[#6b7280]">
        Each row is one item at this location. After is that item’s stock after
        the movement — not a shop-wide running total.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Item or SKU</Label>
          <Input
            className="mt-1"
            placeholder="Filter by name or SKU"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div>
          <Label>Movement type</Label>
          <select
            className={fieldSelect}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All types</option>
            {Object.entries(LEDGER_TYPE_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-[#e5e7eb]">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-[#f7f9fb] text-left text-[0.7rem] uppercase text-[#5a6b7d]">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">Before</th>
              <th className="px-3 py-2 text-right">In</th>
              <th className="px-3 py-2 text-right">Out</th>
              <th className="px-3 py-2 text-right">After</th>
              <th className="px-3 py-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const unit = r.sellUnit;
              const delta = Number(r.qtyDelta);
              const before =
                r.qtyBefore != null
                  ? Number(r.qtyBefore)
                  : Number(r.qtyAfter) - delta;
              return (
                <tr key={r.id} className="border-t border-[#f0f3f7]">
                  <td className="px-3 py-2 text-xs text-[#5a6b7d] whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    {LEDGER_TYPE_LABELS[r.type] ?? r.type}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-[#0b1f33]">
                      {r.product?.name ?? "—"}
                    </div>
                    <div className="font-mono text-[0.7rem] text-[#8a9bb0]">
                      {r.sku ?? r.product?.skuCode ?? ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#5a6b7d]">
                    {formatLedgerQty(before, unit)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                    {delta > 0 ? formatLedgerQty(delta, unit) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-rose-700">
                    {delta < 0 ? formatLedgerQty(Math.abs(delta), unit) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {formatLedgerQty(Number(r.qtyAfter), unit)}
                  </td>
                  <td className="px-3 py-2 text-[#5a6b7d]">
                    {r.reason || "—"}
                  </td>
                </tr>
              );
            })}
            {!rows.length && !ledger.isLoading ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-8 text-center text-[#5a6b7d]"
                >
                  No stock movements
                  {locationId ? " at this location" : ""}
                  {type || q.trim() ? " for this filter" : ""}.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <TablePager
        {...pagerFromMeta(meta, page, pageSize, setPage, rows.length)}
      />
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
    <div className="space-y-5">
      {canWrite ? (
        <div className="space-y-5">
          <p className="text-xs text-[#6b7280]">
            Locations hold stock. Street addresses stay on each location.
          </p>
          <div>
            <Label>Name *</Label>
            <Input
              className="mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Main store"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Code</Label>
              <Input
                className="mt-1"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="MAIN"
              />
            </div>
            <div>
              <Label>Type</Label>
              <select
                className={fieldSelect}
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="store">Store</option>
                <option value="branch">Branch</option>
                <option value="warehouse">Warehouse</option>
                <option value="office">Office</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <Label>Address</Label>
            <Input
              className="mt-1"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <Button
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-[#e5e7eb]">
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
