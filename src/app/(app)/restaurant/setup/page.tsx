"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { posApi, restaurantApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import {
  DiningEmpty,
  DiningPanel,
  DiningShell,
  DiningToggle,
} from "@/components/dining-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ModalFrame } from "@/components/modal-frame";

const MODES = [
  { id: "dine_in", label: "Dine-in" },
  { id: "takeaway", label: "Takeaway" },
  { id: "delivery", label: "Delivery" },
  { id: "pickup", label: "Pickup" },
  { id: "online", label: "Online" },
] as const;

export default function RestaurantSetupPage() {
  const qc = useQueryClient();
  const { hasCapability } = useBootstrap();
  const allowed = hasCapability("TABLE") || hasCapability("KOT");
  const cfg = useQuery({
    queryKey: ["restaurant-config"],
    queryFn: () => restaurantApi.config(),
    enabled: allowed,
  });
  const stations = useQuery({
    queryKey: ["restaurant-stations"],
    queryFn: () => restaurantApi.stations(),
    enabled: allowed,
  });
  const categories = useQuery({
    queryKey: ["pos-sale-categories"],
    queryFn: () => posApi.listSaleCategories(),
    enabled: allowed,
  });
  const [stationModal, setStationModal] = useState<string | "new" | null>(null);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      restaurantApi.saveConfig(body),
    onSuccess: () => {
      toast.success("Dining settings saved");
      void qc.invalidateQueries({ queryKey: ["restaurant-config"] });
      void qc.refetchQueries({ queryKey: ["restaurant-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = cfg.data;
  if (!allowed) {
    return (
      <DiningShell title="Setup" subtitle="Enable Tables or KOT first.">
        <DiningEmpty title="Dining setup is locked" />
      </DiningShell>
    );
  }

  function toggleMode(id: string) {
    if (!data) return;
    const set = new Set(data.enabledDiningModes);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    save.mutate({ enabledDiningModes: [...set] });
  }

  return (
    <DiningShell
      title="Setup"
      subtitle="Dining modes, kitchen stations, and consumption. KOT never writes stock."
    >
      {!data ? (
        <p className="text-sm text-[#5a6b7d]">Loading…</p>
      ) : (
        <>
          <DiningPanel
            title="Dining modes"
            hint="Guests and staff can only open tickets in the modes you turn on."
          >
            <div className="flex flex-wrap gap-2">
              {MODES.map((m) => {
                const on = data.enabledDiningModes.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMode(m.id)}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 transition",
                      on
                        ? "bg-[#1a56db] text-white ring-[#1a56db]"
                        : "bg-white text-[#5a6b7d] ring-[#e2e8f0] hover:text-[#0b1f33]",
                    )}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </DiningPanel>

          <DiningPanel
            title="Inventory consumption"
            hint="Same catalog and stock engine as every other shop."
          >
            <p className="text-sm text-[#334155]">{data.inventoryNote}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[#8b9bb0]">
              Policy: {data.consumptionPolicy.replaceAll("_", " ")}
            </p>
          </DiningPanel>

          <DiningPanel
            title="Ticket charges"
            hint="Added on Counter for dining tickets. Retail shops never see these."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Service % (dine-in)</Label>
                <Input
                  className="mt-1"
                  inputMode="decimal"
                  defaultValue={
                    data.serviceChargePercent != null
                      ? String(data.serviceChargePercent)
                      : ""
                  }
                  placeholder="e.g. 10"
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    save.mutate({
                      serviceChargePercent:
                        Number.isFinite(n) && n >= 0 ? n : 0,
                    });
                  }}
                />
              </div>
              <div>
                <Label>Packaging (takeaway / delivery)</Label>
                <Input
                  className="mt-1"
                  inputMode="decimal"
                  defaultValue={
                    data.packagingCharge != null
                      ? String(data.packagingCharge)
                      : ""
                  }
                  placeholder="0"
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    save.mutate({
                      packagingCharge: Number.isFinite(n) && n >= 0 ? n : 0,
                    });
                  }}
                />
              </div>
              <div>
                <Label>Delivery charge</Label>
                <Input
                  className="mt-1"
                  inputMode="decimal"
                  defaultValue={
                    data.deliveryCharge != null
                      ? String(data.deliveryCharge)
                      : ""
                  }
                  placeholder="0"
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    save.mutate({
                      deliveryCharge: Number.isFinite(n) && n >= 0 ? n : 0,
                    });
                  }}
                />
              </div>
            </div>
          </DiningPanel>

          <DiningPanel title="Kitchen & ordering">
            <div className="grid gap-2 sm:grid-cols-2">
              <DiningToggle
                label="Kitchen display (KDS)"
                hint="New / Preparing / Ready columns"
                checked={data.kdsEnabled}
                onChange={(v) => save.mutate({ kdsEnabled: v })}
              />
              <DiningToggle
                label="Captain ordering"
                hint="Floor staff can open tables"
                checked={data.captainOrdering}
                onChange={(v) => save.mutate({ captainOrdering: v })}
              />
              <DiningToggle
                label="QR guest order"
                hint="Guests scan a table QR, order, kitchen sees it. Pay at counter. Print codes from Dining → QR menu."
                checked={data.qrOrdering}
                onChange={(v) => save.mutate({ qrOrdering: v })}
              />
              <DiningToggle
                label="Recipes / BOM"
                hint="Ingredients consume at checkout"
                checked={data.recipesEnabled}
                onChange={(v) => save.mutate({ recipesEnabled: v })}
              />
              <DiningToggle
                label="Seating-based reservation"
                hint="Matches guest count with table capacity, preferring the smallest suitable table automatically while allowing manual selection of any table with equal or greater capacity."
                checked={Boolean((data as Record<string, unknown>).seatingBasedReservation)}
                onChange={(v) => save.mutate({ seatingBasedReservation: v })}
              />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Prep warning (minutes)</Label>
                <Input
                  className="mt-1"
                  defaultValue={String(data.prepWarnMinutes)}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n > 0) {
                      save.mutate({ prepWarnMinutes: n });
                    }
                  }}
                />
              </div>
              <div>
                <Label>Prep critical (minutes)</Label>
                <Input
                  className="mt-1"
                  defaultValue={String(data.prepCriticalMinutes)}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n > 0) {
                      save.mutate({ prepCriticalMinutes: n });
                    }
                  }}
                />
              </div>
            </div>
          </DiningPanel>

          <DiningPanel
            title="Kitchen stations"
            hint="Route item categories to a station and name the kitchen printer. Thermal hardware is not wired yet — reprint still uses the browser print dialog."
            action={
              <Button type="button" onClick={() => setStationModal("new")}>
                New station
              </Button>
            }
          >
            {(stations.data ?? []).length ? (
              <table className="w-full text-left text-sm">
                <thead className="text-[0.68rem] uppercase tracking-wide text-[#8b9bb0]">
                  <tr>
                    <th className="pb-2 font-semibold">Name</th>
                    <th className="pb-2 font-semibold">Code</th>
                    <th className="pb-2 font-semibold">Printer</th>
                    <th className="pb-2 font-semibold">Menu</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef1f4]">
                  {(stations.data ?? []).map((s) => (
                    <tr key={s.id}>
                      <td className="py-2 font-medium text-[#0b1f33]">
                        {s.name}
                      </td>
                      <td className="py-2 font-mono text-xs text-[#5a6b7d]">
                        {s.code}
                      </td>
                      <td className="py-2 text-[#5a6b7d]">
                        {s.printerName ?? "Browser print"}
                      </td>
                      <td className="py-2 text-[#5a6b7d]">
                        {s.categoryIds?.length
                          ? `${s.categoryIds.length} ${s.categoryIds.length === 1 ? "category" : "categories"}`
                          : "All items"}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          className="text-xs font-semibold text-[#1a56db]"
                          onClick={() => setStationModal(s.id)}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-[#5a6b7d]">
                No stations yet. Add Hot kitchen / Bar so Send KOT can split tickets.
              </p>
            )}
          </DiningPanel>
        </>
      )}

      {stationModal ? (
        <StationModal
          station={
            stationModal === "new"
              ? null
              : (stations.data ?? []).find((s) => s.id === stationModal) ?? null
          }
          categories={categories.data ?? []}
          onClose={() => setStationModal(null)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["restaurant-stations"] });
            setStationModal(null);
          }}
        />
      ) : null}
    </DiningShell>
  );
}

