"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { restaurantApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [stationName, setStationName] = useState("Main kitchen");
  const [stationCode, setStationCode] = useState("main");

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      restaurantApi.saveConfig(body),
    onSuccess: () => {
      toast.success("Dining settings saved");
      void qc.invalidateQueries({ queryKey: ["restaurant-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const addStation = useMutation({
    mutationFn: () =>
      restaurantApi.createStation({
        name: stationName.trim(),
        code: stationCode.trim(),
      }),
    onSuccess: () => {
      toast.success("Kitchen station added");
      void qc.invalidateQueries({ queryKey: ["restaurant-stations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = cfg.data;
  if (!allowed) {
    return (
      <div className="p-6 text-sm text-[#5a6b7d]">
        Enable Tables or KOT capabilities first.
      </div>
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
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Dining pack"
        title="Restaurant setup"
        subtitle="Optional dining modes and kitchen stations. Consumption policy defaults to checkout — KOT never writes stock."
      />

      {!data ? (
        <p className="text-sm text-[#5a6b7d]">Loading…</p>
      ) : (
        <>
          <section className="rounded-xl border border-[#e2e8f0] bg-white p-4">
            <h2 className="text-sm font-semibold text-[#0b1f33]">Dining modes</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {MODES.map((m) => {
                const on = data.enabledDiningModes.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMode(m.id)}
                    className={
                      on
                        ? "rounded-lg border border-[#1a56db] bg-[#eff6ff] px-3 py-1.5 text-sm font-semibold text-[#1a56db]"
                        : "rounded-lg border border-[#e2e8f0] px-3 py-1.5 text-sm text-[#5a6b7d]"
                    }
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-[#e2e8f0] bg-white p-4">
            <h2 className="text-sm font-semibold text-[#0b1f33]">
              Inventory consumption
            </h2>
            <p className="mt-1 text-sm text-[#5a6b7d]">{data.inventoryNote}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[#8b9bb0]">
              Policy: {data.consumptionPolicy}
            </p>
          </section>

          <section className="grid gap-3 rounded-xl border border-[#e2e8f0] bg-white p-4 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-3 text-sm">
              KDS
              <input
                type="checkbox"
                checked={data.kdsEnabled}
                onChange={(e) => save.mutate({ kdsEnabled: e.target.checked })}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              Captain ordering
              <input
                type="checkbox"
                checked={data.captainOrdering}
                onChange={(e) =>
                  save.mutate({ captainOrdering: e.target.checked })
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              QR ordering (Phase 3)
              <input
                type="checkbox"
                checked={data.qrOrdering}
                onChange={(e) => save.mutate({ qrOrdering: e.target.checked })}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              Recipes (Phase 2)
              <input
                type="checkbox"
                checked={data.recipesEnabled}
                onChange={(e) =>
                  save.mutate({ recipesEnabled: e.target.checked })
                }
              />
            </label>
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
          </section>

          <section className="rounded-xl border border-[#e2e8f0] bg-white p-4">
            <h2 className="text-sm font-semibold text-[#0b1f33]">
              Kitchen stations
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Input
                value={stationName}
                onChange={(e) => setStationName(e.target.value)}
                placeholder="Pizza"
              />
              <Input
                className="w-32"
                value={stationCode}
                onChange={(e) => setStationCode(e.target.value)}
                placeholder="pizza"
              />
              <Button
                type="button"
                disabled={!stationName.trim() || !stationCode.trim()}
                onClick={() => addStation.mutate()}
              >
                Add station
              </Button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
