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
import { AccountingNav } from "../../accounting-nav";

export default function QuickBooksPage() {
  const qc = useQueryClient();
  const [realmId, setRealmId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const logs = useQuery({
    queryKey: ["accounting", "qb-logs"],
    queryFn: () => accountingApi.integrationLogs("QUICKBOOKS"),
  });
  const connect = useMutation({
    mutationFn: () =>
      accountingApi.connect("QUICKBOOKS", { realmId, accessToken }),
    onSuccess: () => {
      toast.success("QuickBooks connection saved (tokens encrypted)");
      setAccessToken("");
      void qc.invalidateQueries({ queryKey: ["accounting"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Save failed"),
  });
  const test = useMutation({
    mutationFn: () => accountingApi.test("QUICKBOOKS"),
    onSuccess: (r) => toast((r as { message?: string }).message ?? "Tested"),
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Test failed"),
  });
  const sync = useMutation({
    mutationFn: () => accountingApi.sync("QUICKBOOKS"),
    onSuccess: () => toast.success("Sync processed"),
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Sync failed"),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="QuickBooks"
        subtitle="OAuth tokens are encrypted at rest. Sync is asynchronous and idempotent — retries reuse the same external reference."
      />
      <AccountingNav />
      <div className="max-w-lg space-y-3 rounded-lg border border-[#e5e7eb] bg-white p-4">
        <div>
          <Label>Company / realm ID</Label>
          <Input value={realmId} onChange={(e) => setRealmId(e.target.value)} />
        </div>
        <div>
          <Label>Access token</Label>
          <Input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => connect.mutate()}>Connect</Button>
          <Button variant="secondary" onClick={() => test.mutate()}>
            Test
          </Button>
          <Button variant="secondary" onClick={() => sync.mutate()}>
            Sync now
          </Button>
        </div>
      </div>
      <ul className="text-[13px] text-[#4b5563]">
        {(((logs.data as { items?: Array<{ id: string; status: string; createdAt: string }> })?.items) ?? []).map(
          (l) => (
            <li key={l.id}>
              {String(l.createdAt).slice(0, 19)} · {l.status}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
