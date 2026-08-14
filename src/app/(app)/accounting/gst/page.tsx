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

export default function GstReportsPage() {
  const { money } = useBootstrap();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [to, setTo] = useState(todayYmd());
  const [locationId, setLocationId] = useState("");
  const [applied, setApplied] = useState({ from, to, locationId: "" });
  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });
  const q = useQuery({
    queryKey: ["accounting", "gst", applied],
    queryFn: () => accountingApi.taxReports(applied),
  });
  const d = q.data as Record<string, unknown> | undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        title="GST Reports"
        subtitle="Built from tax facts stored when journals were posted — not recalculated from invoices at report time."
        action={
          <Button
            variant="secondary"
            onClick={() => {
              const lines = (d?.lines as Array<Record<string, string>> | undefined) ?? [];
              downloadCsv(
                "gst-report.csv",
                ["Date", "Ref", "Direction", "Type", "Taxable", "Tax"],
                lines.map((l) => [
                  String(l.date).slice(0, 10),
                  l.reference,
                  l.direction,
                  l.taxType,
                  l.taxableValue,
                  l.taxAmount,
                ]),
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
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </Select>
        </div>
        <Button onClick={() => setApplied({ from, to, locationId })}>Apply</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Output GST", "outputGst"],
          ["Input GST", "inputGst"],
          ["Net payable", "netPayable"],
          ["CGST", "cgst"],
          ["SGST", "sgst"],
          ["IGST", "igst"],
          ["Taxable sales", "taxableSales"],
          ["Taxable purchases", "taxablePurchases"],
        ].map(([label, key]) => (
          <div key={key} className="rounded-lg border border-[#e5e7eb] bg-white p-3">
            <div className="text-[12px] text-[#6b7280]">{label}</div>
            <div className="text-lg font-semibold">{money(Number(d?.[key] ?? 0))}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
