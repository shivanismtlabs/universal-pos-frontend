"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { accountingApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { AccountingNav } from "../accounting-nav";

type Period = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
};

export default function PeriodsPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["accounting", "periods"],
    queryFn: () => accountingApi.periods(),
  });
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const create = useMutation({
    mutationFn: () => accountingApi.createPeriod({ startDate, endDate }),
    onSuccess: () => {
      toast.success("Period created");
      void qc.invalidateQueries({ queryKey: ["accounting", "periods"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Create failed"),
  });
  const close = useMutation({
    mutationFn: (id: string) => accountingApi.closePeriod(id),
    onSuccess: () => {
      toast.success("Period closed");
      void qc.invalidateQueries({ queryKey: ["accounting", "periods"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Close failed"),
  });
  const reopen = useMutation({
    mutationFn: (id: string) => accountingApi.reopenPeriod(id),
    onSuccess: () => {
      toast.success("Period reopened");
      void qc.invalidateQueries({ queryKey: ["accounting", "periods"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Reopen failed"),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Accounting Periods"
        subtitle="Closed periods reject new postings. Reopen requires accounting.close_period."
      />
      <AccountingNav />
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div>
          <Label>Start</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </div>
        <div>
          <Label>End</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        </div>
        <Button type="submit">Create period</Button>
      </form>
      <table className="w-full text-left text-[13px] rounded-lg border border-[#e5e7eb] bg-white">
        <thead className="bg-[#f9fafb] text-[#6b7280]">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Start</th>
            <th className="px-3 py-2 font-medium">End</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {((list.data ?? []) as Period[]).map((p) => (
            <tr key={p.id} className="border-t border-[#e5e7eb]">
              <td className="px-3 py-2">{p.name}</td>
              <td className="px-3 py-2">{String(p.startDate).slice(0, 10)}</td>
              <td className="px-3 py-2">{String(p.endDate).slice(0, 10)}</td>
              <td className="px-3 py-2">{p.status}</td>
              <td className="px-3 py-2">
                {p.status === "OPEN" ? (
                  <Button size="sm" variant="secondary" onClick={() => close.mutate(p.id)}>
                    Close
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => reopen.mutate(p.id)}>
                    Reopen
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
