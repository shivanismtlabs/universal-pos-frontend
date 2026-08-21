"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { restaurantApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { useBranchStore } from "@/lib/branch-store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<string, string> = {
  available: "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]",
  occupied: "border-[#bfdbfe] bg-[#eff6ff] text-[#1e40af]",
  reserved: "border-[#ddd6fe] bg-[#f5f3ff] text-[#5b21b6]",
  cleaning: "border-[#fde68a] bg-[#fffbeb] text-[#92400e]",
  blocked: "border-[#e5e7eb] bg-[#f8fafc] text-[#64748b]",
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
  const [moveFrom, setMoveFrom] = useState("");
  const [moveTo, setMoveTo] = useState("");
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

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

  const grouped = useMemo(() => {
    const list = tables.data ?? [];
    const map = new Map<string, typeof list>();
    for (const t of list) {
      const key = t.floorName || "Unassigned";
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return [...map.entries()];
  }, [tables.data]);

  if (!allowed) {
    return (
      <div className="p-6 text-sm text-[#5a6b7d]">
        Enable the Tables capability to use the dining floor.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Dining"
        title="Tables"
        subtitle="Open, move, and merge tables without duplicating orders or stock. Add items at Counter, then send KOT from the open ticket."
        action={
          <Button asChild variant="secondary">
            <Link href="/restaurant/setup">Setup</Link>
          </Button>
        }
      />

      <div className="grid gap-3 rounded-xl border border-[#e2e8f0] bg-white p-4 lg:grid-cols-3">
        <div>
          <Label>New floor</Label>
          <div className="mt-1 flex gap-2">
            <Input value={floorName} onChange={(e) => setFloorName(e.target.value)} />
            <Button
              type="button"
              disabled={!floorName.trim() || createFloor.isPending}
              onClick={() => createFloor.mutate()}
            >
              Add
            </Button>
          </div>
        </div>
        <div className="lg:col-span-2">
          <Label>New table</Label>
          <div className="mt-1 flex flex-wrap gap-2">
            <Input
              placeholder="Table 12"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
            />
            <Input
              className="w-20"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
            <select
              className="h-10 rounded-md border border-[#d9e0ea] px-2 text-sm"
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
              Add table
            </Button>
          </div>
        </div>
      </div>

      {grouped.map(([floor, list]) => (
        <section key={floor}>
          <h2 className="mb-2 text-sm font-semibold text-[#0b1f33]">{floor}</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {list.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (t.currentOrderId) setActiveOrderId(t.currentOrderId);
                    else openTable.mutate(t.id);
                  }}
                  className={cn(
                    "w-full rounded-xl border px-3 py-3 text-left transition",
                    STATUS_TONE[t.status] ?? STATUS_TONE.available,
                  )}
                >
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-[0.7rem] uppercase tracking-wide opacity-80">
                    {t.status} · {t.capacity} seats
                  </p>
                  {t.orderNumber ? (
                    <p className="mt-1 text-xs font-medium">{t.orderNumber}</p>
                  ) : (
                    <p className="mt-1 text-xs">Tap to open</p>
                  )}
                </button>
                {hasCapability("QR_ORDER") && t.qrToken ? (
                  <button
                    type="button"
                    className="mt-1 text-[0.65rem] font-semibold text-[#1a56db]"
                    onClick={() => {
                      const url = `${window.location.origin}/order/${t.qrToken}`;
                      void navigator.clipboard.writeText(url);
                      toast.success("QR order link copied");
                    }}
                  >
                    Copy guest QR link
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="rounded-xl border border-[#e2e8f0] bg-white p-4">
        <h2 className="text-sm font-semibold text-[#0b1f33]">Move / merge</h2>
        <p className="mt-1 text-xs text-[#5a6b7d]">
          Merge keeps one order. Move never clones tickets or stock.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            className="h-10 rounded-md border border-[#d9e0ea] px-2 text-sm"
            value={moveFrom}
            onChange={(e) => setMoveFrom(e.target.value)}
          >
            <option value="">From table</option>
            {(tables.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border border-[#d9e0ea] px-2 text-sm"
            value={moveTo}
            onChange={(e) => setMoveTo(e.target.value)}
          >
            <option value="">To table</option>
            {(tables.data ?? []).map((t) => (
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
      </section>

      {order.data ? (
        <section className="rounded-xl border border-[#e2e8f0] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[#0b1f33]">
                {order.data.orderNumber}
              </h2>
              <p className="text-xs text-[#5a6b7d]">
                {order.data.restaurant?.diningMode} · draft until billed
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="secondary">
                <Link href="/counter">Add items at Counter</Link>
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
          </div>
          <ul className="mt-3 divide-y divide-[#eef1f4] text-sm">
            {order.data.items.map((i) => (
              <li key={i.id} className="flex justify-between py-1.5">
                <span>
                  {i.quantity} × {i.description || "Item"}
                </span>
                <span className="tabular-nums">{i.lineTotal}</span>
              </li>
            ))}
            {!order.data.items.length ? (
              <li className="py-2 text-[#5a6b7d]">
                No items yet. Use Counter to add products to this parked sale,
                then send KOT.
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
