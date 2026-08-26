"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { posApi, restaurantApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { useBranchStore } from "@/lib/branch-store";
import {
  DiningEmpty,
  DiningShell,
  diningSelectClass,
} from "@/components/dining-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ArrowRightLeft,
  LayoutGrid,
  Map as MapIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";
import { ModalFrame } from "@/components/modal-frame";

/**
 * Petpooja-style live floor colours — Universal POS dining module
 * (TABLE capability), not a restaurant-only product.
 */
const FLOOR_TILE: Record<
  string,
  { tile: string; ink: string; label: string; dot: string }
> = {
  available: {
    tile: "border-[#86efac] bg-[#22c55e] text-white shadow-[0_2px_0_#15803d]",
    ink: "text-white",
    label: "Free",
    dot: "bg-[#22c55e]",
  },
  occupied: {
    tile: "border-[#f87171] bg-[#ef4444] text-white shadow-[0_2px_0_#b91c1c]",
    ink: "text-white",
    label: "Running",
    dot: "bg-[#ef4444]",
  },
  billed: {
    tile: "border-[#c084fc] bg-[#9333ea] text-white shadow-[0_2px_0_#6b21a8]",
    ink: "text-white",
    label: "Billed",
    dot: "bg-[#9333ea]",
  },
  reserved: {
    tile: "border-[#fdba74] bg-[#f97316] text-white shadow-[0_2px_0_#c2410c]",
    ink: "text-white",
    label: "Reserved",
    dot: "bg-[#f97316]",
  },
  cleaning: {
    tile: "border-[#fde047] bg-[#eab308] text-[#422006] shadow-[0_2px_0_#a16207]",
    ink: "text-[#422006]",
    label: "Cleaning",
    dot: "bg-[#eab308]",
  },
  blocked: {
    tile: "border-[#94a3b8] bg-[#64748b] text-white shadow-[0_2px_0_#334155]",
    ink: "text-white",
    label: "Blocked",
    dot: "bg-[#64748b]",
  },
};

const TABLE_STATUSES = [
  "available",
  "occupied",
  "reserved",
  "cleaning",
  "blocked",
] as const;

const GUEST_OCCASION_OPTS = [
  ["none", "No occasion"],
  ["birthday", "Birthday"],
  ["anniversary", "Anniversary"],
  ["celebration", "Celebration"],
] as const;

const GUEST_REQUEST_OPTS = [
  ["water", "Bottle of water", "Bring water to the table"],
  ["cake", "Cake", "Kitchen prepares / plates cake"],
  ["decor", "Table décor", "Balloons, flowers, setup"],
  ["candles", "Candles", "For the cake or table"],
  ["extra_cutlery", "Extra plates", "Spoons, plates, glasses"],
  ["complimentary", "On the house", "Do not charge"],
] as const;

function requestLabel(code: string) {
  return GUEST_REQUEST_OPTS.find(([id]) => id === code)?.[1] ?? code;
}

type DiningTable = Awaited<ReturnType<typeof restaurantApi.tables>>[number];
type DiningFloor = Awaited<ReturnType<typeof restaurantApi.floors>>[number];

type Modal =
  | { kind: "floor"; id?: string }
  | { kind: "table"; id?: string; floorId?: string }
  | { kind: "open"; tableId: string }
  | { kind: "order"; orderId: string }
  | { kind: "move"; fromTableId?: string }
  | { kind: "merge"; fromTableId?: string }
  | { kind: "split"; orderId: string }
  | { kind: "reserve"; tableId?: string }
  | { kind: "layout"; floorId: string }
  | { kind: "void"; orderId: string }
  | { kind: "specials"; orderId: string };

function clampPct(n: number) {
  return Math.min(88, Math.max(2, n));
}

function layoutSlot(index: number) {
  const col = index % 6;
  const row = Math.floor(index / 6);
  return { layoutX: 4 + col * 15.5, layoutY: 6 + row * 22 };
}

function localDateTimeIn(minutes: number) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nextBookedFor(
  reservations: Array<{
    table: { id: string } | null;
    status: string;
    guestName: string;
    startAt: string;
  }>,
  tableId: string,
) {
  return reservations
    .filter((r) => r.table?.id === tableId && r.status === "booked")
    .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
}

function bookingWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Petpooja-style display status (billed ≠ still running). */
function parseReservationDuration(notes?: string | null): number {
  if (!notes) return 60;
  const match = notes.match(/\[Duration:\s*(\d+)m\]/);
  return match ? parseInt(match[1], 10) : 60;
}

function isReservationActiveNow(
  r: { startAt: string; notes?: string | null; status: string },
  nowMs: number = Date.now(),
): boolean {
  if (r.status === "seated") return true;
  if (r.status !== "booked") return false;
  const startMs = new Date(r.startAt).getTime();
  if (Number.isNaN(startMs)) return false;
  const duration = parseReservationDuration(r.notes);
  const endMs = startMs + duration * 60 * 1000;
  return nowMs >= startMs - 15 * 60 * 1000 && nowMs < endMs;
}

function floorStatus(
  t: DiningTable,
  reservations?: Array<{
    table: { id: string } | null;
    status: string;
    guestName: string;
    startAt: string;
    notes?: string | null;
  }>,
): keyof typeof FLOOR_TILE {
  const now = Date.now();
  if (t.billedAt || t.kitchenPhase === "billed") return "billed";
  if (t.status === "occupied" || Boolean(t.currentOrderId)) return "occupied";
  if (
    reservations &&
    reservations.some(
      (r) => r.table?.id === t.id && r.status === "seated",
    )
  ) {
    return "occupied";
  }
  if (
    reservations &&
    reservations.some(
      (r) =>
        r.table?.id === t.id &&
        isReservationActiveNow(r, now),
    )
  ) {
    return "reserved";
  }
  if (t.status === "reserved") return "reserved";
  if (t.status === "cleaning") return "cleaning";
  if (t.status === "blocked") return "blocked";
  if (FLOOR_TILE[t.status]) return t.status as keyof typeof FLOOR_TILE;
  return "available";
}

