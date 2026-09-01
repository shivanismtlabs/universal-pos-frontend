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
  Minus,
  Plus,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import {
  inventoryApi,
  tenantsApi,
} from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { canWriteCatalog } from "@/lib/roles";
import { useAuthStore } from "@/lib/auth-store";
import { useBranchStore } from "@/lib/branch-store";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ItemsImportDialog } from "@/components/items-import-dialog";
import {
  StockInModal,
  StockOutModal,
  DamagedStockModal,
  BranchPriceReorderModal,
  RestoreDamagedModal,
} from "@/components/inventory-modals";
import { EntityRowActions } from "@/components/entity-row-actions";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { FieldError } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
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
  | "damage"
  | "audit"
  | "ledger"
  | "alerts"
  | "warehouses";

const TAB_IDS: Tab[] = [
  "levels",
  "alerts",
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
  const [importOpen, setImportOpen] = useState(false);
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const branchId = useBranchStore((s) => s.currentLocationId);

  const { hasScreen } = useBootstrap();
  const [stockInOpen, setStockInOpen] = useState(false);
  const [stockOutOpen, setStockOutOpen] = useState(false);
  const [damageOpen, setDamageOpen] = useState(false);

  function selectTab(next: Tab) {
    const qs = next === "levels" ? "" : `?tab=${next}`;
    router.replace(`/inventory${qs}`, { scroll: false });
  }

  const locations = useQuery({
    queryKey: ["locations", tenantId],
    queryFn: () => tenantsApi.listLocations(),
    enabled: Boolean(tenantId),
  });

  /** Shell branch is SSOT — do not keep a local location that ignores header switches. */
  const activeLoc =
    branchId ||
    locations.data?.find((l) => l.isActive !== false)?.id ||
    locations.data?.[0]?.id ||
    "";

  const activeLocName =
    locations.data?.find((l) => l.id === activeLoc)?.name ?? "—";

  const tabs: { id: Tab; label: string }[] = [
    { id: "levels", label: "Stock levels" },
    { id: "alerts", label: "Low stock" },
    { id: "damage", label: "Damaged" },
    { id: "audit", label: "Physical audit" },
    { id: "ledger", label: "Ledger" },
    { id: "warehouses", label: "Locations" },
  ];

  return (
    <div className="space-y-6 px-3 sm:px-4">
      <PageHeader
        eyebrow="Stock"
        title="Inventory"
        subtitle={
          <>
            On-hand stock at this location. Use{" "}
            <span className="font-semibold text-[#0b1f33]">Stock In</span> or{" "}
            <span className="font-semibold text-[#0b1f33]">Edit</span> on a row
            to receive stock.{" "}
            <Link
              href="/adjustments"
              className="font-semibold text-[#1a56db] hover:underline"
            >
              Adjustments
            </Link>
            {" · "}
            <Link
              href="/transfers"
              className="font-semibold text-[#1a56db] hover:underline"
            >
              Transfers
            </Link>
            {hasScreen("inventory") ? (
              <>
                {" · "}
                <Link
                  href="/suppliers/orders"
                  className="font-semibold text-[#1a56db] hover:underline"
                >
                  Purchase orders
                </Link>
              </>
            ) : null}
          </>
        }
        action={
          canWrite ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStockInOpen(true)}
              >
                <Plus className="size-4" />
                Stock In
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStockOutOpen(true)}
              >
                <Minus className="size-4" />
                Stock Out
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDamageOpen(true)}
              >
                <AlertTriangle className="size-4 text-amber-600" />
                Damaged
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setImportOpen(true)}
              >
                Import Items
              </Button>
            </div>
          ) : null
        }
      />

      <section className={formCard}>
        <p className="text-sm text-[#5a6b7d]">
          Showing stock for{" "}
          <span className="font-medium text-[#0b1f33]">{activeLocName}</span>
          {locations.data && locations.data.length > 1
            ? " — switch location from the header."
            : "."}
        </p>

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
      <StockInModal
        open={stockInOpen}
        onClose={() => setStockInOpen(false)}
        locationId={activeLoc}
      />
      <StockOutModal
        open={stockOutOpen}
        onClose={() => setStockOutOpen(false)}
        locationId={activeLoc}
      />
      <DamagedStockModal
        open={damageOpen}
        onClose={() => setDamageOpen(false)}
        locationId={activeLoc}
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
  const { money } = useBootstrap();
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
    // Do not keepPreviousData across location switches — looks like filter is broken
    enabled: Boolean(locationId),
  });

  const levelRows = levels.data?.items ?? [];
  const meta = levels.data?.meta;

  useEffect(() => {
    setPage(1);
  }, [q, lowOnly, locationId]);

  const [reorderTarget, setReorderTarget] = useState<{
    stockLevelId: string;
    name: string;
    sku: string;
    sellPrice: number;
    reorderPoint: number | null;
    reorderQty: number | null;
    qtyOnHand?: number;
    sellUnit?: string;
    requiresSerial?: boolean;
    trackSerial?: boolean;
  } | null>(null);

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
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2 text-right">On hand</th>
              <th className="px-3 py-2 text-right">Available</th>
              <th className="px-3 py-2 text-right">Damaged</th>
              <th className="px-3 py-2 text-right">Rate</th>
              <th className="px-3 py-2 text-right">Reorder</th>
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
                  {formatQtyWithUnit(Number(r.qtyOnHand), r.sellUnit)}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-[#0b1f33]">
                  {formatQtyWithUnit(
                    Number(r.sellableQty ?? Number(r.qtyOnHand) - Number(r.qtyReserved ?? 0)),
                    r.sellUnit,
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-amber-800">
                  {formatQtyWithUnit(Number(r.qtyDamaged ?? 0), r.sellUnit)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {money(r.sellPrice ?? 0)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.reorderPoint != null
                    ? formatQtyWithUnit(Number(r.reorderPoint), r.sellUnit)
                    : "—"}
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
                        setReorderTarget({
                          stockLevelId: r.stockLevelId,
                          name: r.name,
                          sku: r.sku,
                          sellPrice: Number(r.sellPrice ?? 0),
                          reorderPoint: r.reorderPoint ?? null,
                          reorderQty: r.reorderQty ?? null,
                          qtyOnHand: Number(r.qtyOnHand ?? 0),
                          sellUnit: r.sellUnit,
                          requiresSerial: Boolean(
                            r.requiresSerial ?? r.trackSerial,
                          ),
                          trackSerial: Boolean(r.trackSerial),
                        });
                      }}
                      editTitle="Edit price, reorder & stock in"
                    />
                  ) : null}
                </td>
              </tr>
            ))}
            {levels.isLoading ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-8 text-center text-[#5a6b7d]"
                >
                  Loading stock for this location…
                </td>
              </tr>
            ) : !levelRows.length ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-8 text-center text-[#5a6b7d]"
                >
                  No stock levels at this location. Add items in Catalog, then
                  use Edit on a row to Stock In opening quantity.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <TablePager
        {...pagerFromMeta(meta, page, pageSize, setPage, levelRows.length)}
      />

      <BranchPriceReorderModal
        target={reorderTarget}
        onClose={() => setReorderTarget(null)}
        locationId={locationId}
      />
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

  type LowStockRow = {
    stockLevelId: string;
    name: string;
    sku: string;
    sellUnit?: string;
    qtyOnHand: number;
    reorderPoint: number | null;
    location?: { name: string };
  };

  const rows = useMemo(() => {
    const list: LowStockRow[] = alerts.data?.items ?? [];
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
                      {formatQtyWithUnit(Number(i.qtyOnHand), i.sellUnit)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#5a6b7d]">
                      {formatQtyWithUnit(Number(rp), i.sellUnit)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#b45309]">
                      {formatQtyWithUnit(gap, i.sellUnit)}
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
    queryKey: ["inv-levels-picker", locationId],
    queryFn: () =>
      inventoryApi.listLevels({
        locationId,
        includeZero: true,
        page: 1,
        limit: 100,
      }),
    enabled: Boolean(locationId),
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
        <Select
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
              {i.name} ({i.sku}) —{" "}
              {formatQtyWithUnit(Number(i.qtyOnHand), i.sellUnit)}
            </option>
          ))}
        </Select>
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
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [reportOpen, setReportOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<{
    stockLevelId: string;
    name: string;
    sku: string;
    qtyDamaged: number;
    sellUnit?: string;
  } | null>(null);

  const levels = useQuery({
    queryKey: ["inv-damaged", locationId, q, page],
    queryFn: () =>
      inventoryApi.listLevels({
        locationId,
        q: q || undefined,
        damagedOnly: true,
        includeZero: true,
        page,
        limit: pageSize,
      }),
    enabled: Boolean(locationId),
  });

  useEffect(() => {
    setPage(1);
  }, [q, locationId]);

  const damaged = levels.data?.items ?? [];
  const meta = levels.data?.meta;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#0b1f33]">
            Damaged Stock Registry
          </h3>
          <p className="text-xs text-[#6b7280]">
            Track and restore damaged stock back to sellable status.
          </p>
        </div>
        {canWrite ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setReportOpen(true)}
            className="text-xs"
          >
            <AlertTriangle className="mr-1.5 size-3.5 text-amber-600" />
            + Report Damaged Stock
          </Button>
        ) : null}
      </div>

      <div>
        <Label>Search Damaged Items</Label>
        <Input
          className="mt-1"
          placeholder="Search name or SKU..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <p className="mt-1 text-[0.72rem] text-[#6b7280]">
          {meta?.total ?? damaged.length} damaged item
          {(meta?.total ?? damaged.length) === 1 ? "" : "s"} at this location.
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
              {damaged.map((d) => (
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
                    {formatQtyWithUnit(Number(d.qtyOnHand), d.sellUnit)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#b45309]">
                    {formatQtyWithUnit(Number(d.qtyDamaged), d.sellUnit)}
                  </td>
                  <td className="px-3 py-2 text-[#5a6b7d]">{d.sellUnit}</td>
                  <td className="px-3 py-2 text-right">
                    {canWrite ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setRestoreTarget({
                            stockLevelId: d.stockLevelId,
                            name: d.name,
                            sku: d.sku,
                            qtyDamaged: d.qtyDamaged,
                            sellUnit: d.sellUnit,
                          })
                        }
                      >
                        <RefreshCw className="mr-1 size-3 text-[#1a56db]" />
                        Restore Stock
                      </Button>
                    ) : (
                      <span className="block text-right text-[#8b9bb0]">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {levels.isLoading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-10 text-center text-[#8b9bb0]"
                  >
                    Loading damaged stock…
                  </td>
                </tr>
              ) : !damaged.length ? (
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
      <TablePager
        {...pagerFromMeta(meta, page, pageSize, setPage, damaged.length)}
      />

      <DamagedStockModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        locationId={locationId}
      />
      <RestoreDamagedModal
        target={restoreTarget}
        onClose={() => setRestoreTarget(null)}
        locationId={locationId}
      />
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
          <Select
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
          </Select>
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
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const locations = useQuery({
    queryKey: ["locations", tenantId],
    queryFn: () => tenantsApi.listLocations(),
    enabled: Boolean(tenantId),
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
              <Select
                className={fieldSelect}
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="store">Store</option>
                <option value="branch">Branch</option>
                <option value="warehouse">Warehouse</option>
                <option value="office">Office</option>
                <option value="other">Other</option>
              </Select>
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
