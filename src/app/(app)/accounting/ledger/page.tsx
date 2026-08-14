"use client";

import { useMemo, useState } from "react";
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

export default function LedgerPage() {
  const { money } = useBootstrap();
  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [to, setTo] = useState(todayYmd());
  const [locationId, setLocationId] = useState("");
  const [applied, setApplied] = useState({ accountId: "", from, to, locationId: "" });

  const accounts = useQuery({
    queryKey: ["accounting", "accounts", "ledger"],
    queryFn: () => accountingApi.listAccounts({ limit: 100, active: "true" }),
  });
  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });
  const ledger = useQuery({
    queryKey: ["accounting", "ledger", applied],
    queryFn: () => accountingApi.ledger(applied),
    enabled: Boolean(applied.accountId),
  });
  const data = ledger.data as {
    openingBalance: string;
    closingBalance: string;
    lines: Array<{
      id: string;
      date: string;
      reference: string;
      journalEntryId: string;
      description: string;
      debit: string;
      credit: string;
      balance: string;
    }>;
  } | undefined;
  const accountItems = useMemo(
    () => (accounts.data?.items ?? []) as Array<{ id: string; code: string; name: string }>,
    [accounts.data],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="General Ledger"
        subtitle="Running balance from posted journals, with opening and closing amounts."
      />
      <AccountingNav />
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label>Account</Label>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Select account</option>
            {accountItems.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} {a.name}
              </option>
            ))}
          </Select>
        </div>
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
        <Button
          onClick={() => setApplied({ accountId, from, to, locationId })}
        >
          Apply
        </Button>
      </div>
      {data ? (
        <div className="overflow-x-auto rounded-lg border border-[#e5e7eb] bg-white">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-[#f9fafb] text-[#6b7280]">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Reference</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium text-right">Debit</th>
                <th className="px-3 py-2 font-medium text-right">Credit</th>
                <th className="px-3 py-2 font-medium text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-[#e5e7eb] text-[#6b7280]">
                <td className="px-3 py-2" colSpan={5}>
                  Opening balance
                </td>
                <td className="px-3 py-2 text-right">
                  {money(Number(data.openingBalance))}
                </td>
              </tr>
              {data.lines.map((l) => (
                <tr key={l.id} className="border-t border-[#e5e7eb]">
                  <td className="px-3 py-2">{String(l.date).slice(0, 10)}</td>
                  <td className="px-3 py-2">{l.reference}</td>
                  <td className="px-3 py-2">{l.description}</td>
                  <td className="px-3 py-2 text-right">
                    {Number(l.debit) ? money(Number(l.debit)) : ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {Number(l.credit) ? money(Number(l.credit)) : ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {money(Number(l.balance))}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-[#e5e7eb] font-semibold">
                <td className="px-3 py-2" colSpan={5}>
                  Closing balance
                </td>
                <td className="px-3 py-2 text-right">
                  {money(Number(data.closingBalance))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-[#6b7280]">Select an account and apply filters.</p>
      )}
    </div>
  );
}
