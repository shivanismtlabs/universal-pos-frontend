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

export default function AccountingPnlPage() {
  const { money } = useBootstrap();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [to, setTo] = useState(todayYmd());
  const [locationId, setLocationId] = useState("");
  const [applied, setApplied] = useState({ from, to, locationId: "", compare: "true" });
  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });
  const q = useQuery({
    queryKey: ["accounting", "pnl", applied],
    queryFn: () => accountingApi.profitLoss(applied),
  });
  const current = (q.data as { current?: Record<string, string> } | undefined)?.current;

  const row = (label: string, key: string, strong?: boolean) => (
    <tr className={strong ? "font-semibold" : ""}>
      <td className="px-3 py-2">{label}</td>
      <td className="px-3 py-2 text-right">
        {money(Number(current?.[key] ?? 0))}
      </td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Profit & Loss"
        subtitle="Derived from posted revenue and expense accounts — not from the invoice UI."
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
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </Select>
        </div>
        <Button onClick={() => setApplied({ from, to, locationId, compare: "true" })}>
          Apply
        </Button>
      </div>
      <table className="w-full max-w-xl text-left text-[13px] rounded-lg border border-[#e5e7eb] bg-white">
        <tbody>
          {row("Revenue", "revenue")}
          {row("Less: Returns / adjustments", "returns")}
          {row("Net revenue", "netRevenue", true)}
          {row("Less: COGS", "cogs")}
          {row("Gross profit", "grossProfit", true)}
          {row("Less: Operating expenses", "operatingExpenses")}
          {row("Net profit", "netProfit", true)}
        </tbody>
      </table>
    </div>
  );
}
