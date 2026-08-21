"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { restaurantApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { useBranchStore } from "@/lib/branch-store";
import {
  DiningEmpty,
  DiningPanel,
  DiningShell,
  DiningStatusBadge,
  diningSelectClass,
} from "@/components/dining-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Pencil, Trash2 } from "lucide-react";
import { ModalFrame } from "@/components/modal-frame";

const TILE: Record<string, string> = {
  available:
    "border-[#bbf7d0] bg-white hover:border-[#86efac] hover:shadow-[0_1px_8px_rgba(22,101,52,0.08)]",
  occupied:
    "border-[#93c5fd] bg-[#f8fbff] hover:border-[#60a5fa] hover:shadow-[0_1px_8px_rgba(30,64,175,0.08)]",
  reserved:
    "border-[#fdba74] bg-[#fffaf5] hover:border-[#fb923c]",
  cleaning: "border-[#fde68a] bg-[#fffbeb]",
  blocked: "border-[#e2e8f0] bg-[#f8fafc] opacity-80",
};

export default function RestaurantTablesPage() {
  const qc = useQueryClient();
  const { hasCapability, data: boot } = useBootstrap();
  const locationId =
    useBranchStore((s) => s.currentLocationId) || boot?.locations?.[0]?.id;
  const allowed = hasCapability("TABLE") || hasCapability("CAPTAIN");

  const [floorName, setFloorName] = useState("Main floor");
  const [tableName, setTableName] = useState("");
  const [capacity, setCapacity] = useState("4");
  const [floorId, setFloorId] = useState("");
  const [floorFilter, setFloorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [moveFrom, setMoveFrom] = useState("");
  const [moveTo, setMoveTo] = useState("");
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [editingTable, setEditingTable] = useState<{
    id: string;
    name: string;
    capacity: number;
    floorId: string | null;
  } | null>(null);

  const floors = useQuery({
    queryKey: ["restaurant-floors", locationId],
    queryFn: () => restaurantApi.floors(locationId),
    enabled: allowed && Boolean(locationId),
  });
  const tables = useQuery({
    queryKey: ["restaurant-tables", locationId],
    queryFn: () => restaurantApi.tables(locationId),
    enabled: allowed && Boolean(locationId),
    refetchInterval: 8_000,
  });
  const order = useQuery({
    queryKey: ["restaurant-order", activeOrderId],
    queryFn: () => restaurantApi.getOrder(activeOrderId!),
    enabled: Boolean(activeOrderId),
  });

  const createFloor = useMutation({
    mutationFn: () =>
      restaurantApi.createFloor({
        locationId: locationId!,
        name: floorName.trim(),
      }),
    onSuccess: () => {
      toast.success("Floor added");
      void qc.invalidateQueries({ queryKey: ["restaurant-floors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const createTable = useMutation({
    mutationFn: () =>
      restaurantApi.createTable({
        locationId: locationId!,
        name: tableName.trim(),
        capacity: Number(capacity) || 4,
        floorId: floorId || undefined,
      }),
    onSuccess: () => {
      toast.success("Table added");
      setTableName("");
      void qc.invalidateQueries({ queryKey: ["restaurant-tables"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const openTable = useMutation({
    mutationFn: (id: string) => restaurantApi.openTable(id, { covers: 2 }),
    onSuccess: (data) => {
      toast.success(`Opened ${data.orderNumber}`);
      setActiveOrderId(data.id);
      void qc.invalidateQueries({ queryKey: ["restaurant-tables"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const sendKot = useMutation({
    mutationFn: (orderId: string) => restaurantApi.sendKot(orderId),
    onSuccess: () => {
      toast.success("KOT sent — stock is not deducted until billing");
      void qc.invalidateQueries({ queryKey: ["restaurant-order"] });
      void qc.invalidateQueries({ queryKey: ["restaurant-kots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const merge = useMutation({
    mutationFn: () => restaurantApi.mergeTables(moveFrom, moveTo),
    onSuccess: () => {
      toast.success("Tables merged onto one order");
      setMoveFrom("");
      setMoveTo("");
      void qc.invalidateQueries({ queryKey: ["restaurant-tables"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const move = useMutation({
    mutationFn: () => restaurantApi.moveTable(moveFrom, moveTo),
    onSuccess: () => {
      toast.success("Order moved");
      setMoveFrom("");
      setMoveTo("");
      void qc.invalidateQueries({ queryKey: ["restaurant-tables"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateTable = useMutation({
    mutationFn: (args: { id: string; name: string; capacity: number; floorId?: string }) =>
      restaurantApi.updateTable(args.id, {
        name: args.name,
        capacity: args.capacity,
        floorId: args.floorId,
      }),
    onSuccess: () => {
      toast.success("Table updated");
      setEditingTable(null);
      void qc.invalidateQueries({ queryKey: ["restaurant-tables"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteTable = useMutation({
    mutationFn: (id: string) => restaurantApi.deleteTable(id),
    onSuccess: () => {
      toast.success("Table deleted");
      setEditingTable(null);
      void qc.invalidateQueries({ queryKey: ["restaurant-tables"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allTables = tables.data ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allTables.length };
    for (const t of allTables) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [allTables]);

  const grouped = useMemo(() => {
    const list = allTables.filter((t) => {
      if (floorFilter !== "all" && (t.floorName || "Unassigned") !== floorFilter)
        return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      return true;
    });
    const map = new Map<string, typeof list>();
    for (const t of list) {
      const key = t.floorName || "Unassigned";
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return [...map.entries()];
  }, [allTables, floorFilter, statusFilter]);

  if (!allowed) {
    return (
      <DiningShell
        title="Tables"
        subtitle="Enable the Tables capability to use the dining floor."
      >
        <DiningEmpty
          title="Dining floor is off"
          detail="Turn on Tables in Settings → Capabilities. Retail, rental, and service shops stay unchanged."
        />
      </DiningShell>
    );
  }

  return (
    <DiningShell
      title="Tables"
      subtitle="Open, move, and merge tables on one order. Add items at Counter, then send KOT — stock deducts at billing."
      action={
        <Button asChild variant="secondary">
          <Link href="/restaurant/setup">Setup</Link>
        </Button>
      }
    >
      <DiningPanel title="Add floor or table">
        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <Label>Floor name</Label>
            <div className="mt-1 flex gap-2">
              <Input
                value={floorName}
                onChange={(e) => setFloorName(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={!floorName.trim() || createFloor.isPending}
                onClick={() => createFloor.mutate()}
              >
                Add floor
              </Button>
            </div>
          </div>
          <div className="lg:col-span-2">
            <Label>New table</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              <Input
                className="min-w-[8rem] flex-1"
                placeholder="T12"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
              />
              <Input
                className="w-20"
                aria-label="Seats"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
              <select
                className={cn(diningSelectClass, "w-40")}
                value={floorId}
                onChange={(e) => setFloorId(e.target.value)}
              >
                <option value="">No floor</option>
                {(floors.data ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                disabled={!tableName.trim() || createTable.isPending}
                onClick={() => createTable.mutate()}
              >
                + New table
              </Button>
            </div>
          </div>
        </div>
      </DiningPanel>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["all", "All"],
            ["available", "Available"],
            ["occupied", "Occupied"],
            ["reserved", "Reserved"],
            ["cleaning", "Cleaning"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setStatusFilter(id)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold ring-1 transition",
              statusFilter === id
                ? "bg-[#1a56db] text-white ring-[#1a56db]"
                : "bg-white text-[#5a6b7d] ring-[#e2e8f0] hover:text-[#0b1f33]",
            )}
          >
            {label}
            <span className="ml-1 tabular-nums opacity-80">
              {counts[id] ?? 0}
            </span>
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-[#e2e8f0]" />
        <button
          type="button"
          onClick={() => setFloorFilter("all")}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold ring-1",
            floorFilter === "all"
              ? "bg-[#eff6ff] text-[#1a56db] ring-[#bfdbfe]"
              : "bg-white text-[#5a6b7d] ring-[#e2e8f0]",
          )}
        >
          All floors
        </button>
        {(floors.data ?? []).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFloorFilter(f.name)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold ring-1",
              floorFilter === f.name
                ? "bg-[#eff6ff] text-[#1a56db] ring-[#bfdbfe]"
                : "bg-white text-[#5a6b7d] ring-[#e2e8f0]",
            )}
          >
            {f.name}
          </button>
        ))}
      </div>

      {!allTables.length ? (
        <DiningEmpty
          title="No tables yet"
          detail="Add a floor and at least one table. Then tap a table to open a dining ticket."
        />
      ) : (
        grouped.map(([floor, list]) => (
          <section key={floor}>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-[#0b1f33]">{floor}</h2>
              <p className="text-xs text-[#8b9bb0]">{list.length} tables</p>
            </div>
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {list.map((t) => (
                <li key={t.id} className="relative group">
                  <button
                    type="button"
                    onClick={() => {
                      if (t.currentOrderId) setActiveOrderId(t.currentOrderId);
                      else openTable.mutate(t.id);
                    }}
                    className={cn(
                      "flex min-h-[7.5rem] w-full flex-col rounded-xl border px-3 py-3 text-left transition",
                      TILE[t.status] ?? TILE.available,
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 pr-6">
                      <p className="text-[0.95rem] font-semibold text-[#0b1f33]">
                        {t.name}
                      </p>
                      <DiningStatusBadge value={t.status} />
                    </div>
                    <p className="mt-1 text-xs text-[#5a6b7d]">
                      {t.capacity} seats
                      {t.covers ? ` · ${t.covers} covers` : ""}
                    </p>
                    <div className="mt-auto pt-2">
                      {t.orderNumber ? (
                        <p className="font-mono text-[0.7rem] font-semibold text-[#1a56db]">
                          {t.orderNumber}
                        </p>
                      ) : (
                        <p className="text-[0.7rem] text-[#8b9bb0]">
                          Tap to open
                        </p>
                      )}
                      {t.guestName ? (
                        <p className="truncate text-xs text-[#0b1f33]">
                          {t.guestName}
                        </p>
                      ) : null}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingTable({
                        id: t.id,
                        name: t.name,
                        capacity: t.capacity,
                        floorId: t.floorId,
                      });
                    }}
                    className="absolute right-2 top-2 rounded p-1 text-[#8b9bb0] opacity-0 hover:bg-black/5 hover:text-[#0b1f33] focus:opacity-100 group-hover:opacity-100 transition-opacity"
                    aria-label="Edit table"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {hasCapability("QR_ORDER") && t.qrToken ? (
                    <button
                      type="button"
                      className="mt-1 text-[0.65rem] font-semibold text-[#1a56db] hover:underline"
                      onClick={() => {
                        const url = `${window.location.origin}/order/${t.qrToken}`;
                        void navigator.clipboard.writeText(url);
                        toast.success("Guest QR link copied");
                      }}
                    >
                      Copy guest QR
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <DiningPanel
        title="Move / merge"
        hint="Merge keeps one order. Move never clones tickets or stock."
      >
        <div className="flex flex-wrap gap-2">
          <select
            className={cn(diningSelectClass, "w-44")}
            value={moveFrom}
            onChange={(e) => setMoveFrom(e.target.value)}
          >
            <option value="">From table</option>
            {allTables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            className={cn(diningSelectClass, "w-44")}
            value={moveTo}
            onChange={(e) => setMoveTo(e.target.value)}
          >
            <option value="">To table</option>
            {allTables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="secondary"
            disabled={!moveFrom || !moveTo || move.isPending}
            onClick={() => move.mutate()}
          >
            Move order
          </Button>
          <Button
            type="button"
            disabled={!moveFrom || !moveTo || merge.isPending}
            onClick={() => merge.mutate()}
          >
            Merge
          </Button>
        </div>
      </DiningPanel>

      {order.data ? (
        <DiningPanel
          title={order.data.orderNumber}
          hint={`${order.data.restaurant?.diningMode?.replaceAll("_", " ") ?? "Dining"} · parked until billed`}
          action={
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary">
                <Link href="/counter">Add items</Link>
              </Button>
              <Button
                type="button"
                disabled={sendKot.isPending || !order.data.items.length}
                onClick={() => sendKot.mutate(order.data.id)}
              >
                Send KOT
              </Button>
              <Button asChild>
                <Link href={`/orders/view?id=${order.data.id}`}>Bill</Link>
              </Button>
            </div>
          }
        >
          <table className="w-full text-left text-sm">
            <thead className="text-[0.68rem] uppercase tracking-wide text-[#8b9bb0]">
              <tr>
                <th className="pb-2 font-semibold">Item</th>
                <th className="pb-2 text-right font-semibold">Qty</th>
                <th className="pb-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef1f4]">
              {order.data.items.map((i) => (
                <tr key={i.id}>
                  <td className="py-2 text-[#0b1f33]">
                    {i.description || "Item"}
                  </td>
                  <td className="py-2 text-right tabular-nums text-[#5a6b7d]">
                    {i.quantity}
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium">
                    {i.lineTotal}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!order.data.items.length ? (
            <p className="text-sm text-[#5a6b7d]">
              No items yet. Open Counter, add products to this parked sale, then
              send KOT.
            </p>
          ) : null}
        </DiningPanel>
      ) : null}

      {editingTable ? (
        <ModalFrame
          title="Edit table"
          onClose={() => setEditingTable(null)}
          footer={
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  if (confirm("Are you sure you want to delete this table?")) {
                    deleteTable.mutate(editingTable.id);
                  }
                }}
                disabled={deleteTable.isPending}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditingTable(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => updateTable.mutate({
                    id: editingTable.id,
                    name: editingTable.name,
                    capacity: editingTable.capacity,
                    floorId: editingTable.floorId ?? undefined,
                  })}
                  disabled={!editingTable.name.trim() || updateTable.isPending}
                >
                  Save changes
                </Button>
              </div>
            </div>
          }
        >
          <div className="grid gap-4">
            <div>
              <Label>Table name</Label>
              <Input
                className="mt-1"
                value={editingTable.name}
                onChange={(e) =>
                  setEditingTable({ ...editingTable, name: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Capacity (Seats)</Label>
              <Input
                className="mt-1"
                type="number"
                value={editingTable.capacity}
                onChange={(e) =>
                  setEditingTable({ ...editingTable, capacity: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <Label>Floor / Zone</Label>
              <select
                className={cn(diningSelectClass, "mt-1 w-full")}
                value={editingTable.floorId ?? ""}
                onChange={(e) =>
                  setEditingTable({ ...editingTable, floorId: e.target.value || null })
                }
              >
                <option value="">No floor</option>
                {(floors.data ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </ModalFrame>
      ) : null}
    </DiningShell>
  );
}
