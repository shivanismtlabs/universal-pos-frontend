"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { iamApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

export default function AttendancePage() {
  const qc = useQueryClient();
  const openQ = useQuery({
    queryKey: ["attendance-open"],
    queryFn: () => iamApi.openAttendance(),
  });
  const listQ = useQuery({
    queryKey: ["attendance-list"],
    queryFn: () => iamApi.listAttendance(),
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

  const open = openQ.data;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Attendance"
        subtitle="Clock in and out for your shift. Managers see the full team log."
      />

      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white p-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#111827]">Your status</p>
          <p className="text-sm text-[#6b7280]">
            {open
              ? `Clocked in since ${new Date(open.clockInAt).toLocaleString()}`
              : "Not clocked in"}
          </p>
        </div>
        {open ? (
          <Button
            type="button"
            disabled={clockOut.isPending}
            onClick={() => clockOut.mutate()}
          >
            Clock out
          </Button>
        ) : (
          <Button
            type="button"
            disabled={clockIn.isPending}
            onClick={() => clockIn.mutate()}
          >
            Clock in
          </Button>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">
        <div className="border-b border-[#f3f4f6] px-4 py-3 text-sm font-medium text-[#374151]">
          Log
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="bg-[#f9fafb] text-xs tracking-wide text-[#6b7280] uppercase">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Staff</th>
                <th className="px-4 py-2.5 font-semibold">In</th>
                <th className="px-4 py-2.5 font-semibold">Out</th>
                <th className="px-4 py-2.5 font-semibold">Minutes</th>
                <th className="px-4 py-2.5 font-semibold">Method</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3f4f6]">
              {(listQ.data ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-[#111827]">{r.fullName}</p>
                    <p className="text-xs text-[#9ca3af]">{r.email}</p>
                  </td>
                  <td className="px-4 py-2.5 text-[#374151]">
                    {new Date(r.clockInAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-[#374151]">
                    {r.clockOutAt
                      ? new Date(r.clockOutAt).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5">{r.minutes ?? "—"}</td>
                  <td className="px-4 py-2.5 capitalize">{r.method}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {listQ.isLoading ? (
            <p className="px-4 py-8 text-sm text-[#6b7280]">Loading…</p>
          ) : !(listQ.data ?? []).length ? (
            <p className="px-4 py-8 text-sm text-[#6b7280]">No entries yet</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
