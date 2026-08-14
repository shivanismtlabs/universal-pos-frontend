"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { accountingApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { AccountingNav } from "../accounting-nav";

type Journal = {
  id: string;
  entryNumber: string;
  entryDate: string;
  sourceType: string;
  sourceId: string | null;
  description: string | null;
  status: string;
  debitTotal: string;
  creditTotal: string;
};

export default function JournalsPage() {
  const { money } = useBootstrap();
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: ["accounting", "journals", status, q],
    queryFn: () =>
      accountingApi.listJournals({
        status: status || undefined,
        q: q || undefined,
        limit: "50",
      }),
  });
  const items = (list.data?.items ?? []) as Journal[];

  const post = useMutation({
    mutationFn: (id: string) => accountingApi.postJournal(id),
    onSuccess: () => {
      toast.success("Posted");
      void qc.invalidateQueries({ queryKey: ["accounting"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Post failed"),
  });
  const reverse = useMutation({
    mutationFn: (id: string) => accountingApi.reverseJournal(id),
    onSuccess: () => {
      toast.success("Reversal posted");
      void qc.invalidateQueries({ queryKey: ["accounting"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Reverse failed"),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Journal Entries"
        subtitle="Posted entries cannot be edited or deleted. Corrections use a reversal journal."
      />
      <AccountingNav />
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="POSTED">Posted</option>
          <option value="REVERSED">Reversed</option>
        </Select>
      </div>
      <div className="overflow-x-auto rounded-lg border border-[#e5e7eb] bg-white">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-[#f9fafb] text-[#6b7280]">
            <tr>
              <th className="px-3 py-2 font-medium">Number</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Debit</th>
              <th className="px-3 py-2 font-medium text-right">Credit</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {items.map((j) => (
              <tr key={j.id} className="border-t border-[#e5e7eb]">
                <td className="px-3 py-2">
                  <Link
                    href={`/accounting/journals/view?id=${j.id}`}
                    className="font-medium text-[#1a56db]"
                  >
                    {j.entryNumber}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  {String(j.entryDate).slice(0, 10)}
                </td>
                <td className="px-3 py-2 font-mono text-[12px]">
                  {j.sourceType}
                </td>
                <td className="px-3 py-2">{j.description}</td>
                <td className="px-3 py-2">{j.status}</td>
                <td className="px-3 py-2 text-right">
                  {money(Number(j.debitTotal))}
                </td>
                <td className="px-3 py-2 text-right">
                  {money(Number(j.creditTotal))}
                </td>
                <td className="px-3 py-2">
                  {j.status === "DRAFT" ? (
                    <Button
                      size="sm"
                      onClick={() => post.mutate(j.id)}
                    >
                      Post
                    </Button>
                  ) : null}
                  {j.status === "POSTED" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => reverse.mutate(j.id)}
                    >
                      Reverse
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
