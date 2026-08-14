"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { accountingApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { PageHeader } from "@/components/page-header";
import { AccountingNav } from "../../accounting-nav";

export default function JournalDetailRoute() {
  return (
    <Suspense
      fallback={<p className="p-8 text-sm text-[#5a6b7d]">Loading journal…</p>}
    >
      <JournalDetailPage />
    </Suspense>
  );
}

function JournalDetailPage() {
  const { money } = useBootstrap();
  const search = useSearchParams();
  const id = search.get("id")?.trim() || "";
  const q = useQuery({
    queryKey: ["accounting", "journal", id],
    queryFn: () => accountingApi.getJournal(id),
    enabled: Boolean(id),
  });
  const j = q.data as {
    entryNumber: string;
    entryDate: string;
    sourceType: string;
    sourceId: string | null;
    description: string;
    status: string;
    debitTotal: string;
    creditTotal: string;
    lines: Array<{
      id: string;
      debit: string;
      credit: string;
      description?: string;
      account?: { code: string; name: string };
    }>;
  } | undefined;

  if (!id) {
    return (
      <div className="space-y-4">
        <PageHeader title="Journal" subtitle="Missing journal id" />
        <AccountingNav />
        <Link className="text-[13px] text-[#1a56db]" href="/accounting/journals">
          Back to journals
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={j?.entryNumber ?? "Journal"}
        subtitle={j ? `${j.sourceType} · ${j.status}` : "Loading…"}
      />
      <AccountingNav />
      {j?.sourceId ? (
        <p className="text-[13px] text-[#6b7280]">
          Source {j.sourceType}{" "}
          <span className="font-mono">{j.sourceId}</span>
          {j.sourceType === "SALE" || j.sourceType === "CREDIT_SALE" ? (
            <>
              {" "}
              ·{" "}
              <Link className="text-[#1a56db]" href={`/orders/view?id=${j.sourceId}`}>
                Open original transaction
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-[#e5e7eb] bg-white">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-[#f9fafb] text-[#6b7280]">
            <tr>
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium text-right">Debit</th>
              <th className="px-3 py-2 font-medium text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {(j?.lines ?? []).map((l) => (
              <tr key={l.id} className="border-t border-[#e5e7eb]">
                <td className="px-3 py-2">
                  {l.account?.code} {l.account?.name}
                </td>
                <td className="px-3 py-2">{l.description}</td>
                <td className="px-3 py-2 text-right">
                  {Number(l.debit) ? money(Number(l.debit)) : ""}
                </td>
                <td className="px-3 py-2 text-right">
                  {Number(l.credit) ? money(Number(l.credit)) : ""}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[#e5e7eb] font-semibold">
              <td className="px-3 py-2" colSpan={2}>
                Total
              </td>
              <td className="px-3 py-2 text-right">
                {money(Number(j?.debitTotal ?? 0))}
              </td>
              <td className="px-3 py-2 text-right">
                {money(Number(j?.creditTotal ?? 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
