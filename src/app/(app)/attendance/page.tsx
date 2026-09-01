"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { iamApi, usersApi, type AttendanceRow } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { canManageStaff } from "@/lib/roles";
import { todayYmd } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { formatWorkedDuration } from "@/lib/attendance-time";
import {
  attendanceStatusFilterOptions,
  attendanceStatusLabel,
  exportAttendanceCsv,
  matchesAttendanceStatusFilter,
} from "@/lib/attendance-display";

const STATUSES = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "half_day", label: "Half Day" },
  { value: "late", label: "Late" },
  { value: "early_leave", label: "Early Leave" },
  { value: "leave", label: "Leave" },
  { value: "holiday", label: "Holiday" },
  { value: "off_day", label: "Off Day" },
] as const;

const NO_TIME = new Set(["absent", "leave", "holiday", "off_day"]);

type FormState = {
  userId: string;
  workDate: string;
  shiftId: string;
  clockIn: string;
  clockOut: string;
  breakMinutes: string;
  status: string;
  notes: string;
  correctionReason: string;
};

const emptyForm = (): FormState => ({
  userId: "",
  workDate: todayYmd(),
  shiftId: "",
  clockIn: "09:00",
  clockOut: "18:00",
  breakMinutes: "0",
  status: "present",
  notes: "",
  correctionReason: "",
});

type RangePreset = "today" | "week" | "month" | "all";

function rangeForPreset(preset: RangePreset): { from?: string; to?: string } {
  const today = todayYmd();
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") {
    const d = new Date();
    const day = d.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + mondayOffset);
    return { from: monday.toISOString().slice(0, 10), to: today };
  }
  if (preset === "month") {
    const d = new Date();
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    return { from, to: today };
  }
  return {};
}


