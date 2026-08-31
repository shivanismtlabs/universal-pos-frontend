"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Timer } from "lucide-react";
import { iamApi } from "@/lib/api";
import { formatWorkedDuration } from "@/lib/attendance-time";
import { useAuthStore } from "@/lib/auth-store";

/** Live shift timer when the signed-in user is clocked in. */
export function AttendanceShiftTimer({ className }: { className?: string }) {
  const permissions = useAuthStore((s) => s.user?.permissions ?? []);
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const canTrack =
    roles.some((r) => ["admin", "manager", "cashier", "staff"].includes(r)) ||
    permissions.includes("*") ||
    permissions.includes("attendance.self") ||
    permissions.includes("attendance.manage");

  const openQ = useQuery({
    queryKey: ["attendance-open"],
    queryFn: () => iamApi.openAttendance(),
    enabled: canTrack,
    refetchInterval: 60_000,
  });

  const open = openQ.data;
  const isRunning = Boolean(open?.clockInAt && !open?.clockOutAt);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [isRunning]);

  const elapsed = useMemo(() => {
    if (!open?.clockInAt || open.clockOutAt) return null;
    return formatWorkedDuration(
      open.clockInAt,
      null,
      open.breakMinutes ?? 0,
    );
  }, [open, tick]);

  if (!isRunning || !elapsed) return null;

  return (
    <div
      className={
        className ??
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 tabular-nums text-emerald-900"
      }
      title={`Clocked in since ${new Date(open!.clockInAt!).toLocaleString()}`}
    >
      <Timer className="size-3.5 shrink-0 text-emerald-700" aria-hidden />
      <span className="text-[0.75rem] font-semibold">On shift · {elapsed}</span>
    </div>
  );
}