function elapsedLabel(iso?: string | null) {
  if (!iso) return null;
  const mins = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 60_000),
  );
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function moneyShort(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return null;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export default function RestaurantTablesPage() {
  const qc = useQueryClient();
  const { hasCapability, data: boot, money } = useBootstrap();
  const locationId =
    useBranchStore((s) => s.currentLocationId) || boot?.locations?.[0]?.id;
  const allowed = hasCapability("TABLE") || hasCapability("CAPTAIN");
  const canReserve =
    hasCapability("DINING_RESERVATION") || hasCapability("TABLE");

  const [floorFilter, setFloorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "layout">("layout");

  const cfg = useQuery({
    queryKey: ["restaurant-config"],
    queryFn: () => restaurantApi.config(),
    enabled: allowed,
  });

  const saveConfig = useMutation({
    mutationFn: (body: Record<string, unknown>) => restaurantApi.saveConfig(body),
    onSuccess: (_, variables) => {
      toast.success(
        variables.seatingBasedReservation
          ? "Seating-based reservation enabled"
          : "Seating-based reservation disabled",
      );
      void qc.invalidateQueries({ queryKey: ["restaurant-config"] });
      void qc.refetchQueries({ queryKey: ["restaurant-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [modal, setModal] = useState<Modal | null>(null);
  const markStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      restaurantApi.updateTable(id, { status }),
    onSuccess: (_, variables) => {
      toast.success(
        variables.status === "available"
          ? "Table marked clean and available"
          : "Table marked for cleaning",
      );
      refreshFloor();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [menuTableId, setMenuTableId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 10_000);
    return () => window.clearInterval(id);
  }, []);

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
  const categories = useQuery({
    queryKey: ["pos-sale-categories"],
    queryFn: () => posApi.listSaleCategories(),
    enabled: allowed,
  });
  const reservations = useQuery({
    queryKey: ["dining-reservations", locationId],
    queryFn: () => restaurantApi.reservations(locationId),
    enabled: canReserve && Boolean(locationId),
  });
  const activeOrderId =
    modal?.kind === "order" || modal?.kind === "split" || modal?.kind === "void"
      ? modal.orderId
      : null;
  const order = useQuery({
    queryKey: ["restaurant-order", activeOrderId],
    queryFn: () => restaurantApi.getOrder(activeOrderId!),
    enabled: Boolean(activeOrderId),
  });

  const refreshFloor = () => {
    void qc.invalidateQueries({ queryKey: ["restaurant-floors"] });
    void qc.invalidateQueries({ queryKey: ["restaurant-tables"] });
    void qc.invalidateQueries({ queryKey: ["dining-reservations"] });
    void qc.refetchQueries({ queryKey: ["restaurant-tables"] });
    void qc.refetchQueries({ queryKey: ["dining-reservations"] });
  };

  const allTables = tables.data ?? [];
  const allFloors = floors.data ?? [];

  useEffect(() => {
    if (floorFilter !== "all") return;
    if (allFloors.length === 1) setFloorFilter(allFloors[0]!.id);
  }, [allFloors, floorFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: allTables.length,
      available: 0,
      occupied: 0,
      billed: 0,
      reserved: 0,
      cleaning: 0,
      blocked: 0,
    };
    for (const t of allTables) {
      const s = floorStatus(t, reservations.data ?? []);
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [allTables]);

  const filteredTables = useMemo(() => {
    return allTables.filter((t) => {
      if (floorFilter !== "all" && (t.floorId || "unassigned") !== floorFilter)
        return false;
      if (statusFilter !== "all" && floorStatus(t, reservations.data ?? []) !== statusFilter)
        return false;
      return true;
    });
  }, [allTables, floorFilter, statusFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, DiningTable[]>();
    for (const t of filteredTables) {
      const key = t.floorId || "unassigned";
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    const keys = [
      ...allFloors.map((f) => f.id),
      ...(map.has("unassigned") ? ["unassigned"] : []),
    ];
    return keys
      .filter((k) => map.has(k))
      .map((k) => [k, map.get(k)!] as const);
  }, [filteredTables, allFloors]);

  function onTableActivate(t: DiningTable) {
    setMenuTableId(null);
    const st = floorStatus(t, reservations.data ?? []);
    if (t.currentOrderId || st === "occupied") {
      if (t.currentOrderId) {
        setModal({ kind: "order", orderId: t.currentOrderId });
      } else {
        toast.info(`${t.name} is occupied`);
      }
      return;
    }
    if (st === "blocked") {
      setModal({ kind: "table", id: t.id });
      return;
    }
    if (st === "cleaning") {
      void restaurantApi
        .updateTable(t.id, { status: "available" })
        .then(() => {
          toast.success(`${t.name} marked cleaned & available`);
          refreshFloor();
        })
        .catch((e: Error) => toast.error(e.message));
      return;
    }
    if (st === "reserved") {
      const booking = (reservations.data ?? []).find(
        (r) => r.table?.id === t.id && r.status === "booked",
      );
      if (booking) {
        setModal({ kind: "open", tableId: t.id });
      } else {
        setModal({ kind: "open", tableId: t.id });
      }
      return;
    }
    setModal({ kind: "open", tableId: t.id });
  }

  if (!allowed) {
    return (
      <DiningShell
        title="Floor"
        subtitle="Enable the Tables capability to use the dining floor."
      >
        <DiningEmpty
          title="Dining floor is off"
          detail="Turn on Tables in Settings → Capabilities. Other commerce modes stay unchanged."
        />
      </DiningShell>
    );
  }

  const activeFloor =
    floorFilter !== "all"
      ? allFloors.find((f) => f.id === floorFilter)
      : null;

  return (
    <DiningShell
      title="Floor"
      subtitle="Live table map — seat guests, run tickets, move / merge, bill. Works with any Universal POS branch that has Tables on."
      action={
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => refreshFloor()}
          >
            <RefreshCw className="mr-1 size-3.5" />
            Refresh
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setModal({ kind: "floor" })}
          >
            New area
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-[#1a56db] hover:bg-[#1546b3]"
            onClick={() =>
              setModal({
                kind: "table",
                floorId: floorFilter !== "all" ? floorFilter : undefined,
              })
            }
          >
            <Plus className="mr-1 size-3.5" />
            Table
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              const floorId =
                floorFilter !== "all" ? floorFilter : allFloors[0]?.id;
              if (!floorId) {
                toast.error("Add a dining area first");
                return;
              }
              setModal({ kind: "layout", floorId });
            }}
          >
            Arrange
          </Button>
          {canReserve ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setModal({ kind: "reserve" })}
            >
              Reserve
            </Button>
          ) : null}
          <label className="flex items-center gap-1.5 rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#334155] shadow-sm hover:bg-[#f8fafc] cursor-pointer">
            <span>Seating fit</span>
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-[#cbd5e1] text-[#1a56db] focus:ring-[#1a56db]"
              checked={Boolean((cfg.data as Record<string, unknown>)?.seatingBasedReservation)}
              onChange={(e) => saveConfig.mutate({ seatingBasedReservation: e.target.checked })}
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setModal({ kind: "move" })}
          >
            <ArrowRightLeft className="mr-1 size-3.5" />
            Move / merge
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/restaurant/setup">Setup</Link>
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            ["available", "Free"],
            ["occupied", "Running"],
            ["billed", "Billed"],
            ["reserved", "Reserved"],
            ["cleaning", "Cleaning"],
            ["all", "Total"],
          ] as const
        ).map(([id, label]) => {
          const style = id === "all" ? null : FLOOR_TILE[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => setStatusFilter(id === "all" ? "all" : id)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left transition",
                statusFilter === (id === "all" ? "all" : id)
                  ? "border-[#1a56db] bg-[#eff6ff] ring-1 ring-[#bfdbfe]"
                  : "border-[#e4e9f0] bg-white hover:border-[#c5d0e0]",
              )}
            >
              <div className="flex items-center gap-2">
                {style ? (
                  <span className={cn("size-2.5 rounded-full", style.dot)} />
                ) : (
                  <span className="size-2.5 rounded-full bg-[#1a56db]" />
                )}
                <span className="text-[0.65rem] font-semibold tracking-wide text-[#8b9bb0] uppercase">
                  {label}
                </span>
              </div>
              <p className="mt-1 text-xl font-semibold tabular-nums text-[#0b1f33]">
                {counts[id] ?? 0}
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e4e9f0] bg-white p-2 shadow-sm">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setFloorFilter("all")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-semibold",
              floorFilter === "all"
                ? "bg-[#1a56db] text-white"
                : "text-[#5a6b7d] hover:bg-[#f1f5f9]",
            )}
          >
            All areas
          </button>
          {allFloors.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFloorFilter(f.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold",
                floorFilter === f.id
                  ? "bg-[#1a56db] text-white"
                  : "text-[#5a6b7d] hover:bg-[#f1f5f9]",
              )}
            >
              {f.name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-[#f1f5f9] p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("layout")}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold",
              viewMode === "layout"
                ? "bg-white text-[#0b1f33] shadow-sm"
                : "text-[#5a6b7d]",
            )}
          >
            <MapIcon className="size-3.5" />
            Floor map
          </button>
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold",
              viewMode === "grid"
                ? "bg-white text-[#0b1f33] shadow-sm"
                : "text-[#5a6b7d]",
            )}
          >
            <LayoutGrid className="size-3.5" />
            Grid
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[0.7rem] text-[#5a6b7d]">
        <span className="font-semibold text-[#8b9bb0]">Legend</span>
        {Object.entries(FLOOR_TILE).map(([id, s]) => (
          <span key={id} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", s.dot)} />
            {s.label}
          </span>
        ))}
        <span className="text-[#8b9bb0]">
          Tap free → seat · running → ticket · cleaning → mark free
        </span>
      </div>

      {!allTables.length ? (
        <DiningEmpty
          title="No tables yet"
          detail="Add a dining area, then tables. Tap a free table to open a ticket."
        />
      ) : viewMode === "layout" && floorFilter !== "all" ? (
        <section className="overflow-hidden rounded-xl border border-[#d9e0ea] bg-[#e8eef5]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d9e0ea] bg-white/80 px-4 py-2.5">
            <div>
              <h2 className="text-sm font-semibold text-[#0b1f33]">
                {activeFloor?.name ?? "Floor"}
              </h2>
              <p className="text-[0.7rem] text-[#8b9bb0]">
                {filteredTables.length} tables
                {activeFloor?.taxRatePercent != null
                  ? ` · tax ${activeFloor.taxRatePercent}%`
                  : ""}
                {activeFloor?.serviceChargePercent != null
                  ? ` · service ${activeFloor.serviceChargePercent}%`
                  : ""}
              </p>
            </div>
            {activeFloor ? (
              <button
                type="button"
                className="rounded-lg p-1.5 text-[#8b9bb0] hover:bg-[#f1f5f9] hover:text-[#0b1f33]"
                aria-label="Edit area"
                onClick={() => setModal({ kind: "floor", id: activeFloor.id })}
              >
                <Pencil className="size-4" />
              </button>
            ) : null}
          </div>
          <FloorLayoutPreview
            tables={filteredTables}
            money={money}
            menuTableId={menuTableId}
            setMenuTableId={setMenuTableId}
            onActivate={onTableActivate}
            onEdit={(t) => setModal({ kind: "table", id: t.id })}
            onMove={(t) => setModal({ kind: "move", fromTableId: t.id })}
            onMerge={(t) => setModal({ kind: "merge", fromTableId: t.id })}
            onReserve={
              canReserve
                ? (t) => setModal({ kind: "reserve", tableId: t.id })
                : undefined
            }
            reservations={reservations.data ?? []}
          />
        </section>
      ) : (
        grouped.map(([floorKey, list]) => {
          const floor = allFloors.find((f) => f.id === floorKey);
          const title = floor?.name ?? "Unassigned";
          return (
            <section key={floorKey} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-[#0b1f33]">
                  {title}
                  <span className="ml-2 text-xs font-normal text-[#8b9bb0]">
                    {list.length} tables
                  </span>
                </h2>
                {floor ? (
                  <button
                    type="button"
                    className="rounded p-1 text-[#8b9bb0] hover:bg-black/5 hover:text-[#0b1f33]"
                    aria-label="Edit floor"
                    onClick={() => setModal({ kind: "floor", id: floor.id })}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              {viewMode === "layout" ? (
                <FloorLayoutPreview
                  tables={list}
                  money={money}
                  menuTableId={menuTableId}
                  setMenuTableId={setMenuTableId}
                  onActivate={onTableActivate}
                  onEdit={(t) => setModal({ kind: "table", id: t.id })}
                  onMove={(t) => setModal({ kind: "move", fromTableId: t.id })}
                  onMerge={(t) =>
                    setModal({ kind: "merge", fromTableId: t.id })
                  }
                  onReserve={
                    canReserve
                      ? (t) => setModal({ kind: "reserve", tableId: t.id })
                      : undefined
                  }
                  reservations={reservations.data ?? []}
                />
              ) : (
                <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {list.map((t) => (
                    <li key={t.id}>
                      <TableTile
                        table={t}
                        money={money}
                        next={nextBookedFor(reservations.data ?? [], t.id)}
                        menuOpen={menuTableId === t.id}
                        onMenuToggle={() =>
                          setMenuTableId((id) => (id === t.id ? null : t.id))
                        }
                        onActivate={() => onTableActivate(t)}
                        onEdit={() => setModal({ kind: "table", id: t.id })}
                        onMove={() =>
                          setModal({ kind: "move", fromTableId: t.id })
                        }
                        onMerge={() =>
                          setModal({ kind: "merge", fromTableId: t.id })
                        }
                        onReserve={
                          canReserve
                            ? () =>
                                setModal({ kind: "reserve", tableId: t.id })
                            : undefined
                        }
                        canQr={Boolean(
                          hasCapability("QR_ORDER") && t.qrToken,
                        )}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}

      {modal?.kind === "floor" ? (
        <FloorModal
          floor={allFloors.find((f) => f.id === modal.id) ?? null}
          categories={categories.data ?? []}
          locationId={locationId!}
          onClose={() => setModal(null)}
          onSaved={refreshFloor}
        />
      ) : null}
      {modal?.kind === "table" ? (
        <TableModal
          table={allTables.find((t) => t.id === modal.id) ?? null}
          floors={allFloors}
          locationId={locationId!}
          defaultFloorId={modal.floorId}
          onClose={() => setModal(null)}
          onSaved={refreshFloor}
        />
      ) : null}
      {modal?.kind === "open" &&
      allTables.find((t) => t.id === modal.tableId) ? (
        <OpenTableModal
          table={allTables.find((t) => t.id === modal.tableId)!}
          reservations={reservations.data ?? []}
          onClose={() => setModal(null)}
          onOpened={(orderId) => {
            refreshFloor();
            void qc.invalidateQueries({ queryKey: ["dining-reservations"] });
            setModal({ kind: "order", orderId });
          }}
        />
      ) : null}
      {modal?.kind === "order" ? (
        order.data ? (
          <RunningOrderModal
            order={order.data}
            tables={allTables}
            onClose={() => setModal(null)}
            onSplit={() =>
              setModal({ kind: "split", orderId: order.data.id })
            }
            onMove={(fromTableId) => setModal({ kind: "move", fromTableId })}
            onMerge={(fromTableId) => setModal({ kind: "merge", fromTableId })}
            onVoid={() => setModal({ kind: "void", orderId: order.data.id })}
            onBookNext={
              canReserve
                ? (tableId) => setModal({ kind: "reserve", tableId })
                : undefined
            }
            onGuestSpecials={() =>
              setModal({ kind: "specials", orderId: order.data.id })
            }
            nextBooking={(() => {
              const tid = allTables.find(
                (t) => t.currentOrderId === order.data.id,
              )?.id;
              return tid
                ? nextBookedFor(reservations.data ?? [], tid)
                : undefined;
            })()}
            onKot={() => {
              void qc.invalidateQueries({ queryKey: ["restaurant-order"] });
              void qc.invalidateQueries({ queryKey: ["restaurant-kots"] });
            }}
          />
        ) : (
          <ModalFrame title="Running order" onClose={() => setModal(null)}>
            <p className="text-sm text-[#5a6b7d]">Loading ticket…</p>
          </ModalFrame>
        )
      ) : null}
      {modal?.kind === "move" || modal?.kind === "merge" ? (
        <MoveMergeModal
          mode={modal.kind}
          tables={allTables}
          fromTableId={modal.fromTableId ?? ""}
          onClose={() => setModal(null)}
          onDone={() => {
            refreshFloor();
            setModal(null);
          }}
        />
      ) : null}
      {modal?.kind === "split" && order.data ? (
        <SplitModal
          order={order.data}
          tables={allTables}
          onClose={() =>
            setModal({ kind: "order", orderId: order.data.id })
          }
          onDone={(keepOrderId) => {
            refreshFloor();
            void qc.invalidateQueries({ queryKey: ["restaurant-order"] });
            setModal({ kind: "order", orderId: keepOrderId });
          }}
        />
      ) : null}
      {modal?.kind === "reserve" ? (
        <ReserveModal
          tables={allTables}
          locationId={locationId!}
          defaultTableId={modal.tableId}
          reservations={reservations.data ?? []}
          onClose={() => setModal(null)}
          onSaved={() => {
            refreshFloor();
            void qc.invalidateQueries({ queryKey: ["dining-reservations"] });
            setModal(null);
          }}
        />
      ) : null}
      {modal?.kind === "specials" ? (
        <GuestSpecialsModal
          orderId={modal.orderId}
          onClose={() => setModal({ kind: "order", orderId: modal.orderId })}
          onSaved={() => {
            refreshFloor();
            void qc.invalidateQueries({ queryKey: ["restaurant-order"] });
            void qc.invalidateQueries({ queryKey: ["restaurant-kots"] });
            setModal({ kind: "order", orderId: modal.orderId });
          }}
        />
      ) : null}
      {modal?.kind === "layout" &&
      allFloors.find((f) => f.id === modal.floorId) ? (
        <LayoutModal
          key={modal.floorId}
          floor={allFloors.find((f) => f.id === modal.floorId)!}
          tables={allTables.filter((t) => t.floorId === modal.floorId)}
          floors={allFloors}
          onFloorChange={(floorId) => setModal({ kind: "layout", floorId })}
          onClose={() => setModal(null)}
          onSaved={() => {
            refreshFloor();
            setViewMode("layout");
            setModal(null);
          }}
        />
      ) : null}
      {modal?.kind === "void" ? (
        <VoidModal
          orderId={modal.orderId}
          onClose={() => setModal({ kind: "order", orderId: modal.orderId })}
          onDone={() => {
            refreshFloor();
            setModal(null);
          }}
        />
      ) : null}
    </DiningShell>
  );
}

function TableTile({
  table: t,
  money,
  next,
  menuOpen,
  onMenuToggle,
  onActivate,
  onEdit,
  onMove,
  onMerge,
  onReserve,
  canQr,
}: {
  table: DiningTable;
  money: (n: string | number) => string;
  next?: { guestName: string; startAt: string };
  menuOpen: boolean;
  onMenuToggle: () => void;
  onActivate: () => void;
  onEdit: () => void;
  onMove: () => void;
  onMerge: () => void;
  onReserve?: () => void;
  canQr: boolean;
}) {
  const st = floorStatus(t);
  const style = FLOOR_TILE[st] ?? FLOOR_TILE.available;
  const elapsed = elapsedLabel(t.orderCreatedAt);
  const amt = moneyShort(t.runningTotal ?? t.balanceDue);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onActivate}
        className={cn(
          "flex min-h-[7.75rem] w-full flex-col rounded-2xl border-2 px-3 py-3 text-left transition hover:brightness-105",
          style.tile,
        )}
      >
        <div className="flex items-start justify-between gap-2 pr-7">
          <p className={cn("text-base font-bold tracking-tight", style.ink)}>
            {t.name}
          </p>
          <span
            className={cn(
              "rounded-full bg-black/15 px-2 py-0.5 text-[0.65rem] font-bold uppercase",
              style.ink,
            )}
          >
            {style.label}
          </span>
        </div>
        <p
          className={cn(
            "mt-1 flex items-center gap-1 text-xs opacity-90",
            style.ink,
          )}
        >
          <Users className="size-3" />
          {t.covers ? `${t.covers}/${t.capacity}` : `${t.capacity} seats`}
          {elapsed ? ` · ${elapsed}` : ""}
        </p>
        <div className="mt-auto space-y-0.5 pt-2">
          {amt ? (
            <p className={cn("text-sm font-bold tabular-nums", style.ink)}>
              {money(t.runningTotal ?? t.balanceDue ?? 0)}
            </p>
          ) : null}
          {t.orderNumber ? (
            <p className={cn("text-[0.65rem] font-semibold opacity-90", style.ink)}>
              {t.orderNumber}
            </p>
          ) : null}
          {t.guestName ? (
            <p className={cn("truncate text-xs opacity-90", style.ink)}>
              {t.guestName}
            </p>
          ) : null}
          {next ? (
            <p className={cn("truncate text-[0.65rem] opacity-80", style.ink)}>
              Next: {next.guestName} · {bookingWhen(next.startAt)}
            </p>
          ) : null}
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onMenuToggle();
        }}
        className="absolute right-2 top-2 rounded-lg bg-black/20 p-1 text-white hover:bg-black/35"
        aria-label="Table actions"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {menuOpen ? (
        <div className="absolute right-2 top-10 z-20 min-w-[9rem] overflow-hidden rounded-lg border border-[#e2e8f0] bg-white py-1 text-sm shadow-lg">
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left hover:bg-[#f8fafc]"
            onClick={onEdit}
          >
            Edit table
          </button>
          {t.currentOrderId ? (
            <>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left hover:bg-[#f8fafc]"
                onClick={onMove}
              >
                Move order
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left hover:bg-[#f8fafc]"
                onClick={onMerge}
              >
                Merge tables
              </button>
            </>
          ) : null}
          {onReserve && t.status !== "occupied" && !t.currentOrderId ? (
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left hover:bg-[#f8fafc]"
              onClick={onReserve}
            >
              Reserve
            </button>
          ) : null}
          {canQr && t.qrToken ? (
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left hover:bg-[#f8fafc]"
              onClick={() => {
                const url = `${window.location.origin}/order/${t.qrToken}`;
                void navigator.clipboard.writeText(url);
                toast.success("Guest QR link copied");
              }}
            >
              Copy guest QR
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FloorLayoutPreview({
  tables,
  money,
  menuTableId,
  setMenuTableId,
  onActivate,
  onEdit,
  onMove,
  onMerge,
  onReserve,
  reservations,
}: {
  tables: DiningTable[];
  money: (n: string | number) => string;
  menuTableId: string | null;
  setMenuTableId: (id: string | null) => void;
  onActivate: (t: DiningTable) => void;
  onEdit: (t: DiningTable) => void;
  onMove: (t: DiningTable) => void;
  onMerge: (t: DiningTable) => void;
  onReserve?: (t: DiningTable) => void;
  reservations: Array<{
    table: { id: string } | null;
    status: string;
    guestName: string;
    startAt: string;
  }>;
}) {
  return (
    <div className="relative h-[min(70vh,32rem)] overflow-hidden bg-[radial-gradient(circle_at_1px_1px,#cbd5e1_1px,transparent_0)] [background-size:18px_18px]">
      {tables.map((t, i) => {
        const slot = layoutSlot(i);
        const x = t.layoutX ?? slot.layoutX;
        const y = t.layoutY ?? slot.layoutY;
        const st = floorStatus(t, reservations);
        const style = FLOOR_TILE[st] ?? FLOOR_TILE.available;
        const elapsed = elapsedLabel(t.orderCreatedAt);
        const amt = moneyShort(t.runningTotal ?? t.balanceDue);
        return (
          <div
            key={t.id}
            style={{ left: `${x}%`, top: `${y}%` }}
            className="absolute z-10 w-[13%] min-w-[5.25rem]"
          >
            <button
              type="button"
              onClick={() => onActivate(t)}
              onContextMenu={(e) => {
                e.preventDefault();
                onEdit(t);
              }}
              className={cn(
                "w-full rounded-xl border-2 px-2 py-2 text-left shadow-md transition hover:brightness-105",
                style.tile,
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <p className={cn("truncate text-xs font-bold", style.ink)}>
                  {t.name}
                </p>
                <span className={cn("inline-flex items-center gap-1 rounded-full bg-black/25 px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider", style.ink)}>
                  <span className="size-1 rounded-full bg-white/90" />
                  {style.label}
                </span>
              </div>
              <p className={cn("text-[0.65rem] opacity-90", style.ink)}>
                {t.covers ? `${t.covers}p` : `${t.capacity}s`}
                {elapsed ? ` ${elapsed}` : ""}
              </p>
              {amt ? (
                <p className={cn("text-xs font-bold tabular-nums", style.ink)}>
                  {money(t.runningTotal ?? t.balanceDue ?? 0)}
                </p>
              ) : null}
            </button>
            <button
              type="button"
              className="absolute -right-1 -top-1 rounded-full bg-white p-0.5 text-[#5a6b7d] shadow ring-1 ring-[#e2e8f0]"
              onClick={(e) => {
                e.stopPropagation();
                setMenuTableId(menuTableId === t.id ? null : t.id);
              }}
              aria-label="Actions"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
            {menuTableId === t.id ? (
              <div className="absolute left-0 top-full z-30 mt-1 min-w-[8.5rem] overflow-hidden rounded-lg border border-[#e2e8f0] bg-white py-1 text-xs shadow-lg">
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left hover:bg-[#f8fafc]"
                  onClick={() => onEdit(t)}
                >
                  Edit
                </button>
                {t.currentOrderId ? (
                  <>
                    <button
                      type="button"
                      className="block w-full px-3 py-1.5 text-left hover:bg-[#f8fafc]"
                      onClick={() => onMove(t)}
                    >
                      Move
                    </button>
                    <button
                      type="button"
                      className="block w-full px-3 py-1.5 text-left hover:bg-[#f8fafc]"
                      onClick={() => onMerge(t)}
                    >
                      Merge
                    </button>
                  </>
                ) : null}
                {onReserve && t.status !== "occupied" && !t.currentOrderId ? (
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left hover:bg-[#f8fafc]"
                    onClick={() => onReserve(t)}
                  >
                    Reserve
                  </button>
                ) : null}
                {nextBookedFor(reservations, t.id) ? (
                  <p className="border-t border-[#f1f5f9] px-3 py-1.5 text-[0.65rem] text-[#9a3412]">
                    Next: {nextBookedFor(reservations, t.id)!.guestName}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {!tables.length ? (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-[#64748b]">
          No tables in this filter
        </p>
      ) : null}
    </div>
  );
}


function FloorModal({
  floor,
  categories,
  locationId,
  onClose,
  onSaved,
}: {
  floor: DiningFloor | null;
  categories: Array<{ id: string; name: string; productCount: number }>;
  locationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(floor?.name ?? "Main floor");
  const [categoryIds, setCategoryIds] = useState<string[]>(
    floor?.categoryIds ?? [],
  );
  const [tax, setTax] = useState(
    floor?.taxRatePercent != null ? String(floor.taxRatePercent) : "",
  );
  const [service, setService] = useState(
    floor?.serviceChargePercent != null
      ? String(floor.serviceChargePercent)
      : "",
  );
  const save = useMutation({
    mutationFn: async () => {
      const body = {
        categoryIds,
        taxRatePercent: tax.trim() === "" ? null : Number(tax),
        serviceChargePercent: service.trim() === "" ? null : Number(service),
      };
      if (floor) {
        await restaurantApi.updateFloor(floor.id, { name: name.trim(), ...body });
        return;
      }
      const created = await restaurantApi.createFloor({
        locationId,
        name: name.trim(),
      });
      await restaurantApi.updateFloor(created.id, body);
    },
    onSuccess: () => {
      toast.success(floor ? "Floor updated" : "Floor added");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ModalFrame
      title={floor ? "Edit dining area" : "New floor"}
      subtitle="Area menu, tax, and service apply when a table on this floor is billed."
      onClose={onClose}
      className="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!name.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <div>
          <Label>Floor / dining area</Label>
          <Input
            className="mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label>Area menu (categories)</Label>
          <p className="mt-0.5 text-xs text-[#8b9bb0]">
            Leave empty to show the full catalog at Counter.
          </p>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-[#e2e8f0] p-2">
            {categories.length ? (
              categories.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 rounded px-1 py-1 text-sm text-[#0b1f33] hover:bg-[#f8fafc]"
                >
                  <input
                    type="checkbox"
                    checked={categoryIds.includes(c.id)}
                    onChange={(e) =>
                      setCategoryIds((ids) =>
                        e.target.checked
                          ? [...ids, c.id]
                          : ids.filter((id) => id !== c.id),
                      )
                    }
                  />
                  {c.name}
                  <span className="text-xs text-[#8b9bb0]">
                    {c.productCount}
                  </span>
                </label>
              ))
            ) : (
              <p className="px-1 py-2 text-sm text-[#8b9bb0]">
                No item categories yet.
              </p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Area tax %</Label>
            <Input
              className="mt-1"
              inputMode="decimal"
              placeholder="None"
              value={tax}
              onChange={(e) => setTax(e.target.value)}
            />
          </div>
          <div>
            <Label>Service charge %</Label>
            <Input
              className="mt-1"
              inputMode="decimal"
              placeholder="Use shop default"
              value={service}
              onChange={(e) => setService(e.target.value)}
            />
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}

function TableModal({
  table,
  floors,
  locationId,
  defaultFloorId,
  onClose,
  onSaved,
}: {
  table: DiningTable | null;
  floors: DiningFloor[];
  locationId: string;
  defaultFloorId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(table?.name ?? "");
  const [capacity, setCapacity] = useState(String(table?.capacity ?? 4));
  const [floorId, setFloorId] = useState(table?.floorId ?? defaultFloorId ?? "");
  const [status, setStatus] = useState(table?.status ?? "available");
  const save = useMutation({
    mutationFn: async () => {
      if (table) {
        await restaurantApi.updateTable(table.id, {
          name: name.trim(),
          capacity: Number(capacity) || 4,
          floorId: floorId || null,
          status,
        });
        return;
      }
      await restaurantApi.createTable({
        locationId,
        name: name.trim(),
        capacity: Number(capacity) || 4,
        floorId: floorId || undefined,
      });
    },
    onSuccess: () => {
      toast.success(table ? "Table updated" : "Table added");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => restaurantApi.deleteTable(table!.id),
    onSuccess: () => {
      toast.success("Table deleted");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ModalFrame
      title={table ? "Edit table" : "New table"}
      subtitle="Capacity and status stay on the table. Stock lives on inventory, not here."
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between">
          {table ? (
            <Button
              type="button"
              variant="danger"
              disabled={remove.isPending}
              onClick={() => {
                if (confirm("Delete this table?")) remove.mutate();
              }}
            >
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!name.trim() || save.isPending}
              onClick={() => save.mutate()}
            >
              Save
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
            placeholder="T12"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Capacity (seats)</Label>
            <Input
              className="mt-1"
              inputMode="numeric"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </div>
          <div>
            <Label>Status</Label>
            <Select
              className={cn(diningSelectClass, "mt-1 w-full")}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={!table}
            >
              {[
                ["available", "Available (assignable)"],
                ["reserved", "Reserved (not assignable to others)"],
                ["occupied", "Occupied (not assignable)"],
                ["cleaning", "Cleaning (not assignable)"],
                ["blocked", "Blocked (not assignable)"],
              ].map(([val, lbl]) => (
                <option key={val} value={val}>
                  {lbl}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label>Floor / dining area</Label>
          <Select
            className={cn(diningSelectClass, "mt-1 w-full")}
            value={floorId}
            onChange={(e) => setFloorId(e.target.value)}
          >
            <option value="">No floor</option>
            {floors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </ModalFrame>
  );
}

function OpenTableModal({
  table,
  reservations,
  onClose,
  onOpened,
}: {
  table: DiningTable;
  reservations: Array<{
    id: string;
    guestName: string;
    covers: number;
    status: string;
    table: { id: string; name: string } | null;
  }>;
  onClose: () => void;
  onOpened: (orderId: string) => void;
}) {
  const booking = reservations.find(
    (r) => r.table?.id === table.id && r.status === "booked",
  );
  const [covers, setCovers] = useState(String(booking?.covers ?? 2));
  const [guestName, setGuestName] = useState(booking?.guestName ?? "");
  const open = useMutation({
    mutationFn: async () => {
      if (table.status === "reserved") {
        if (booking) {
          await restaurantApi.updateReservation(booking.id, {
            status: "seated",
          });
        }
        await restaurantApi.updateTable(table.id, { status: "available" });
      }
      return restaurantApi.openTable(table.id, {
        covers: Number(covers) || 2,
        guestName: guestName.trim() || undefined,
      });
    },
    onSuccess: (data) => {
      toast.success(`Opened ${data.orderNumber}`);
      onOpened(data.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ModalFrame
      title={`Open ${table.name}`}
      subtitle={
        table.status === "reserved"
          ? "This table is reserved. Seat the guest to start a running order."
          : `${table.capacity} seats · ${table.status}`
      }
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={open.isPending}
            onClick={() => open.mutate()}
          >
            {table.status === "reserved" ? "Seat & open" : "Open table"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <div>
          <Label>Covers</Label>
          <Input
            className="mt-1"
            inputMode="numeric"
            value={covers}
            onChange={(e) => setCovers(e.target.value)}
          />
        </div>
        <div>
          <Label>Guest name</Label>
          <Input
            className="mt-1"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
          />
        </div>
      </div>
    </ModalFrame>
  );
}

function RunningOrderModal({
  order,
  tables,
  onClose,
  onSplit,
  onMove,
  onMerge,
  onVoid,
  onBookNext,
  onGuestSpecials,
  nextBooking,
  onKot,
}: {
  order: Awaited<ReturnType<typeof restaurantApi.getOrder>>;
  tables: DiningTable[];
  onClose: () => void;
  onSplit: () => void;
  onMove: (fromTableId: string) => void;
  onMerge: (fromTableId: string) => void;
  onVoid: () => void;
  onBookNext?: (tableId: string) => void;
  onGuestSpecials?: () => void;
  nextBooking?: { guestName: string; startAt: string };
  onKot: () => void;
}) {
  const [more, setMore] = useState(false);
  const fromTable = tables.find((t) => t.currentOrderId === order.id);
  const specials = order.restaurant?.guestSpecials;
  const specialBits = [
    specials?.occasion
      ? GUEST_OCCASION_OPTS.find(([id]) => id === specials.occasion)?.[1]
      : null,
    ...(specials?.requests ?? []).map(requestLabel),
    specials?.note || null,
  ].filter(Boolean) as string[];
  const sendKot = useMutation({
    mutationFn: () => restaurantApi.sendKot(order.id),
    onSuccess: () => {
      toast.success("Sent to kitchen");
      onKot();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ModalFrame
      title={fromTable ? `${fromTable.name} · running table` : order.orderNumber}
      subtitle={
        [
          order.orderNumber,
          order.restaurant?.covers
            ? `${order.restaurant.covers} guests`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      }
      onClose={onClose}
      className="max-w-lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setMore((v) => !v)}>
            {more ? "Hide extra" : "Move / split / more"}
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            <Button asChild variant="secondary">
              <Link href="/counter">Add food</Link>
            </Button>
            <Button
              type="button"
              disabled={sendKot.isPending || !order.items.length}
              onClick={() => sendKot.mutate()}
            >
              Send to kitchen
            </Button>
            <Button asChild>
              <Link href={`/orders/view?id=${order.id}`}>Bill</Link>
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {onGuestSpecials ? (
          <button
            type="button"
            onClick={onGuestSpecials}
            className="w-full rounded-xl border border-[#dbe4f0] bg-[#f8fafc] px-4 py-3 text-left hover:border-[#1a56db] hover:bg-[#eff6ff]"
          >
            <p className="text-[0.7rem] font-semibold tracking-wide text-[#1a56db] uppercase">
              Guest asked for
            </p>
            {specialBits.length ? (
              <p className="mt-1 text-sm font-medium text-[#0b1f33]">
                {specialBits.join(" · ")}
              </p>
            ) : (
              <p className="mt-1 text-sm text-[#5a6b7d]">
                Tap to add water, cake, or décor
              </p>
            )}
          </button>
        ) : null}

        {nextBooking ? (
          <div className="rounded-xl border border-[#fed7aa] bg-[#fff7ed] px-4 py-3">
            <p className="text-[0.7rem] font-semibold tracking-wide text-[#9a3412] uppercase">
              Next guest waiting
            </p>
            <p className="mt-1 text-sm font-medium text-[#0b1f33]">
              {nextBooking.guestName} · {bookingWhen(nextBooking.startAt)}
            </p>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-[0.7rem] font-semibold tracking-wide text-[#8b9bb0] uppercase">
            Food on this table
          </p>
          {order.items.length ? (
            <table className="w-full text-left text-sm">
              <thead className="text-[0.68rem] uppercase tracking-wide text-[#8b9bb0]">
                <tr>
                  <th className="pb-2 font-semibold">Item</th>
                  <th className="pb-2 text-right font-semibold">Qty</th>
                  <th className="pb-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef1f4]">
                {order.items.map((i) => (
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
          ) : (
            <p className="rounded-lg bg-[#f8fafc] px-3 py-4 text-sm text-[#5a6b7d]">
              No food yet. Use Add food, then Send to kitchen.
            </p>
          )}
        </div>

        {more ? (
          <div className="flex flex-wrap gap-2 border-t border-[#eef1f4] pt-3">
            /* Reserved option disabled on occupied running orders */
            {fromTable ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onMove(fromTable.id)}
                >
                  Move to another table
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onMerge(fromTable.id)}
                >
                  Merge tables
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!order.items.length}
              onClick={onSplit}
            >
              Split bill
            </Button>
            <Button type="button" variant="danger" size="sm" onClick={onVoid}>
              Cancel this bill
            </Button>
          </div>
        ) : null}
      </div>
    </ModalFrame>
  );
}

function MoveMergeModal({
  mode,
  tables,
  fromTableId,
  onClose,
  onDone,
}: {
  mode: "move" | "merge";
  tables: DiningTable[];
  fromTableId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [from, setFrom] = useState(fromTableId);
  const [to, setTo] = useState("");
  const run = useMutation({
    mutationFn: () =>
      mode === "move"
        ? restaurantApi.moveTable(from, to)
        : restaurantApi.mergeTables(from, to),
    onSuccess: () => {
      toast.success(
        mode === "move"
          ? "Order moved"
          : "Tables merged onto one order",
      );
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ModalFrame
      title={mode === "move" ? "Transfer table" : "Merge tables"}
      subtitle={
        mode === "move"
          ? "Move the running order to another table. Tickets are not cloned."
          : "Keep one bill. Source table becomes free."
      }
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!from || !to || from === to || run.isPending}
            onClick={() => run.mutate()}
          >
            {mode === "move" ? "Move order" : "Merge"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <div>
          <Label>From table</Label>
          <Select
            className={cn(diningSelectClass, "mt-1 w-full")}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          >
            <option value="">Select</option>
            {tables.filter((t) => t.status !== "occupied" && !t.currentOrderId).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.orderNumber ? ` · ${t.orderNumber}` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>To table</Label>
          <Select
            className={cn(diningSelectClass, "mt-1 w-full")}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          >
            <option value="">Select</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.status !== "available" ? ` · ${t.status}` : ""}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </ModalFrame>
  );
}

function SplitModal({
  order,
  tables,
  onClose,
  onDone,
}: {
  order: Awaited<ReturnType<typeof restaurantApi.getOrder>>;
  tables: DiningTable[];
  onClose: () => void;
  onDone: (keepOrderId: string) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [toTableId, setToTableId] = useState("");
  const split = useMutation({
    mutationFn: () =>
      restaurantApi.splitItems(order.id, {
        orderItemIds: picked,
        toTableId: toTableId || undefined,
      }),
    onSuccess: (data) => {
      toast.success(`Split to ${data.split.orderNumber}`);
      onDone(data.original.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ModalFrame
      title="Split bill"
      subtitle="Move selected lines onto a new ticket. Keep at least one item here."
      onClose={onClose}
      className="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button
            type="button"
            disabled={
              picked.length === 0 ||
              picked.length >= order.items.length ||
              split.isPending
            }
            onClick={() => split.mutate()}
          >
            Split selected
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-[#e2e8f0] p-2">
          {order.items.map((i) => (
            <label
              key={i.id}
              className="flex items-center gap-2 rounded px-1 py-1.5 text-sm"
            >
              <input
                type="checkbox"
                checked={picked.includes(i.id)}
                onChange={(e) =>
                  setPicked((ids) =>
                    e.target.checked
                      ? [...ids, i.id]
                      : ids.filter((id) => id !== i.id),
                  )
                }
              />
              <span className="flex-1 text-[#0b1f33]">
                {i.description || "Item"}
              </span>
              <span className="tabular-nums text-[#5a6b7d]">{i.quantity}</span>
            </label>
          ))}
        </div>
        <div>
          <Label>Move split ticket to table (optional)</Label>
          <Select
            className={cn(diningSelectClass, "mt-1 w-full")}
            value={toTableId}
            onChange={(e) => setToTableId(e.target.value)}
          >
            <option value="">Keep unseated</option>
            {tables
              .filter((t) => t.status === "available" && !t.currentOrderId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </Select>
        </div>
      </div>
    </ModalFrame>
  );
}

function ReserveModal({
  tables,
  locationId,
  defaultTableId,
  reservations = [],
  onClose,
  onSaved,
}: {
  tables: DiningTable[];
  locationId: string;
  defaultTableId?: string;
  reservations?: Array<{
    id: string;
    table: { id: string } | null;
    status: string;
    startAt: string;
    notes?: string | null;
    guestName: string;
  }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [guestName, setGuestName] = useState("");
  const [covers, setCovers] = useState("2");

  const todayYmd = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const nowHhMm = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 15);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [bookingDate, setBookingDate] = useState(todayYmd);
  const [bookingTime, setBookingTime] = useState(nowHhMm);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [tableId, setTableId] = useState("");
  const [manualSelected, setManualSelected] = useState(false);
  const [guestPhone, setGuestPhone] = useState("");

  const cfg = useQuery({
    queryKey: ["restaurant-config"],
    queryFn: () => restaurantApi.config(),
  });

  const isSeatingBased = Boolean((cfg.data as Record<string, unknown>)?.seatingBasedReservation);
  const guestCovers = Math.max(1, Number(covers) || 1);

  const startDateTime = new Date(`${bookingDate}T${bookingTime}:00`);
  const isValidStart = !Number.isNaN(startDateTime.getTime());
  const endDateTime = isValidStart
    ? new Date(startDateTime.getTime() + durationMinutes * 60 * 1000)
    : null;

  const endFormatted = endDateTime
    ? endDateTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  // Check if a table is overlapped by another active reservation for this slot
  const isTableOverlapped = (tid: string) => {
    if (!isValidStart || !endDateTime) return false;
    const startMs = startDateTime.getTime();
    const endMs = endDateTime.getTime();
    return reservations.some((r) => {
      if (r.table?.id !== tid || r.status === "cancelled" || r.status === "completed") return false;
      const rStart = new Date(r.startAt).getTime();
      const rDuration = parseReservationDuration(r.notes);
      const rEnd = rStart + rDuration * 60 * 1000;
      return startMs < rEnd && endMs > rStart;
    });
  };

  // Find dynamic smallest suitable available table for this time slot
  useEffect(() => {
    if (!isSeatingBased || manualSelected) return;
    const suitableAvailable = [...tables]
      .filter((t) => t.capacity >= guestCovers && !isTableOverlapped(t.id) && t.status !== "blocked")
      .sort((a, b) => a.capacity - b.capacity);

    if (suitableAvailable.length > 0) {
      if (tableId !== suitableAvailable[0].id) {
        setTableId(suitableAvailable[0].id);
      }
    } else {
      setTableId("");
    }
  }, [isSeatingBased, guestCovers, bookingDate, bookingTime, durationMinutes, tables, manualSelected, isValidStart]);

  const picked = tables.find((t) => t.id === tableId);
  const isTooSmall = Boolean(isSeatingBased && picked && picked.capacity < guestCovers);
  const isOverlapped = Boolean(tableId && isTableOverlapped(tableId));

  const save = useMutation({
    mutationFn: () =>
      restaurantApi.createReservation({
        locationId,
        guestName,
        guestPhone: guestPhone.trim() || undefined,
        covers: guestCovers,
        startAt: startDateTime.toISOString(),
        durationMinutes,
        tableId: tableId || undefined,
      }),
    onSuccess: () => {
      toast.success("Reservation booked");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sortedTables = [...tables].sort((a, b) => a.capacity - b.capacity);

  return (
    <ModalFrame
      title="Reserve a table"
      subtitle={
        isSeatingBased
          ? "Seating-based reservation is ON. Smallest suitable table is automatically pre-selected. You can manually choose any larger suitable table."
          : "Booking does not deduct inventory. Seat the guest from the table map when they arrive."
      }
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              !guestName.trim() || !isValidStart || isTooSmall || isOverlapped || save.isPending
            }
            onClick={() => save.mutate()}
          >
            Book Slot ({bookingTime} – {endFormatted})
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <div>
          <Label>Guest Name</Label>
          <Input
            className="mt-1"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="e.g. John Doe"
          />
        </div>
        <div>
          <Label>Phone Number</Label>
          <Input
            className="mt-1"
            value={guestPhone}
            onChange={(e) => setGuestPhone(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Covers / Guests</Label>
            <Input
              className="mt-1"
              value={covers}
              onChange={(e) => setCovers(e.target.value)}
            />
          </div>
          <div>
            <Label>Table</Label>
            <Select
              className={cn(diningSelectClass, "mt-1 w-full")}
              value={tableId}
              onChange={(e) => {
                setTableId(e.target.value);
                setManualSelected(true);
              }}
            >
              <option value="">Auto-assign smallest suitable table</option>
              {sortedTables.map((t) => {
                const undersized = isSeatingBased && t.capacity < guestCovers;
                const slotBooked = isTableOverlapped(t.id);
                const disabled = undersized || slotBooked;
                let note = "";
                if (undersized) note = ` [TOO SMALL - NEED ${guestCovers} SEATS]`;
                else if (slotBooked) note = ` [BOOKED FOR THIS TIME SLOT]`;

                return (
                  <option key={t.id} value={t.id} disabled={disabled}>
                    {t.name} ({t.capacity} seats) — {t.status}{note}
                  </option>
                );
              })}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Booking Date</Label>
            <Input
              type="date"
              className="mt-1"
              value={bookingDate}
              onChange={(e) => setBookingDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Start Time</Label>
            <Input
              type="time"
              className="mt-1"
              value={bookingTime}
              onChange={(e) => setBookingTime(e.target.value)}
            />
          </div>
          <div>
            <Label>Duration</Label>
            <Select
              className={cn(diningSelectClass, "mt-1 w-full")}
              value={String(durationMinutes)}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
            >
              <option value="30">30 min</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
              <option value="180">3 hours</option>
              <option value="240">4 hours</option>
            </Select>
          </div>
        </div>

        {isTooSmall ? (
          <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-700">
            ⚠️ Table {picked?.name} has only {picked?.capacity} seats, but {guestCovers} guests were requested. Pick a table with {guestCovers}+ seats.
          </div>
        ) : isOverlapped ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
            ⚠️ Table {picked?.name} is already booked for an overlapping time slot. Select another table or time.
          </div>
        ) : isValidStart && endFormatted ? (
          <div className="rounded-xl border border-[#bfdbfe] bg-[#eff6ff] p-3 text-xs font-semibold text-[#1e40af]">
            📅 Reserved Slot: {bookingDate} @ {bookingTime} → {endFormatted} ({durationMinutes >= 60 ? `${durationMinutes / 60} hour(s)` : `${durationMinutes} mins`})
            {picked ? ` • Assigned Table: ${picked.name} (${picked.capacity} seats)` : " • Auto-assigning smallest suitable table"}
          </div>
        ) : null}
      </div>
    </ModalFrame>
  );
}

function GuestSpecialsModal({
  orderId,
  onClose,
  onSaved,
}: {
  orderId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const order = useQuery({
    queryKey: ["restaurant-order", orderId],
    queryFn: () => restaurantApi.getOrder(orderId),
  });
  const [occasion, setOccasion] = useState("none");
  const [requests, setRequests] = useState<string[]>([]);
  const [note, setNote] = useState("");
  useEffect(() => {
    const s = order.data?.restaurant?.guestSpecials;
    if (!s) return;
    setOccasion(s.occasion ?? "none");
    setRequests(s.requests ?? []);
    setNote(s.note ?? "");
  }, [order.data]);
  const save = useMutation({
    mutationFn: () =>
      restaurantApi.patchGuestSpecials(orderId, {
        occasion,
        requests,
        note: note.trim() || "",
      }),
    onSuccess: () => {
      toast.success("Kitchen will see this request");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggle(code: string) {
    setRequests((cur) =>
      cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code],
    );
  }

  const primary = GUEST_REQUEST_OPTS.slice(0, 3);
  const extra = GUEST_REQUEST_OPTS.slice(3);

  return (
    <ModalFrame
      title="What did they ask for?"
      subtitle="Tap what the guest wants. Kitchen sees this. To charge for water or cake, add it from Add food."
      onClose={onClose}
      className="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button
            type="button"
            disabled={save.isPending || order.isLoading}
            onClick={() => save.mutate()}
          >
            Save for kitchen
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="text-[0.7rem] font-semibold tracking-wide text-[#8b9bb0] uppercase">
            Celebration?
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {GUEST_OCCASION_OPTS.map(([id, label]) => {
              const on = occasion === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setOccasion(id)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left text-sm font-semibold",
                    on
                      ? "border-[#1a56db] bg-[#eff6ff] text-[#1a56db]"
                      : "border-[#e2e8f0] bg-white text-[#0b1f33] hover:border-[#bfdbfe]",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="text-[0.7rem] font-semibold tracking-wide text-[#8b9bb0] uppercase">
            Need at the table
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {primary.map(([id, label, hint]) => {
              const on = requests.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(id)}
                  className={cn(
                    "rounded-xl border px-3 py-3 text-left",
                    on
                      ? "border-[#1a56db] bg-[#eff6ff]"
                      : "border-[#e2e8f0] bg-white hover:border-[#bfdbfe]",
                  )}
                >
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      on ? "text-[#1a56db]" : "text-[#0b1f33]",
                    )}
                  >
                    {label}
                  </p>
                  <p className="mt-0.5 text-[0.7rem] leading-snug text-[#8b9bb0]">
                    {hint}
                  </p>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {extra.map(([id, label]) => {
              const on = requests.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(id)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-semibold ring-1",
                    on
                      ? "bg-[#1a56db] text-white ring-[#1a56db]"
                      : "bg-white text-[#5a6b7d] ring-[#e2e8f0]",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <Label>Anything else? (name on cake, no ice…)</Label>
          <textarea
            className="mt-1.5 min-h-[4rem] w-full rounded-lg border border-[#d9e0ea] px-3 py-2 text-sm text-[#0b1f33] outline-none focus:border-[#1a56db]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional"
          />
        </div>
      </div>
    </ModalFrame>
  );
}

function LayoutModal({
  floor,
  tables,
  floors,
  onFloorChange,
  onClose,
  onSaved,
}: {
  floor: DiningFloor;
  tables: DiningTable[];
  floors: DiningFloor[];
  onFloorChange: (id: string) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>(
    () => {
      const next: Record<string, { x: number; y: number }> = {};
      tables.forEach((t, i) => {
        const slot = layoutSlot(i);
        next[t.id] = {
          x: t.layoutX ?? slot.layoutX,
          y: t.layoutY ?? slot.layoutY,
        };
      });
      return next;
    },
  );
  const drag = useRef<{ id: string } | null>(null);

  function moveTo(clientX: number, clientY: number) {
    if (!drag.current || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const x = clampPct(((clientX - rect.left) / rect.width) * 100);
    const y = clampPct(((clientY - rect.top) / rect.height) * 100);
    const id = drag.current.id;
    setPos((p) => ({ ...p, [id]: { x, y } }));
  }

  const save = useMutation({
    mutationFn: async () => {
      await Promise.all(
        tables.map((t) => {
          const p = pos[t.id];
          if (!p) return Promise.resolve();
          return restaurantApi.updateTable(t.id, {
            layoutX: p.x,
            layoutY: p.y,
          });
        }),
      );
    },
    onSuccess: () => {
      toast.success("Seating layout saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ModalFrame
      title="Custom seating layout"
      subtitle="Drag tables on this floor. Save stores positions for the layout view."
      onClose={onClose}
      className="max-w-3xl"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Select
            className={cn(diningSelectClass, "w-48")}
            value={floor.id}
            onChange={(e) => onFloorChange(e.target.value)}
          >
            {floors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={save.isPending || !tables.length}
              onClick={() => save.mutate()}
            >
              Save layout
            </Button>
          </div>
        </div>
      }
    >
      <div
        ref={wrapRef}
        className="relative h-[26rem] overflow-hidden rounded-xl border border-[#d9e0ea] bg-[#eef3f9]"
        onPointerMove={(e) => moveTo(e.clientX, e.clientY)}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerLeave={() => {
          drag.current = null;
        }}
      >
        {tables.map((t) => {
          const p = pos[t.id] ?? { x: 8, y: 8 };
          const st = FLOOR_TILE[floorStatus(t)] ?? FLOOR_TILE.available;
          return (
            <button
              key={t.id}
              type="button"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              className={cn(
                "absolute w-[14%] min-w-[4.5rem] cursor-grab rounded-lg border-2 px-2 py-2 text-left shadow-sm active:cursor-grabbing",
                st.tile,
              )}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLButtonElement).setPointerCapture(
                  e.pointerId,
                );
                drag.current = { id: t.id };
                moveTo(e.clientX, e.clientY);
              }}
              onPointerMove={(e) => {
                if (drag.current?.id === t.id) moveTo(e.clientX, e.clientY);
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
            >
              <p className={cn("truncate text-xs font-semibold", st.ink)}>
                {t.name}
              </p>
              <p className={cn("text-[0.65rem] opacity-90", st.ink)}>
                {t.capacity} seats
              </p>
            </button>
          );
        })}
        {!tables.length ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-[#8b9bb0]">
            No tables on this floor yet.
          </p>
        ) : null}
      </div>
    </ModalFrame>
  );
}

function VoidModal({
  orderId,
  onClose,
  onDone,
}: {
  orderId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const voidBill = useMutation({
    mutationFn: () => restaurantApi.voidOrder(orderId, reason.trim()),
    onSuccess: () => {
      toast.success("Bill cancelled — KOTs recalled");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ModalFrame
      title="Cancel unpaid bill"
      subtitle="Kitchen tickets on this order will be recalled."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={reason.trim().length < 3 || voidBill.isPending}
            onClick={() => voidBill.mutate()}
          >
            Cancel bill
          </Button>
        </div>
      }
    >
      <Label>Reason</Label>
      <Input
        className="mt-1"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="At least 3 characters"
      />
    </ModalFrame>
  );
}
