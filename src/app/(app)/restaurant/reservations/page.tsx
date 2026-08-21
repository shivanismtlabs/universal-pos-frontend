"use client";

import { useState } from "react";
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

export default function ReservationsPage() {
  const qc = useQueryClient();
  const { hasCapability, data: boot } = useBootstrap();
  const locationId =
    useBranchStore((s) => s.currentLocationId) || boot?.locations?.[0]?.id;
  const allowed = hasCapability("DINING_RESERVATION") || hasCapability("TABLE");
  const [guestName, setGuestName] = useState("");
  const [covers, setCovers] = useState("2");
  const [startAt, setStartAt] = useState("");
  const [tableId, setTableId] = useState("");

  const rows = useQuery({
    queryKey: ["dining-reservations", locationId],
    queryFn: () => restaurantApi.reservations(locationId),
    enabled: allowed,
  });
  const tables = useQuery({
    queryKey: ["restaurant-tables", locationId],
    queryFn: () => restaurantApi.tables(locationId),
    enabled: allowed,
  });
  const create = useMutation({
    mutationFn: () =>
      restaurantApi.createReservation({
        locationId: locationId!,
        guestName,
        covers: Number(covers) || 2,
        startAt: new Date(startAt).toISOString(),
        tableId: tableId || undefined,
      }),
    onSuccess: () => {
      setGuestName("");
      void qc.invalidateQueries({ queryKey: ["dining-reservations"] });
      toast.success("Reservation booked");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const patch = useMutation({
    mutationFn: (opts: { id: string; status: string }) =>
      restaurantApi.updateReservation(opts.id, { status: opts.status }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["dining-reservations"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!allowed) {
    return (
      <DiningShell
        title="Reservations"
        subtitle="Enable Dining reservations in Capabilities."
      >
        <DiningEmpty title="Reservations are off for this shop" />
      </DiningShell>
    );
  }

  const list = rows.data ?? [];

  return (
    <DiningShell
      title="Reservations"
      subtitle="Book a table. Seating does not deduct inventory."
    >
      <DiningPanel title="New booking">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label>Guest</Label>
            <Input
              className="mt-1"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
            />
          </div>
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
          <div>
            <Label>Table</Label>
            <select
              className={`${diningSelectClass} mt-1`}
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
            >
              <option value="">Any</option>
              {(tables.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button
              disabled={!guestName || !startAt || !locationId || create.isPending}
              onClick={() => create.mutate()}
            >
              Book
            </Button>
          </div>
        </div>
      </DiningPanel>

      <DiningPanel title="Bookings">
        {!list.length ? (
          <DiningEmpty
            title="No reservations"
            detail="Book a guest with a time. Optional table can be assigned later."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[0.68rem] uppercase tracking-wide text-[#8b9bb0]">
                <tr>
                  <th className="pb-2 font-semibold">When</th>
                  <th className="pb-2 font-semibold">Guest</th>
                  <th className="pb-2 font-semibold">Table</th>
                  <th className="pb-2 font-semibold">Status</th>
                  <th className="pb-2 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef1f4]">
                {list.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 text-[#334155]">
                      {new Date(r.startAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 font-medium text-[#0b1f33]">
                      {r.guestName}
                      <span className="ml-1 text-xs font-normal text-[#8b9bb0]">
                        · {r.covers}
                      </span>
                    </td>
                    <td className="py-2.5 text-[#5a6b7d]">
                      {r.table?.name ?? "—"}
                    </td>
                    <td className="py-2.5">
                      <DiningStatusBadge value={r.status} />
                    </td>
                    <td className="py-2.5 text-right">
                      {r.status === "booked" ? (
                        <span className="inline-flex gap-2">
                          <Button
                            variant="secondary"
                            onClick={() =>
                              patch.mutate({ id: r.id, status: "seated" })
                            }
                          >
                            Seat
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              patch.mutate({ id: r.id, status: "cancelled" })
                            }
                          >
                            Cancel
                          </Button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DiningPanel>
    </DiningShell>
  );
}
