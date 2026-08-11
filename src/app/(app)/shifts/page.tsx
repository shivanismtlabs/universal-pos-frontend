"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { iamApi, usersApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";

export default function ShiftsPage() {
  const qc = useQueryClient();
  const shiftsQ = useQuery({
    queryKey: ["shifts"],
    queryFn: () => iamApi.listShifts(),
  });
  const usersQ = useQuery({
    queryKey: ["users"],
    queryFn: () => usersApi.list(),
  });
  const assignQ = useQuery({
    queryKey: ["shift-assignments"],
    queryFn: () => iamApi.listAssignments(),
  });

  const [name, setName] = useState("Morning");
  const [startTime, setStart] = useState("09:00");
  const [endTime, setEnd] = useState("17:00");
  const [userId, setUserId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [workDate, setWorkDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );

  const create = useMutation({
    mutationFn: () => iamApi.createShift({ name, startTime, endTime }),
    onSuccess: () => {
      toast.success("Shift created");
      void qc.invalidateQueries({ queryKey: ["shifts"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const assign = useMutation({
    mutationFn: () =>
      iamApi.assignShift({ shiftId, userId, workDate }),
    onSuccess: () => {
      toast.success("Assigned");
      void qc.invalidateQueries({ queryKey: ["shift-assignments"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => iamApi.removeAssignment(id),
    onSuccess: () => {
      toast.success("Removed");
      void qc.invalidateQueries({ queryKey: ["shift-assignments"] });
    },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Shift management"
        subtitle="Define work shifts and assign staff to calendar days (roster)."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-[#e5e7eb] bg-white p-5">
          <h2 className="text-base font-semibold text-[#111827]">
            Shift templates
          </h2>
          <div className="mt-3 space-y-2">
            <div>
              <Label>Name</Label>
              <Input
                className="mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Start (HH:mm)</Label>
                <Input
                  className="mt-1"
                  value={startTime}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div>
                <Label>End (HH:mm)</Label>
                <Input
                  className="mt-1"
                  value={endTime}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            </div>
            <Button
              type="button"
              disabled={create.isPending}
              onClick={() => create.mutate()}
            >
              Add shift
            </Button>
          </div>
          <ul className="mt-4 divide-y divide-[#f3f4f6] border-t border-[#f3f4f6]">
            {(shiftsQ.data ?? []).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="font-medium text-[#111827]">
                  {s.name}{" "}
                  <span className="font-normal text-[#6b7280]">
                    {s.startTime}–{s.endTime}
                  </span>
                </span>
                {!s.isActive ? (
                  <span className="text-xs text-[#9ca3af]">inactive</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-[#e5e7eb] bg-white p-5">
          <h2 className="text-base font-semibold text-[#111827]">
            Assign staff
          </h2>
          <div className="mt-3 space-y-2">
            <div>
              <Label>Staff</Label>
              <select
                className="mt-1 select-field w-full"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              >
                <option value="">Select…</option>
                {(usersQ.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Shift</Label>
              <select
                className="mt-1 select-field w-full"
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value)}
              >
                <option value="">Select…</option>
                {(shiftsQ.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.startTime}–{s.endTime})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Date</Label>
              <Input
                className="mt-1"
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
              />
            </div>
            <Button
              type="button"
              disabled={assign.isPending || !userId || !shiftId}
              onClick={() => assign.mutate()}
            >
              Assign
            </Button>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">
        <div className="border-b border-[#f3f4f6] px-4 py-3 text-sm font-medium">
          Roster
        </div>
        <ul className="divide-y divide-[#f3f4f6]">
          {(assignQ.data ?? []).map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium text-[#111827]">{a.user.fullName}</p>
                <p className="text-xs text-[#6b7280]">
                  {String(a.workDate).slice(0, 10)} · {a.shift.name} (
                  {a.shift.startTime}–{a.shift.endTime})
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => remove.mutate(a.id)}
              >
                Remove
              </Button>
            </li>
          ))}
          {!(assignQ.data ?? []).length ? (
            <li className="px-4 py-8 text-sm text-[#6b7280]">No assignments</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
