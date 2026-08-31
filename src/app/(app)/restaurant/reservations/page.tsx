"use client";

import { useState, useEffect } from "react";
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
import { Select } from "@/components/ui/select";

function parseReservationDuration(notes?: string | null): number {
  if (!notes) return 60;
  const match = notes.match(/\[Duration:\s*(\d+)m\]/);
  return match ? parseInt(match[1], 10) : 60;
}

export default function ReservationsPage() {
  const qc = useQueryClient();
  const { hasCapability, data: boot } = useBootstrap();
  const locationId =
    useBranchStore((s) => s.currentLocationId) || boot?.locations?.[0]?.id;
  const allowed = hasCapability("DINING_RESERVATION") || hasCapability("TABLE");
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

  const [guestName, setGuestName] = useState("");
  const [covers, setCovers] = useState("2");
  const [bookingDate, setBookingDate] = useState(todayYmd);
  const [bookingTime, setBookingTime] = useState(nowHhMm);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [tableId, setTableId] = useState("");
  const [manualSelected, setManualSelected] = useState(false);

  const startDateTime = new Date(`${bookingDate}T${bookingTime}:00`);
  const isValidStart = !Number.isNaN(startDateTime.getTime());
  const endDateTime = isValidStart
    ? new Date(startDateTime.getTime() + durationMinutes * 60 * 1000)
    : null;
  const endFormatted = endDateTime
    ? endDateTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["dining-reservations"] });
    void qc.invalidateQueries({ queryKey: ["restaurant-tables"] });
  };

  const rows = useQuery({
    queryKey: ["dining-reservations", locationId],
    queryFn: () => restaurantApi.reservations(locationId),
    enabled: allowed,
    refetchInterval: 30_000,
  });
  const cfg = useQuery({
    queryKey: ["restaurant-config"],
    queryFn: () => restaurantApi.config(),
    enabled: allowed,
  });
  const tables = useQuery({
    queryKey: ["restaurant-tables", locationId],
    queryFn: () => restaurantApi.tables(locationId),
    enabled: allowed,
    refetchInterval: 30_000,
  });

  const isSeatingBased = Boolean((cfg.data as Record<string, unknown>)?.seatingBasedReservation);
  const guestCovers = Math.max(1, Number(covers) || 1);
  const sortedTables = [...(tables.data ?? [])].sort((a, b) => a.capacity - b.capacity);

  useEffect(() => {
    if (!isSeatingBased || manualSelected) return;
    const suitableAvailable = [...(tables.data ?? [])]
      .filter((t) => t.capacity >= guestCovers && !isTableOverlapped(t.id) && t.status !== "blocked")
      .sort((a, b) => a.capacity - b.capacity);

    if (suitableAvailable.length > 0) {
      if (tableId !== suitableAvailable[0].id) {
        setTableId(suitableAvailable[0].id);
      }
    } else {
      setTableId("");
    }
  }, [isSeatingBased, guestCovers, bookingDate, bookingTime, durationMinutes, tables.data, manualSelected, isValidStart]);

  const isTableOverlapped = (tid: string) => {
    if (!isValidStart) return false;
    const startMs = startDateTime.getTime();
    const endMs = endDateTime ? endDateTime.getTime() : startMs + durationMinutes * 60 * 1000;
    return (rows.data ?? []).some((r) => {
      if (r.table?.id !== tid || r.status === "cancelled" || r.status === "completed") return false;
      const rStart = new Date(r.startAt).getTime();
      const rDuration = parseReservationDuration(r.notes);
      const rEnd = rStart + rDuration * 60 * 1000;
      return startMs < rEnd && endMs > rStart;
    });
  };
  const create = useMutation({
    mutationFn: () =>
      restaurantApi.createReservation({
        locationId: locationId!,
        guestName,
        covers: Number(covers) || 2,
        startAt: startDateTime.toISOString(),
        durationMinutes,
        tableId: tableId || undefined,
      }),
    onSuccess: () => {
      setGuestName("");
      refresh();
      toast.success("Reservation booked");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const patch = useMutation({
    mutationFn: (opts: { id: string; status: string }) =>
      restaurantApi.updateReservation(opts.id, { status: opts.status }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  const list = rows.data ?? [];

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

  return (
    <DiningShell
      title="Reservations"
      subtitle="Book a table. Seating does not deduct inventory."
    >
      <DiningPanel title="New booking">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <Label>Guest</Label>
            <Input
              className="mt-1"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Guest Name"
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
            <Label>Date</Label>
            <Input
              className="mt-1"
              type="date"
              value={bookingDate}
              onChange={(e) => setBookingDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Start Time</Label>
            <Input
              className="mt-1"
              type="time"
              value={bookingTime}
              onChange={(e) => setBookingTime(e.target.value)}
            />
          </div>
          <div>
            <Label>Duration</Label>
            <Select
              className={`${diningSelectClass} mt-1`}
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
          <div>
            <Label>Table</Label>
            <Select
              className={`${diningSelectClass} mt-1`}
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
            >
              <option value="">Any</option>
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
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs font-semibold text-[#1e40af]">
            Booking Slot: {bookingDate} @ {bookingTime} → {endFormatted || "..."} ({durationMinutes >= 60 ? `${durationMinutes / 60}h` : `${durationMinutes}m`})
          </p>
          <Button
            disabled={!guestName || !isValidStart || !locationId || create.isPending}
            onClick={() => create.mutate()}
          >
            Book Slot
          </Button>
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
                      {r.status === "seated" ? (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            patch.mutate({ id: r.id, status: "completed" })
                          }
                        >
                          Free table
                        </Button>
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
