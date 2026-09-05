"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  Eye,
  Edit3,
  RefreshCw,
  CheckCircle2,
  Clock,
  X,
  Store,
  SlidersHorizontal,
  FileText,
} from "lucide-react";
import { type StockAdjustment } from "@/lib/api";
import { listStockAdjustments } from "@/lib/api/stock-adjustments";
import { canWriteCatalog } from "@/lib/roles";
import { useAuthStore } from "@/lib/auth-store";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageSkeleton } from "@/components/page-header";
import { TablePager } from "@/components/table-pager";
import { StockAdjustmentFormDialog } from "@/components/stock-adjustment-form-dialog";
import { StockAdjustmentDetailDialog } from "@/components/stock-adjustment-detail-dialog";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type StatusTab = "all" | "draft" | "pending" | "adjusted" | "cancelled";
type TypeFilter = "all" | "quantity" | "value";

function statusLabel(status: string) {
  switch (status) {
    case "adjusted":
      return "Finalized";
    case "draft":
      return "Draft";
    case "pending":
      return "Pending";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function statusPillClass(status: string) {
  switch (status) {
    case "adjusted":
      return "bg-[#dcfce7] text-[#15803d]";
    case "draft":
      return "bg-[#fef3c7] text-[#b45309]";
    case "pending":
      return "bg-[#e0e7ff] text-[#3730a3]";
    case "cancelled":
      return "bg-[#fee2e2] text-[#b91c1c]";
    default:
      return "bg-[#f1f5f9] text-[#5a6b7d]";
  }
}

export default function InventoryAdjustmentsPage() {
  const { data: boot } = useBootstrap();
  const roles = useAuthStore((s) => s.user?.roles);
  const canWrite = canWriteCatalog(roles);
  const qc = useQueryClient();

  const locations = useMemo(
    () =>
      (boot?.locations ?? [])
        .filter((l: { isActive?: boolean }) => l.isActive !== false)
        .map((l: { id: string; name: string }) => ({
          id: l.id,
          name: l.name,
        })),
    [boot],
  );

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  const [formOpen, setFormOpen] = useState(false);
  const [editingAdj, setEditingAdj] = useState<StockAdjustment | null>(null);
  const [detailAdjId, setDetailAdjId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 280);
    return () => window.clearTimeout(t);
  }, [search]);

  const adjustmentsQuery = useQuery({
    queryKey: [
      "stock-adjustments-list",
      selectedLocationId,
      statusTab,
      typeFilter,
      debouncedSearch,
      page,
      limit,
    ],
    queryFn: () =>
      listStockAdjustments({
        locationId: selectedLocationId || undefined,
        status: statusTab === "all" ? undefined : statusTab,
        type: typeFilter === "all" ? undefined : typeFilter,
        search: debouncedSearch || undefined,
        page,
        limit,
      }),
  });

  async function handleRefresh() {
    await qc.invalidateQueries({ queryKey: ["stock-adjustments-list"] });
    await qc.invalidateQueries({ queryKey: ["pos-sale-stock-adjustments"] });
    await qc.invalidateQueries({ queryKey: ["catalog-products"] });
    await qc.invalidateQueries({ queryKey: ["inventory-stock"] });
    if (detailAdjId) {
      await qc.invalidateQueries({
        queryKey: ["stock-adjustment", detailAdjId],
      });
    }
  }

  function handleOpenCreate() {
    setEditingAdj(null);
    setFormOpen(true);
  }

  function handleOpenEdit(adj: StockAdjustment) {
    setEditingAdj(adj);
    setFormOpen(true);
  }

  const items = adjustmentsQuery.data?.items ?? [];
  const total = adjustmentsQuery.data?.total ?? 0;
  const totalPages = adjustmentsQuery.data?.totalPages ?? 1;

  const stats = useMemo(() => {
    const finalized = items.filter((i) => i.status === "adjusted").length;
    const drafts = items.filter((i) => i.status === "draft").length;
    const pending = items.filter((i) => i.status === "pending").length;
    return {
      total,
      finalized,
      drafts,
      pending,
    };
  }, [items, total]);

  const hasFilters =
    Boolean(debouncedSearch) ||
    statusTab !== "all" ||
    typeFilter !== "all" ||
    Boolean(selectedLocationId);

  const resetFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatusTab("all");
    setTypeFilter("all");
    setSelectedLocationId("");
    setPage(1);
  };

  if (adjustmentsQuery.isLoading && !adjustmentsQuery.data) {
    return <PageSkeleton rows={8} />;
  }

  const loadError =
    adjustmentsQuery.error instanceof ApiError
      ? adjustmentsQuery.error.messages.join(", ")
      : adjustmentsQuery.isError
        ? "Could not load adjustments."
        : null;

  return (
    <div className="flex min-h-0 flex-col gap-4 pb-10">
      {/* ── Top Header ────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef1f4] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-[#eef2f6] px-2 py-0.5 text-[0.7rem] font-semibold text-[#1a56db] uppercase tracking-wider">
              Inventory
            </span>
            <span className="text-xs text-[#8b9bb0]">•</span>
            <span className="text-xs font-medium text-[#5a6b7d]">Reconciliation & Audit</span>
          </div>
          <h1 className="page-title mt-1 text-2xl font-bold tracking-tight text-[#0b1f33]">
            Stock Adjustments
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void handleRefresh()}
            disabled={adjustmentsQuery.isFetching}
            className="h-9 gap-1.5 border border-[#e4e9f0] bg-white px-3 text-xs text-[#5a6b7d] hover:bg-[#f8fafc] hover:text-[#0b1f33]"
            title="Refresh adjustment records"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", adjustmentsQuery.isFetching && "animate-spin")} />
            <span>Refresh</span>
          </Button>

          {canWrite ? (
            <Button
              size="sm"
              onClick={handleOpenCreate}
              className="h-9 gap-1.5 bg-[#1a56db] px-3.5 text-xs font-semibold text-white shadow-sm hover:bg-[#1546b8]"
            >
              <Plus className="h-4 w-4" />
              New Adjustment
            </Button>
          ) : null}
        </div>
      </header>

      {/* ── Metric KPI Quick Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => {
            setStatusTab("all");
            setPage(1);
          }}
          className={cn(
            "flex flex-col rounded-xl border p-3 text-left transition-all hover:shadow-xs",
            statusTab === "all"
              ? "border-[#1a56db] bg-[#f0f5ff] ring-1 ring-[#1a56db]"
              : "border-[#e4e9f0] bg-white hover:border-[#cbd5e1]",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#5a6b7d]">Total Records</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f1f5f9] text-[#0b1f33]">
              <FileText className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-1 text-xl font-bold tracking-tight text-[#0b1f33]">
            {stats.total}
          </div>
          <span className="mt-0.5 text-[0.7rem] text-[#8b9bb0]">All adjustments</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusTab("adjusted");
            setPage(1);
          }}
          className={cn(
            "flex flex-col rounded-xl border p-3 text-left transition-all hover:shadow-xs",
            statusTab === "adjusted"
              ? "border-[#15803d] bg-[#f0fdf4] ring-1 ring-[#15803d]"
              : "border-[#e4e9f0] bg-white hover:border-[#cbd5e1]",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#5a6b7d]">Finalized</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#dcfce7] text-[#15803d]">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-1 text-xl font-bold tracking-tight text-[#15803d]">
            {stats.finalized}
          </div>
          <span className="mt-0.5 text-[0.7rem] text-[#8b9bb0]">Applied to inventory</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusTab("pending");
            setPage(1);
          }}
          className={cn(
            "flex flex-col rounded-xl border p-3 text-left transition-all hover:shadow-xs",
            statusTab === "pending"
              ? "border-[#4338ca] bg-[#eef2ff] ring-1 ring-[#4338ca]"
              : "border-[#e4e9f0] bg-white hover:border-[#cbd5e1]",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#5a6b7d]">Pending Review</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#e0e7ff] text-[#4338ca]">
              <Clock className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-1 text-xl font-bold tracking-tight text-[#4338ca]">
            {stats.pending}
          </div>
          <span className="mt-0.5 text-[0.7rem] text-[#8b9bb0]">Awaiting approval</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusTab("draft");
            setPage(1);
          }}
          className={cn(
            "flex flex-col rounded-xl border p-3 text-left transition-all hover:shadow-xs",
            statusTab === "draft"
              ? "border-[#b45309] bg-[#fffbeb] ring-1 ring-[#b45309]"
              : "border-[#e4e9f0] bg-white hover:border-[#cbd5e1]",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#5a6b7d]">Drafts</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#fef3c7] text-[#b45309]">
              <Edit3 className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-1 text-xl font-bold tracking-tight text-[#b45309]">
            {stats.drafts}
          </div>
          <span className="mt-0.5 text-[0.7rem] text-[#8b9bb0]">Editable vouchers</span>
        </button>
      </div>

      {/* ── Filter & Search Toolbar ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e4e9f0] bg-white p-2.5 shadow-xs">
        <div className="flex flex-wrap gap-1 rounded-lg bg-[#f1f5f9] p-1 text-xs">
          {(
            [
              { id: "all", label: "All" },
              { id: "draft", label: "Draft" },
              { id: "pending", label: "Pending" },
              { id: "adjusted", label: "Finalized" },
              { id: "cancelled", label: "Cancelled" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 font-medium transition",
                statusTab === tab.id
                  ? "bg-white font-semibold text-[#0b1f33] shadow-xs"
                  : "text-[#5a6b7d] hover:text-[#0b1f33]",
              )}
              onClick={() => {
                setStatusTab(tab.id);
                setPage(1);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Store / Location Filter */}
          <div className="relative">
            <select
              value={selectedLocationId}
              onChange={(e) => {
                setSelectedLocationId(e.target.value);
                setPage(1);
              }}
              className="h-9 appearance-none rounded-lg border border-[#d9e0ea] bg-white pr-8 pl-8 text-xs font-medium text-[#0b1f33] outline-none transition focus:border-[#1a56db] focus:ring-1 focus:ring-[#1a56db]"
            >
              <option value="">All Stores / Locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
            <Store className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-[#8b9bb0]" />
          </div>

          {/* Type Filter */}
          <div className="relative">
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as TypeFilter);
                setPage(1);
              }}
              className="h-9 appearance-none rounded-lg border border-[#d9e0ea] bg-white pr-8 pl-8 text-xs font-medium text-[#0b1f33] outline-none transition focus:border-[#1a56db] focus:ring-1 focus:ring-[#1a56db]"
            >
              <option value="all">All Adjustment Types</option>
              <option value="quantity">Quantity Adjustment</option>
              <option value="value">Value Adjustment</option>
            </select>
            <SlidersHorizontal className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-[#8b9bb0]" />
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute top-2.5 left-3 h-4 w-4 text-[#8b9bb0]" />
            <Input
              className="h-9 w-60 rounded-lg pr-8 pl-9 text-xs"
              placeholder="Search No, item, SKU, reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute top-2.5 right-2.5 text-[#8b9bb0] hover:text-[#0b1f33]"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {/* Clear Filters button */}
          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="h-9 px-2.5 text-xs text-[#5a6b7d] hover:bg-[#f1f5f9] hover:text-[#0b1f33]"
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Reset
            </Button>
          ) : null}
        </div>
      </div>

      {loadError ? (
        <EmptyState
          title="Could not load adjustments"
          detail={loadError}
          action={
            <Button type="button" variant="secondary" onClick={() => void adjustmentsQuery.refetch()}>
              Retry
            </Button>
          }
        />
      ) : !items.length ? (
        <EmptyState
          title="No adjustments found"
          detail={
            hasFilters
              ? "No adjustment records match your search filters."
              : "Create your first stock adjustment to correct stock quantities or revalue inventory."
          }
          action={
            canWrite ? (
              <Button type="button" onClick={handleOpenCreate}>
                <Plus className="mr-1.5 h-4 w-4" />
                New Adjustment
              </Button>
            ) : undefined
          }
        />
      ) : (
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#e4e9f0] bg-white shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
          <div className="max-h-[min(65dvh,36rem)] overflow-auto overscroll-contain">
            <table className="w-full min-w-[56rem] text-left text-xs">
              <thead className="sticky top-0 z-[1] border-b border-[#eef1f4] bg-[#f8fafc] text-[0.7rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
                <tr>
                  <th className="px-4 py-3">Adjustment No</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Location</th>
                  <th className="px-3 py-3">Reason</th>
                  <th className="px-3 py-3 text-center">Items</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Created By</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef1f4]">
                {items.map((r) => {
                  const isDraft = r.status === "draft";
                  return (
                    <tr
                      key={r.id}
                      className="transition-colors hover:bg-[#fafbfc]"
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-[#1a56db]">
                        <button
                          type="button"
                          className="hover:underline"
                          onClick={() => setDetailAdjId(r.id)}
                        >
                          {r.adjustmentNo}
                        </button>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-[#5a6b7d]">
                        {new Date(r.adjustmentDate).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-3 font-medium text-[#0b1f33]">
                        {r.location?.name || "Store"}
                      </td>
                      <td className="max-w-[14rem] truncate px-3 py-3 text-[#0b1f33]">
                        {r.reason}
                      </td>
                      <td className="px-3 py-3 text-center font-medium tabular-nums text-[#0b1f33]">
                        {r.lines?.length || 0}
                      </td>
                      <td className="px-3 py-3 capitalize text-[#5a6b7d]">
                        {r.type}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold",
                            statusPillClass(r.status),
                          )}
                        >
                          {statusLabel(r.status)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[#5a6b7d]">
                        {r.createdBy?.fullName || "Staff"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => setDetailAdjId(r.id)}
                          >
                            <Eye className="mr-1 h-3.5 w-3.5 text-[#5a6b7d]" />
                            View
                          </Button>
                          {canWrite && isDraft ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-[#1a56db]"
                              onClick={() => handleOpenEdit(r)}
                            >
                              <Edit3 className="mr-1 h-3.5 w-3.5" />
                              Edit
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <TablePager
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={limit}
            onPage={(p: number) => setPage(p)}
          />
        </section>
      )}

      <StockAdjustmentFormDialog
        open={formOpen}
        initialData={editingAdj}
        locations={locations}
        defaultLocationId={selectedLocationId || locations[0]?.id}
        onClose={() => setFormOpen(false)}
        onSaved={() => void handleRefresh()}
      />

      <StockAdjustmentDetailDialog
        adjustmentId={detailAdjId}
        canWrite={canWrite}
        onClose={() => setDetailAdjId(null)}
        onRefresh={() => void handleRefresh()}
        onEdit={(adj) => {
          setDetailAdjId(null);
          handleOpenEdit(adj);
        }}
      />
    </div>
  );
}
