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
  DiningStatusBadge,
  diningSelectClass,
} from "@/components/dining-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { LayoutGrid, Map as MapIcon, Pencil } from "lucide-react";
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

export default function RestaurantTablesPage() {
  const qc = useQueryClient();
  const { hasCapability, data: boot } = useBootstrap();
  const locationId =
    useBranchStore((s) => s.currentLocationId) || boot?.locations?.[0]?.id;
  const allowed = hasCapability("TABLE") || hasCapability("CAPTAIN");
  const canReserve =
    hasCapability("DINING_RESERVATION") || hasCapability("TABLE");

  const [floorFilter, setFloorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "layout">("grid");
  const [modal, setModal] = useState<Modal | null>(null);

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
  };

  const allTables = tables.data ?? [];
  const allFloors = floors.data ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allTables.length };
    for (const t of allTables) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [allTables]);

  const grouped = useMemo(() => {
    const list = allTables.filter((t) => {
      if (floorFilter !== "all" && (t.floorId || "unassigned") !== floorFilter)
        return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      return true;
    });
    const map = new Map<string, typeof list>();
    for (const t of list) {
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
  }, [allTables, allFloors, floorFilter, statusFilter]);

  function onTableActivate(t: DiningTable) {
    if (t.currentOrderId) {
      setModal({ kind: "order", orderId: t.currentOrderId });
      return;
    }
    if (t.status === "blocked") {
      setModal({ kind: "table", id: t.id });
      return;
    }
    setModal({ kind: "open", tableId: t.id });
  }

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
      subtitle="Tap a table to seat guests, take a request, or send food to kitchen."
      action={
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setModal({ kind: "floor" })}
          >
            New floor
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setModal({
                kind: "table",
                floorId: floorFilter !== "all" ? floorFilter : undefined,
              })
            }
          >
            + New table
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const floorId =
                floorFilter !== "all"
                  ? floorFilter
                  : allFloors[0]?.id;
              if (!floorId) {
                toast.error("Add a floor first");
                return;
              }
              setModal({ kind: "layout", floorId });
            }}
          >
            Seating layout
          </Button>
          {canReserve ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModal({ kind: "reserve" })}
            >
              Reserve
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            onClick={() => setModal({ kind: "move" })}
          >
            Move / merge
          </Button>
          <Button asChild variant="secondary">
            <Link href="/restaurant/setup">Setup</Link>
          </Button>
        </div>
      }
    >
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
        {allFloors.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFloorFilter(f.id)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold ring-1",
              floorFilter === f.id
                ? "bg-[#eff6ff] text-[#1a56db] ring-[#bfdbfe]"
                : "bg-white text-[#5a6b7d] ring-[#e2e8f0]",
            )}
          >
            {f.name}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-[#e2e8f0]" />
        <button
          type="button"
          onClick={() => setViewMode("grid")}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ring-1",
            viewMode === "grid"
              ? "bg-[#1a56db] text-white ring-[#1a56db]"
              : "bg-white text-[#5a6b7d] ring-[#e2e8f0]",
          )}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Grid
        </button>
        <button
          type="button"
          onClick={() => setViewMode("layout")}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ring-1",
            viewMode === "layout"
              ? "bg-[#1a56db] text-white ring-[#1a56db]"
              : "bg-white text-[#5a6b7d] ring-[#e2e8f0]",
          )}
        >
          <MapIcon className="h-3.5 w-3.5" />
          Layout
        </button>
      </div>

      {!allTables.length ? (
        <DiningEmpty
          title="No tables yet"
          detail="Use New floor and New table. Then tap a table to open a dining ticket."
        />
      ) : (
        grouped.map(([floorKey, list]) => {
          const floor = allFloors.find((f) => f.id === floorKey);
          const title = floor?.name ?? "Unassigned";
          const bits = [
            floor?.categoryIds?.length
              ? `${floor.categoryIds.length} menu ${floor.categoryIds.length === 1 ? "category" : "categories"}`
              : null,
            floor?.taxRatePercent != null
              ? `Tax ${floor.taxRatePercent}%`
              : null,
            floor?.serviceChargePercent != null
              ? `Service ${floor.serviceChargePercent}%`
              : null,
          ].filter(Boolean);
          return (
            <section key={floorKey}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-[#0b1f33]">
                    {title}
                  </h2>
                  {bits.length ? (
                    <p className="text-[0.7rem] text-[#8b9bb0]">
                      {bits.join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-[#8b9bb0]">{list.length} tables</p>
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
              </div>
              {viewMode === "layout" ? (
                <FloorLayoutPreview
                  tables={list}
                  onActivate={onTableActivate}
                  onEdit={(t) => setModal({ kind: "table", id: t.id })}
                />
              ) : (
                <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {list.map((t) => (
                    <li key={t.id} className="relative group">
                      <button
                        type="button"
                        onClick={() => onTableActivate(t)}
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
                            <p className="text-[0.7rem] font-semibold text-[#1a56db]">
                              Open bill
                            </p>
                          ) : t.status === "reserved" ? (
                            <p className="text-[0.7rem] text-[#9a3412]">
                              Seat guest
                            </p>
                          ) : t.status === "available" ? (
                            <p className="text-[0.7rem] text-[#8b9bb0]">
                              Seat guests
                            </p>
                          ) : (
                            <p className="text-[0.7rem] text-[#8b9bb0]">
                              {t.status}
                            </p>
                          )}
                          {t.guestOccasion ? (
                            <p className="truncate text-[0.65rem] font-semibold capitalize text-[#1a56db]">
                              {t.guestOccasion}
                            </p>
                          ) : null}
                          {t.guestName ? (
                            <p className="truncate text-xs text-[#0b1f33]">
                              {t.guestName}
                            </p>
                          ) : null}
                          {(() => {
                            const next = nextBookedFor(
                              reservations.data ?? [],
                              t.id,
                            );
                            return next ? (
                              <p className="truncate text-[0.65rem] text-[#9a3412]">
                                Next: {next.guestName} · {bookingWhen(next.startAt)}
                              </p>
                            ) : null;
                          })()}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setModal({ kind: "table", id: t.id });
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

function FloorLayoutPreview({
  tables,
  onActivate,
  onEdit,
}: {
  tables: DiningTable[];
  onActivate: (t: DiningTable) => void;
  onEdit: (t: DiningTable) => void;
}) {
  return (
    <div className="relative h-[22rem] overflow-hidden rounded-xl border border-[#d9e0ea] bg-[#f4f7fb]">
      {tables.map((t, i) => {
        const slot = layoutSlot(i);
        const x = t.layoutX ?? slot.layoutX;
        const y = t.layoutY ?? slot.layoutY;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onActivate(t)}
            onContextMenu={(e) => {
              e.preventDefault();
              onEdit(t);
            }}
            style={{ left: `${x}%`, top: `${y}%` }}
            className={cn(
              "absolute w-[14%] min-w-[4.5rem] rounded-lg border px-2 py-2 text-left shadow-sm",
              TILE[t.status] ?? TILE.available,
            )}
          >
            <p className="truncate text-xs font-semibold text-[#0b1f33]">
              {t.name}
            </p>
            <p className="text-[0.65rem] text-[#5a6b7d]">
              {t.capacity} · {t.status}
            </p>
          </button>
        );
      })}
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
              {TABLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
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
            {fromTable && onBookNext ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onBookNext(fromTable.id)}
              >
                Book this table for later
              </Button>
            ) : null}
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
            {tables.map((t) => (
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
  onClose,
  onSaved,
}: {
  tables: DiningTable[];
  locationId: string;
  defaultTableId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [guestName, setGuestName] = useState("");
  const [covers, setCovers] = useState("2");
  const [startAt, setStartAt] = useState(() => localDateTimeIn(90));
  const [tableId, setTableId] = useState(defaultTableId ?? "");
  const [guestPhone, setGuestPhone] = useState("");
  const picked = tables.find((t) => t.id === tableId);
  const save = useMutation({
    mutationFn: () =>
      restaurantApi.createReservation({
        locationId,
        guestName,
        guestPhone: guestPhone.trim() || undefined,
        covers: Number(covers) || 2,
        startAt: new Date(startAt).toISOString(),
        tableId: tableId || undefined,
      }),
    onSuccess: () => {
      toast.success("Reservation booked");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ModalFrame
      title={picked?.status === "occupied" ? "Book next on this table" : "Reserve a table"}
      subtitle={
        picked?.status === "occupied"
          ? `${picked.name} is occupied now. This books a later slot — current guests stay until billed.`
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
              !guestName.trim() || !startAt || save.isPending
            }
            onClick={() => save.mutate()}
          >
            Book
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <div>
          <Label>Guest</Label>
          <Input
            className="mt-1"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
          />
        </div>
        <div>
          <Label>Phone</Label>
          <Input
            className="mt-1"
            value={guestPhone}
            onChange={(e) => setGuestPhone(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Covers</Label>
            <Input
              className="mt-1"
              value={covers}
              onChange={(e) => setCovers(e.target.value)}
            />
          </div>
          <div>
            <Label>When</Label>
            <Input
              className="mt-1"
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label>Table</Label>
          <Select
            className={cn(diningSelectClass, "mt-1 w-full")}
            value={tableId}
            onChange={(e) => setTableId(e.target.value)}
          >
            <option value="">Any</option>
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
          return (
            <button
              key={t.id}
              type="button"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              className={cn(
                "absolute w-[14%] min-w-[4.5rem] cursor-grab rounded-lg border px-2 py-2 text-left shadow-sm active:cursor-grabbing",
                TILE[t.status] ?? TILE.available,
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
              <p className="truncate text-xs font-semibold text-[#0b1f33]">
                {t.name}
              </p>
              <p className="text-[0.65rem] text-[#5a6b7d]">
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
