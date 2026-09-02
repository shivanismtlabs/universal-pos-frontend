"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Eye, Edit3 } from "lucide-react";
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

  if (adjustmentsQuery.isLoading && !adjustmentsQuery.data) {
    return <PageSkeleton rows={8} />;
  }

  const items = adjustmentsQuery.data?.items ?? [];
  const total = adjustmentsQuery.data?.total ?? 0;
  const totalPages = adjustmentsQuery.data?.totalPages ?? 1;
  const hasFilters =
    Boolean(debouncedSearch) ||
    statusTab !== "all" ||
    typeFilter !== "all" ||
    Boolean(selectedLocationId);
  const loadError =
    adjustmentsQuery.error instanceof ApiError
      ? adjustmentsQuery.error.messages.join(", ")
      : adjustmentsQuery.isError
        ? "Could not load adjustments."
        : null;

  return (
    <div className="flex min-h-0 flex-col gap-4 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Inventory</p>
          <h1 className="page-title mt-1">Adjustments</h1>
          <p className="page-subtitle mt-1.5 max-w-xl">
            Track, create, draft, and finalize stock quantity & value
            adjustments with complete audit history and store isolation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link href="/catalog">Items</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/transfers">Stock transfer</Link>
          </Button>
          {canWrite ? (
            <Button size="sm" onClick={handleOpenCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Adjustment
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e4e9f0] bg-white p-3 shadow-sm">
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
                  ? "bg-white font-semibold text-[#0b1f33] shadow-sm"
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
          <select
            value={selectedLocationId}
            onChange={(e) => {
              setSelectedLocationId(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-lg border border-[#d9e0ea] bg-white px-3 text-xs text-[#0b1f33] outline-none focus:border-[#1a56db]"
          >
            <option value="">All Stores / Locations</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as TypeFilter);
              setPage(1);
            }}
            className="h-9 rounded-lg border border-[#d9e0ea] bg-white px-3 text-xs text-[#0b1f33] outline-none focus:border-[#1a56db]"
          >
            <option value="all">All Types</option>
            <option value="quantity">Quantity Adj</option>
            <option value="value">Value Adj</option>
          </select>

          <div className="relative">
            <Search className="absolute top-2.5 left-3 h-4 w-4 text-[#8b9bb0]" />
            <Input
              className="h-9 w-64 pl-9 text-xs"
              placeholder="Search No, item, SKU, reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
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