function StationModal({
  station,
  categories,
  onClose,
  onSaved,
}: {
  station: {
    id: string;
    name: string;
    code: string;
    categoryIds?: string[];
    printerName?: string | null;
  } | null;
  categories: Array<{ id: string; name: string; productCount: number }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(station?.name ?? "Hot kitchen");
  const [code, setCode] = useState(station?.code ?? "hot");
  const [printerName, setPrinterName] = useState(station?.printerName ?? "");
  const [categoryIds, setCategoryIds] = useState<string[]>(
    station?.categoryIds ?? [],
  );
  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: name.trim(),
        categoryIds,
        printerName: printerName.trim() || null,
      };
      if (station) {
        await restaurantApi.updateStation(station.id, body);
        return;
      }
      const created = await restaurantApi.createStation({
        name: name.trim(),
        code: code.trim(),
        categoryIds,
        printerName: printerName.trim() || undefined,
      });
      return created;
    },
    onSuccess: () => {
      toast.success(station ? "Station updated" : "Station added");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ModalFrame
      title={station ? "Edit kitchen station" : "New kitchen station"}
      subtitle="Items in the selected categories print as a separate KOT for this station."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!name.trim() || (!station && !code.trim()) || save.isPending}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <div>
          <Label>Name</Label>
          <Input
            className="mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {!station ? (
          <div>
            <Label>Code</Label>
            <Input
              className="mt-1"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
        ) : null}
        <div>
          <Label>Kitchen printer</Label>
          <Input
            className="mt-1"
            placeholder="e.g. Grill-1 (label only until hardware pack)"
            value={printerName}
            onChange={(e) => setPrinterName(e.target.value)}
          />
        </div>
        <div>
          <Label>Item categories to cook here</Label>
          <p className="mt-0.5 text-xs text-[#8b9bb0]">
            Empty = this station can receive any unrouted items.
          </p>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-[#e2e8f0] p-2">
            {categories.length ? (
              categories.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-[#f8fafc]"
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
                </label>
              ))
            ) : (
              <p className="px-1 py-2 text-sm text-[#8b9bb0]">
                No item categories yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}
