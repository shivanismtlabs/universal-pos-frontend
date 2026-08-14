"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { accountingApi, tenantsApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { todayYmd } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { AccountingNav } from "../accounting-nav";

type Section = Array<{ code: string; name: string; balance: string }>;

export default function BalanceSheetPage() {
  const { money } = useBootstrap();
  const [asOf, setAsOf] = useState(todayYmd());
  const [locationId, setLocationId] = useState("");
  const [applied, setApplied] = useState({ asOf, locationId: "" });
  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });
  const q = useQuery({
    queryKey: ["accounting", "bs", applied],
    queryFn: () => accountingApi.balanceSheet(applied),
  });
  const data = q.data as {
    sections: Record<string, Section>;
    totals: Record<string, string>;
    balanced: boolean;
    integrityError: string | null;
  } | undefined;

  const block = (title: string, rows: Section | undefined) => (
    <div>
      <h3 className="mb-1 text-[13px] font-semibold text-[#111827]">{title}</h3>
      <table className="mb-4 w-full text-[13px]">
        <tbody>
          {(rows ?? []).map((r) => (
            <tr key={r.code}>
              <td className="py-0.5">{r.code} {r.name}</td>
              <td className="py-0.5 text-right">{money(Number(r.balance))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Balance Sheet"
        subtitle="Assets = Liabilities + Equity, from posted journals as of the selected date."
      />
      <AccountingNav />
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label>As of</Label>
          <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </div>
        <div>
          <Label>Location</Label>
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">All</option>
            {(locations.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </Select>
        </div>
        <Button onClick={() => setApplied({ asOf, locationId })}>Apply</Button>
      </div>
      {data?.integrityError ? (
        <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {data.integrityError}
        </p>
      ) : null}
      <div className="grid gap-6 rounded-lg border border-[#e5e7eb] bg-white p-4 md:grid-cols-2">
        <div>
          {block("Current assets", data?.sections.currentAssets)}
          {block("Fixed assets", data?.sections.fixedAssets)}
          <p className="font-semibold">
            Total assets {money(Number(data?.totals.assets ?? 0))}
          </p>
        </div>
        <div>
          {block("Current liabilities", data?.sections.currentLiabilities)}
          {block("Long-term liabilities", data?.sections.longTermLiabilities)}
          {block("Equity", data?.sections.equity)}
          <p className="font-semibold">
            Liabilities + equity {money(Number(data?.totals.liabilitiesAndEquity ?? 0))}
          </p>
        </div>
      </div>
    </div>
  );
}
