"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { restaurantApi } from "@/lib/api";
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
      toast.success("Kitchen station saved");
      void qc.invalidateQueries({ queryKey: ["restaurant-stations"] });
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
                hint="Parked order — no stock until bill"
                checked={data.qrOrdering}
                onChange={(v) => save.mutate({ qrOrdering: v })}
              />
              <DiningToggle
                label="Recipes / BOM"
                hint="Ingredients consume at checkout"
                checked={data.recipesEnabled}
                onChange={(v) => save.mutate({ recipesEnabled: v })}
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
            hint="Same code can be saved again — it updates the existing station."
          >
            <div className="flex flex-wrap gap-2">
              <Input
                className="min-w-[10rem] flex-1"
                value={stationName}
                onChange={(e) => setStationName(e.target.value)}
                placeholder="Hot kitchen"
              />
              <Input
                className="w-32"
                value={stationCode}
                onChange={(e) => setStationCode(e.target.value)}
                placeholder="hot"
              />
              <Button
                type="button"
                disabled={!stationName.trim() || !stationCode.trim()}
                onClick={() => addStation.mutate()}
              >
                Save station
              </Button>
            </div>
            {(stations.data ?? []).length ? (
              <table className="mt-4 w-full text-left text-sm">
                <thead className="text-[0.68rem] uppercase tracking-wide text-[#8b9bb0]">
                  <tr>
                    <th className="pb-2 font-semibold">Name</th>
                    <th className="pb-2 font-semibold">Code</th>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-3 text-sm text-[#5a6b7d]">
                No stations yet. Add Main kitchen to route KOTs.
              </p>
            )}
          </DiningPanel>
        </>
      )}
    </DiningShell>
  );
}
