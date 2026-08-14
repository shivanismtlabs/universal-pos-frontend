"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { accountingApi, tenantsApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { todayYmd } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { AccountingNav } from "../accounting-nav";

export default function TrialBalancePage() {
  const { money } = useBootstrap();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-01-01`;
  });
  const [to, setTo] = useState(todayYmd());
  const [locationId, setLocationId] = useState("");
  const [applied, setApplied] = useState({ from, to, locationId: "" });
  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });
  const q = useQuery({
    queryKey: ["accounting", "tb", applied],
    queryFn: () => accountingApi.trialBalance(applied),
  });
  const data = q.data as {
    rows: Array<{ code: string; name: string; type: string; debit: string; credit: string }>;
    totalDebit: string;
    totalCredit: string;
    difference: string;
    balanced: boolean;
    integrityError: string | null;
  } | undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Trial Balance"
        subtitle="Debits and credits from posted journals. Totals must match."
        action={
          <Button
            variant="secondary"
            onClick={() => {
              if (!data) return;
              downloadCsv(
                "trial-balance.csv",
                ["Code", "Name", "Type", "Debit", "Credit"],
                data.rows.map((r) => [r.code, r.name, r.type, r.debit, r.credit]),
              );
            }}
          >
            Export CSV
          </Button>
        }
      />
      <AccountingNav />
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <Label>Location</Label>
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">All</option>
            {(locations.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </div>
        <Button onClick={() => setApplied({ from, to, locationId })}>Apply</Button>
      </div>
      {data?.integrityError ? (
        <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {data.integrityError}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-[#e5e7eb] bg-white">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-[#f9fafb] text-[#6b7280]">
            <tr>
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium text-right">Debit</th>
              <th className="px-3 py-2 font-medium text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((r) => (
              <tr key={r.code} className="border-t border-[#e5e7eb]">
                <td className="px-3 py-2">
                  {r.code} {r.name}
                </td>
                <td className="px-3 py-2 text-right">{money(Number(r.debit))}</td>
                <td className="px-3 py-2 text-right">{money(Number(r.credit))}</td>
              </tr>
            ))}
            <tr className="border-t border-[#e5e7eb] font-semibold">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right">
                {money(Number(data?.totalDebit ?? 0))}
              </td>
              <td className="px-3 py-2 text-right">
                {money(Number(data?.totalCredit ?? 0))}
              </td>
            </tr>
            <tr className="border-t border-[#e5e7eb]">
              <td className="px-3 py-2">Difference</td>
              <td className="px-3 py-2 text-right" colSpan={2}>
                {money(Number(data?.difference ?? 0))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
