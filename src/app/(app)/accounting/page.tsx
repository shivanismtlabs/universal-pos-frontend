"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { PageHeader } from "@/components/page-header";
import { AccountingNav } from "./accounting-nav";

export default function AccountingOverviewPage() {
  const { money } = useBootstrap();
  const q = useQuery({
    queryKey: ["accounting", "overview"],
    queryFn: () => accountingApi.overview(),
  });
  const cards = q.data?.cards ?? {};
  const items = [
    { key: "revenue", label: "Revenue" },
    { key: "expenses", label: "Expenses" },
    { key: "netProfit", label: "Net Profit" },
    { key: "receivables", label: "Receivables" },
    { key: "payables", label: "Payables" },
    { key: "cashBank", label: "Cash/Bank" },
    { key: "gstPayable", label: "GST Payable" },
  ];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Accounting"
        subtitle="Posted journals drive these figures — not invoice screens. Enable accounting in Settings to auto-post sales, purchases, and expenses."
        action={
          <Link
            href="/settings/accounting"
            className="text-[13px] font-medium text-[#1a56db]"
          >
            Accounting settings
          </Link>
        }
      />
      <AccountingNav />
      {q.isError ? (
        <p className="text-sm text-rose-600">Could not load accounting overview.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((c) => (
            <div
              key={c.key}
              className="rounded-lg border border-[#e5e7eb] bg-white p-4"
            >
              <div className="text-[12px] font-medium uppercase tracking-wide text-[#6b7280]">
                {c.label}
              </div>
              <div className="mt-1 text-xl font-semibold text-[#111827]">
                {money(Number(cards[c.key] ?? 0))}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[13px] text-[#6b7280]">
        Operational P&amp;L from sales/expenses remains under{" "}
        <Link href="/reports/pnl" className="text-[#1a56db]">
          Reports → Profit &amp; Loss
        </Link>
        . This module is the general ledger.
      </p>
    </div>
  );
}
