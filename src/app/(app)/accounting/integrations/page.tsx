"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { accountingApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { AccountingNav } from "../accounting-nav";

type Conn = {
  provider: string;
  status: string;
  externalOrgId?: string | null;
  lastSyncedAt?: string | null;
};

const LINKS: Record<string, string> = {
  TALLY: "/accounting/integrations/tally",
  QUICKBOOKS: "/accounting/integrations/quickbooks",
  ZOHO_BOOKS: "/accounting/integrations/zoho-books",
};

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["accounting", "integrations"],
    queryFn: () => accountingApi.integrations(),
  });
  const sync = useMutation({
    mutationFn: (p: string) => accountingApi.sync(p),
    onSuccess: () => {
      toast.success("Sync queued");
      void qc.invalidateQueries({ queryKey: ["accounting", "integrations"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Sync failed"),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="External Accounting"
        subtitle="Tally, QuickBooks, and Zoho Books are adapters. The Universal POS ledger never embeds their APIs."
      />
      <AccountingNav />
      <div className="grid gap-3 md:grid-cols-3">
        {((q.data ?? []) as Conn[]).map((c) => (
          <div key={c.provider} className="rounded-lg border border-[#e5e7eb] bg-white p-4">
            <div className="text-sm font-semibold">{c.provider.replace("_", " ")}</div>
            <div className="mt-1 text-[13px] text-[#6b7280]">Status: {c.status}</div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" asChild>
                <Link href={LINKS[c.provider] ?? "#"}>Configure</Link>
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => sync.mutate(c.provider)}
              >
                Sync
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
