"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { accountingApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { todayYmd } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { AccountingNav } from "../../accounting-nav";

export default function TallyIntegrationPage() {
  const qc = useQueryClient();
  const [companyName, setCompanyName] = useState("");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [to, setTo] = useState(todayYmd());
  const logs = useQuery({
    queryKey: ["accounting", "tally-logs"],
    queryFn: () => accountingApi.integrationLogs("TALLY"),
  });
  const connect = useMutation({
    mutationFn: () => accountingApi.connect("TALLY", { companyName }),
    onSuccess: () => {
      toast.success("Tally export configured");
      void qc.invalidateQueries({ queryKey: ["accounting"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Save failed"),
  });
  const exp = useMutation({
    mutationFn: () => accountingApi.tallyExport({ from, to }),
    onSuccess: (res) => {
      toast.success("Export generated");
      const xml = (res as { payload?: { xml?: string } })?.payload?.xml;
      if (xml) {
        const blob = new Blob([xml], { type: "application/xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `tally-${from}-${to}.xml`;
        a.click();
        URL.revokeObjectURL(url);
      }
      void qc.invalidateQueries({ queryKey: ["accounting", "tally-logs"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Export failed"),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tally"
        subtitle="File export adapter. Journals are marked synced only after the XML file is generated."
      />
      <AccountingNav />
      <div className="max-w-lg space-y-3 rounded-lg border border-[#e5e7eb] bg-white p-4">
        <div>
          <Label>Company name</Label>
          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </div>
        <Button onClick={() => connect.mutate()}>Save Tally settings</Button>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <Button variant="secondary" onClick={() => exp.mutate()}>
          Generate export file
        </Button>
      </div>
      <h2 className="text-[13px] font-semibold">Export history</h2>
      <ul className="text-[13px] text-[#4b5563]">
        {(((logs.data as { items?: Array<{ id: string; status: string; createdAt: string; errorMessage?: string }> })?.items) ?? []).map(
          (l) => (
            <li key={l.id}>
              {String(l.createdAt).slice(0, 19)} · {l.status}
              {l.errorMessage ? ` · ${l.errorMessage}` : ""}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
