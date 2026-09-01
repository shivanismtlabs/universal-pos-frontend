/** Human-readable attendance status for admin views and exports. */

const STATUS_LABELS: Record<string, string> = {
  present: "Present",
  absent: "Absent",
  half_day: "Half Day",
  late: "Late",
  early_leave: "Early Leave",
  leave: "Leave",
  holiday: "Holiday",
  off_day: "Off Day",
  checked_in: "Checked In",
  checked_out: "Checked Out",
};

export function resolveAttendanceDisplayStatus(row: {
  status?: string;
  clockInAt?: string | null;
  clockOutAt?: string | null;
  isOpenSession?: boolean;
}): string {
  const dbStatus = row.status || "present";
  if (["absent", "half_day", "late", "leave", "holiday", "off_day"].includes(dbStatus)) {
    return dbStatus;
  }
  if (row.isOpenSession || (row.clockInAt && !row.clockOutAt)) {
    return "checked_in";
  }
  if (row.clockInAt && row.clockOutAt) {
    return "checked_out";
  }
  return dbStatus;
}

export function attendanceStatusLabel(code: string): string {
  return STATUS_LABELS[code] ?? code;
}

export function attendanceStatusFilterOptions() {
  return [
    { value: "", label: "All statuses" },
    { value: "checked_in", label: "Checked In" },
    { value: "checked_out", label: "Checked Out" },
    { value: "present", label: "Present" },
    { value: "absent", label: "Absent" },
    { value: "late", label: "Late" },
    { value: "half_day", label: "Half Day" },
  ];
}

export function matchesAttendanceStatusFilter(
  row: {
    status?: string;
    clockInAt?: string | null;
    clockOutAt?: string | null;
    isOpenSession?: boolean;
    displayStatus?: string;
  },
  filter: string,
): boolean {
  if (!filter) return true;
  const code = row.displayStatus ?? resolveAttendanceDisplayStatus(row);
  return code === filter;
}

export function exportAttendanceCsv(
  rows: Array<{
    fullName: string;
    email: string;
    workDate?: string | null;
    shift?: { name: string } | null;
    clockIn?: string | null;
    clockOut?: string | null;
    breakMinutes?: number;
    workingHours?: string | null;
    displayStatus?: string;
    status?: string;
    clockInAt?: string | null;
    clockOutAt?: string | null;
    isOpenSession?: boolean;
    method?: string;
  }>,
) {
  const header = [
    "Staff",
    "Email",
    "Date",
    "Shift",
    "Check In",
    "Check Out",
    "Break (min)",
    "Working Hours",
    "Status",
    "Method",
  ];
  const lines = rows.map((r) => {
    const status = attendanceStatusLabel(
      r.displayStatus ?? resolveAttendanceDisplayStatus(r),
    );
    const checkIn =
      r.clockIn ??
      (r.clockInAt
        ? new Date(r.clockInAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "");
    const checkOut =
      r.clockOut ??
      (r.clockOutAt
        ? new Date(r.clockOutAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "");
    return [
      r.fullName,
      r.email,
      r.workDate ?? "",
      r.shift?.name ?? "",
      checkIn,
      checkOut,
      String(r.breakMinutes ?? 0),
      r.workingHours ?? "",
      status,
      r.method ?? "",
    ]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(",");
  });
  const blob = new Blob([[header.join(","), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendance-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
