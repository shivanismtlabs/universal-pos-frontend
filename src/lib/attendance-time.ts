/** Elapsed worked minutes from clock-in until now (or clock-out). */
export function workedMinutes(
  clockInAt: string | Date,
  clockOutAt?: string | Date | null,
  breakMinutes = 0,
  asOf: Date = new Date(),
): number {
  const start = new Date(clockInAt).getTime();
  if (!Number.isFinite(start)) return 0;
  const end = clockOutAt ? new Date(clockOutAt).getTime() : asOf.getTime();
  if (!Number.isFinite(end) || end <= start) return 0;
  const raw = Math.round((end - start) / 60000);
  return Math.max(0, raw - Math.max(0, breakMinutes || 0));
}

export function formatWorkedMinutes(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export function formatWorkedDuration(
  clockInAt: string | Date,
  clockOutAt?: string | Date | null,
  breakMinutes = 0,
  asOf?: Date,
): string {
  return formatWorkedMinutes(
    workedMinutes(clockInAt, clockOutAt, breakMinutes, asOf),
  );
}
