"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { restaurantApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { useBranchStore } from "@/lib/branch-store";
import { PageHeader } from "@/components/page-header";
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
      <div className="p-6 text-sm text-[#5a6b7d]">
        Enable Dining reservations in Capabilities.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Reservations"
        subtitle="Book a table. Seating does not deduct inventory."
      />
      <section className="grid gap-3 rounded-xl border border-[#e2e8f0] bg-white p-4 sm:grid-cols-5">
        <div>
          <Label>Guest</Label>
          <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} />
        </div>
        <div>
          <Label>Covers</Label>
          <Input value={covers} onChange={(e) => setCovers(e.target.value)} />
        </div>
        <div>
          <Label>When</Label>
          <Input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
          />
        </div>
        <div>
          <Label>Table</Label>
          <select
            className="mt-1 h-9 w-full rounded-md border border-[#d9e0ea] px-2 text-sm"
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
      </section>
      <table className="w-full text-left text-sm">
        <thead className="bg-[#f7f9fc] text-[0.68rem] uppercase text-[#8b9bb0]">
          <tr>
            <th className="px-3 py-2">When</th>
            <th className="px-3 py-2">Guest</th>
            <th className="px-3 py-2">Table</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {(rows.data ?? []).map((r) => (
            <tr key={r.id} className="border-t border-[#eef1f4]">
              <td className="px-3 py-2">{new Date(r.startAt).toLocaleString()}</td>
              <td className="px-3 py-2">
                {r.guestName} · {r.covers}
              </td>
              <td className="px-3 py-2">{r.table?.name ?? "—"}</td>
              <td className="px-3 py-2">{r.status}</td>
              <td className="px-3 py-2 space-x-2">
                {r.status === "booked" ? (
                  <Button
                    variant="secondary"
                    onClick={() => patch.mutate({ id: r.id, status: "seated" })}
                  >
                    Seat
                  </Button>
                ) : null}
                {r.status === "booked" ? (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      patch.mutate({ id: r.id, status: "cancelled" })
                    }
                  >
                    Cancel
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