function calcPreviewHours(form: FormState): string {
  if (NO_TIME.has(form.status) || !form.clockIn || !form.clockOut) return "—";
  const [ih, im] = form.clockIn.split(":").map(Number);
  const [oh, om] = form.clockOut.split(":").map(Number);
  if ([ih, im, oh, om].some((n) => Number.isNaN(n))) return "—";
  let mins = oh * 60 + om - (ih * 60 + im);
  const br = Math.max(0, Number(form.breakMinutes) || 0);
  mins = Math.max(0, mins - br);
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

export default function AttendancePage() {
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.user?.roles);
  const permissions = useAuthStore((s) => s.user?.permissions);
  const canManage =
    canManageStaff(roles) ||
    (permissions ?? []).includes("attendance.manage") ||
    (permissions ?? []).includes("*");

  const [filters, setFilters] = useState({
    workDate: "",
    userId: "",
    shiftId: "",
    status: "",
    range: "week" as RangePreset,
  });
  const [panel, setPanel] = useState<"closed" | "add" | "edit" | "view">(
    "closed",
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const openQ = useQuery({
    queryKey: ["attendance-open"],
    queryFn: () => iamApi.openAttendance(),
  });
  const range = rangeForPreset(filters.range);
  const listQ = useQuery({
    queryKey: ["attendance-list", filters],
    queryFn: () =>
      iamApi.listAttendance({
        workDate: filters.workDate || undefined,
        from: filters.workDate ? undefined : range.from,
        to: filters.workDate ? undefined : range.to,
        userId: filters.userId || undefined,
        shiftId: filters.shiftId || undefined,
        status:
          filters.status &&
          !["checked_in", "checked_out"].includes(filters.status)
            ? filters.status
            : undefined,
      }),
  });
  const historyQ = useQuery({
    queryKey: ["attendance-history", editingId],
    queryFn: () => iamApi.attendanceHistory(editingId!),
    enabled: panel === "view" && Boolean(editingId),
  });
  const staffQ = useQuery({
    queryKey: ["users-staff"],
    queryFn: () => usersApi.list(),
    enabled: canManage,
  });
  const shiftsQ = useQuery({
    queryKey: ["shifts"],
    queryFn: () => iamApi.listShifts(),
  });

  const clockIn = useMutation({
    mutationFn: () => iamApi.clockIn({ method: "manual" }),
    onSuccess: () => {
      toast.success("Clocked in");
      void qc.invalidateQueries({ queryKey: ["attendance-open"] });
      void qc.invalidateQueries({ queryKey: ["attendance-list"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const clockOut = useMutation({
    mutationFn: () => iamApi.clockOut({ method: "manual" }),
    onSuccess: () => {
      toast.success("Clocked out");
      void qc.invalidateQueries({ queryKey: ["attendance-open"] });
      void qc.invalidateQueries({ queryKey: ["attendance-list"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        userId: form.userId,
        workDate: form.workDate,
        shiftId: form.shiftId || undefined,
        clockIn: NO_TIME.has(form.status) ? form.clockIn || undefined : form.clockIn,
        clockOut: form.clockOut || undefined,
        breakMinutes: Number(form.breakMinutes) || 0,
        status: form.status,
        notes: form.notes.trim() || undefined,
      };
      if (panel === "edit" && editingId) {
        if (!form.correctionReason.trim()) {
          throw new Error("Correction reason is required");
        }
        return iamApi.updateAttendance(editingId, {
          ...body,
          shiftId: form.shiftId || null,
          clockIn: form.clockIn || null,
          clockOut: form.clockOut || null,
          notes: form.notes.trim() || null,
          correctionReason: form.correctionReason.trim(),
        });
      }
      return iamApi.createAttendance(body);
    },
    onSuccess: () => {
      toast.success(panel === "edit" ? "Attendance updated" : "Attendance added");
      setPanel("closed");
      setEditingId(null);
      setForm(emptyForm());
      void qc.invalidateQueries({ queryKey: ["attendance-list"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError
          ? e.messages.join(", ")
          : e instanceof Error
            ? e.message
            : "Failed",
      ),
  });

  const remove = useMutation({
    mutationFn: (id: string) => iamApi.deleteAttendance(id),
    onSuccess: () => {
      toast.success("Attendance deleted");
      void qc.invalidateQueries({ queryKey: ["attendance-list"] });
      if (panel !== "closed") {
        setPanel("closed");
        setEditingId(null);
      }
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const open = openQ.data;
  const hoursPreview = useMemo(() => calcPreviewHours(form), [form]);
  const isClockedIn = Boolean(open?.clockInAt && !open?.clockOutAt);
  const filteredRows = useMemo(() => {
    const rows = listQ.data ?? [];
    return rows.filter((r) => matchesAttendanceStatusFilter(r, filters.status));
  }, [listQ.data, filters.status]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!isClockedIn) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [isClockedIn]);

  const liveElapsed = useMemo(() => {
    if (!open?.clockInAt || open.clockOutAt) return null;
    return formatWorkedDuration(
      open.clockInAt,
      null,
      open.breakMinutes ?? 0,
    );
  }, [open, tick]);

  useEffect(() => {
    if (NO_TIME.has(form.status)) return;
    if (!form.clockIn) setForm((f) => ({ ...f, clockIn: "09:00" }));
  }, [form.status, form.clockIn]);

  function openAdd() {
    setForm(emptyForm());
    setEditingId(null);
    setPanel("add");
  }

  function openEdit(row: AttendanceRow) {
    setEditingId(row.id);
    setForm({
      userId: row.userId,
      workDate: row.workDate || todayYmd(),
      shiftId: row.shiftId || "",
      clockIn: row.clockIn || "",
      clockOut: row.clockOut || "",
      breakMinutes: String(row.breakMinutes ?? 0),
      status: row.status || "present",
      notes: row.notes || "",
      correctionReason: "",
    });
    setPanel("edit");
  }

  function openView(row: AttendanceRow) {
    setEditingId(row.id);
    setForm({
      userId: row.userId,
      workDate: row.workDate || todayYmd(),
      shiftId: row.shiftId || "",
      clockIn: row.clockIn || "",
      clockOut: row.clockOut || "",
      breakMinutes: String(row.breakMinutes ?? 0),
      status: row.status || "present",
      notes: row.notes || "",
      correctionReason: "",
    });
    setPanel("view");
  }

  const readOnly = panel === "view";

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Attendance"
        subtitle="Clock in for your shift, or add manual day entries for the team."
        action={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => exportAttendanceCsv(filteredRows)}
                disabled={!filteredRows.length}
              >
                Export CSV
              </Button>
              <Button type="button" onClick={openAdd}>
                + Add Attendance
              </Button>
            </div>
          ) : null
        }
      />

      <section className="flex flex-wrap items-center gap-4 rounded-xl border border-[#e4e9f0] bg-white p-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#0b1f33]">Your shift</p>
          {isClockedIn && liveElapsed ? (
            <>
              <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-[#1a56db]">
                {liveElapsed}
              </p>
              <p className="mt-1 text-sm text-[#5a6b7d]">
                Clocked in at{" "}
                {new Date(open!.clockInAt!).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {" · "}Timer runs until you clock out
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-[#5a6b7d]">
              Not clocked in — tap Clock in when your shift starts
            </p>
          )}
        </div>
        {isClockedIn ? (
          <Button
            type="button"
            variant="secondary"
            disabled={clockOut.isPending}
            onClick={() => clockOut.mutate()}
          >
            Check out
          </Button>
        ) : (
          <Button
            type="button"
            disabled={clockIn.isPending}
            onClick={() => clockIn.mutate()}
          >
            Check in
          </Button>
        )}
      </section>

      <section className="rounded-xl border border-[#e5e7eb] bg-white p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              ["today", "Today"],
              ["week", "This week"],
              ["month", "This month"],
              ["all", "All"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  range: id,
                  workDate: id === "today" ? todayYmd() : "",
                }))
              }
              className={
                filters.range === id
                  ? "rounded-md bg-[#1a56db] px-3 py-1.5 text-xs font-semibold text-white"
                  : "rounded-md border border-[#e5e7eb] px-3 py-1.5 text-xs font-medium text-[#374151] hover:bg-[#f9fafb]"
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              className="mt-1"
              value={filters.workDate}
              onChange={(e) =>
                setFilters((f) => ({ ...f, workDate: e.target.value }))
              }
            />
          </div>
          {canManage ? (
            <div>
              <Label>Staff</Label>
              <Select
                className="mt-1"
                value={filters.userId}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, userId: e.target.value }))
                }
              >
                <option value="">All staff</option>
                {(staffQ.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div>
            <Label>Shift</Label>
            <Select
              className="mt-1"
              value={filters.shiftId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, shiftId: e.target.value }))
              }
            >
              <option value="">All shifts</option>
              {(shiftsQ.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select
              className="mt-1"
              value={filters.status}
              onChange={(e) =>
                setFilters((f) => ({ ...f, status: e.target.value }))
              }
            >
              <option value="">All statuses</option>
              {attendanceStatusFilterOptions()
                .filter((s) => s.value)
                .map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              {STATUSES.filter(
                (s) =>
                  !["present", "absent", "late", "half_day"].includes(s.value),
              ).map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() =>
                setFilters({
                  workDate: "",
                  userId: "",
                  shiftId: "",
                  status: "",
                  range: "week",
                })
              }
            >
              Clear filters
            </Button>
          </div>
        </div>
      </section>

      {panel !== "closed" ? (
        <section className="rounded-xl border border-[#e5e7eb] bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#111827]">
              {panel === "add"
                ? "Add attendance"
                : panel === "edit"
                  ? "Edit attendance"
                  : "View attendance"}
            </h2>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPanel("closed");
                setEditingId(null);
              }}
            >
              Close
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label>Staff</Label>
              <Select
                className="mt-1"
                disabled={readOnly || !canManage}
                value={form.userId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, userId: e.target.value }))
                }
              >
                <option value="">Select staff</option>
                {(staffQ.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                className="mt-1"
                disabled={readOnly}
                value={form.workDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, workDate: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Shift</Label>
              <Select
                className="mt-1"
                disabled={readOnly}
                value={form.shiftId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, shiftId: e.target.value }))
                }
              >
                <option value="">— None —</option>
                {(shiftsQ.data ?? [])
                  .filter((s) => s.isActive !== false)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.startTime}–{s.endTime})
                    </option>
                  ))}
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                className="mt-1"
                disabled={readOnly}
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value }))
                }
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Clock In</Label>
              <Input
                type="time"
                className="mt-1"
                disabled={readOnly}
                value={form.clockIn}
                onChange={(e) =>
                  setForm((f) => ({ ...f, clockIn: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Clock Out</Label>
              <Input
                type="time"
                className="mt-1"
                disabled={readOnly}
                value={form.clockOut}
                onChange={(e) =>
                  setForm((f) => ({ ...f, clockOut: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Break Duration (minutes)</Label>
              <Input
                type="number"
                min={0}
                className="mt-1"
                disabled={readOnly}
                value={form.breakMinutes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, breakMinutes: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Working hours</Label>
              <p className="mt-2 text-sm font-semibold tabular-nums text-[#0b1f33]">
                {hoursPreview}
              </p>
              <p className="text-[0.7rem] text-[#8b9bb0]">
                Auto-calculated after break
              </p>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Label>Notes</Label>
              <Input
                className="mt-1"
                disabled={readOnly}
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Optional"
              />
            </div>
            {panel === "edit" ? (
              <div className="sm:col-span-2 lg:col-span-3">
                <Label>Correction reason</Label>
                <Input
                  className="mt-1"
                  value={form.correctionReason}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      correctionReason: e.target.value,
                    }))
                  }
                  placeholder="Why is this attendance being corrected?"
                />
                <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                  Required — saved to activity history with old and new values.
                </p>
              </div>
            ) : null}
          </div>
          {panel === "view" && editingId ? (
            <div className="mt-4 rounded-lg border border-[#eef1f4] bg-[#f8fafc] p-4">
              <p className="text-sm font-semibold text-[#0b1f33]">
                Activity history
              </p>
              {historyQ.isLoading ? (
                <p className="mt-2 text-sm text-[#6b7280]">Loading history…</p>
              ) : !(historyQ.data ?? []).length ? (
                <p className="mt-2 text-sm text-[#6b7280]">No history yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {(historyQ.data ?? []).map((h) => (
                    <li
                      key={h.id}
                      className="rounded-md border border-[#e5e7eb] bg-white px-3 py-2 text-sm"
                    >
                      <p className="font-medium text-[#111827]">
                        {h.action.replace(/\./g, " · ")}
                      </p>
                      <p className="text-xs text-[#6b7280]">
                        {h.actor?.fullName ?? "System"} ·{" "}
                        {new Date(h.createdAt).toLocaleString()}
                      </p>
                      {h.beforeAfter &&
                      typeof h.beforeAfter === "object" &&
                      h.beforeAfter !== null &&
                      "reason" in h.beforeAfter ? (
                        <p className="mt-1 text-xs text-[#374151]">
                          Reason:{" "}
                          {String(
                            (h.beforeAfter as { reason?: string }).reason ??
                              "",
                          )}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
          {!readOnly ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={
                  save.isPending ||
                  !form.userId ||
                  !form.workDate ||
                  (panel === "edit" && !form.correctionReason.trim())
                }
                onClick={() => save.mutate()}
              >
                {save.isPending ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setPanel("closed");
                  setEditingId(null);
                }}
              >
                Cancel
              </Button>
            </div>
          ) : null}
          <p className="mt-3 text-[0.7rem] text-[#8b9bb0]">
            Entry method: Manual
          </p>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">
        <div className="border-b border-[#f3f4f6] px-4 py-3 text-sm font-medium text-[#374151]">
          Attendance log
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="bg-[#f9fafb] text-xs tracking-wide text-[#6b7280] uppercase">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Staff</th>
                <th className="px-4 py-2.5 font-semibold">Date</th>
                <th className="px-4 py-2.5 font-semibold">Shift</th>
                <th className="px-4 py-2.5 font-semibold">In</th>
                <th className="px-4 py-2.5 font-semibold">Out</th>
                <th className="px-4 py-2.5 font-semibold">Break</th>
                <th className="px-4 py-2.5 font-semibold">Hours</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Method</th>
                <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3f4f6]">
              {(filteredRows).map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-[#111827]">{r.fullName}</p>
                    <p className="text-xs text-[#9ca3af]">{r.email}</p>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-[#374151]">
                    {r.workDate ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-[#374151]">
                    {r.shift?.name ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-[#374151]">
                    {r.clockIn ??
                      (r.clockInAt
                        ? new Date(r.clockInAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—")}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-[#374151]">
                    {r.clockOut ??
                      (r.clockOutAt
                        ? new Date(r.clockOutAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—")}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {r.breakMinutes ?? 0}m
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {r.isOpenSession && r.clockInAt ? (
                      <span className="font-semibold text-[#1a56db]">
                        {formatWorkedDuration(
                          r.clockInAt,
                          null,
                          r.breakMinutes ?? 0,
                        )}{" "}
                        <span className="text-[0.65rem] font-medium text-[#5a6b7d]">
                          (running)
                        </span>
                      </span>
                    ) : (
                      r.workingHours ??
                      (r.minutes != null ? `${r.minutes}m` : "—")
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {attendanceStatusLabel(r.displayStatus ?? r.status)}
                  </td>
                  <td className="px-4 py-2.5 capitalize">{r.method}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="View"
                        onClick={() => openView(r)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canManage ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            title="Edit"
                            onClick={() => openEdit(r)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-rose-600"
                            title="Delete"
                            disabled={remove.isPending}
                            onClick={() => {
                              if (
                                confirm(
                                  `Delete attendance for ${r.fullName} on ${r.workDate ?? "this day"}?`,
                                )
                              ) {
                                remove.mutate(r.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {listQ.isLoading ? (
            <p className="px-4 py-8 text-sm text-[#6b7280]">Loading…</p>
          ) : !filteredRows.length ? (
            <p className="px-4 py-8 text-sm text-[#6b7280]">No entries yet</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
