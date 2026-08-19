"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { enterpriseApi } from "@/lib/api/enterprise";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBootstrap } from "@/lib/bootstrap";
import { cn } from "@/lib/utils";

type Tab =
  | "dashboard"
  | "pnl"
  | "compare"
  | "inventory"
  | "approvals"
  | "staff";

function money(n: number | null | undefined, code = "INR") {
  if (n == null || Number.isNaN(n)) return "—";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return String(n);
  }
}

export default function GroupDashboardPage() {
  const { data: boot } = useBootstrap();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [invQ, setInvQ] = useState("");
  const [invSearch, setInvSearch] = useState("");
  const currency = boot?.tenant?.currencyCode ?? "INR";

  const groupQ = useQuery({
    queryKey: ["enterprise-group"],
    queryFn: () => enterpriseApi.group(),
  });
  const dashQ = useQuery({
    queryKey: ["enterprise-dash"],
    queryFn: () => enterpriseApi.dashboard(),
    enabled: tab === "dashboard",
  });
  const pnlQ = useQuery({
    queryKey: ["enterprise-pnl"],
    queryFn: () => enterpriseApi.pnl(),
    enabled: tab === "pnl" || tab === "compare",
  });
  const cmpQ = useQuery({
    queryKey: ["enterprise-cmp"],
    queryFn: () => enterpriseApi.comparison(),
    enabled: tab === "compare",
  });
  const invQry = useQuery({
    queryKey: ["enterprise-inv", invSearch],
    queryFn: () => enterpriseApi.inventory(invSearch),
    enabled: tab === "inventory" && invSearch.length >= 2,
  });
  const apprQ = useQuery({
    queryKey: ["enterprise-appr"],
    queryFn: () => enterpriseApi.approvals("pending"),
    enabled: tab === "approvals",
  });
  const staffQ = useQuery({
    queryKey: ["enterprise-staff"],
    queryFn: () => enterpriseApi.staff(),
    enabled: tab === "staff",
  });

  const kpis = dashQ.data?.kpis ?? {};
  const tiles = useMemo(
    () => [
      ["Today", kpis.todaySales],
      ["Yesterday", kpis.yesterdaySales],
      ["MTD sales", kpis.mtdSales],
      ["YTD sales", kpis.ytdSales],
      ["Gross profit", kpis.grossProfit],
      ["Net profit", kpis.netProfit],
      ["Expenses", kpis.expenses],
      ["Cash", kpis.cash],
      ["AR", kpis.accountsReceivable],
      ["AP", kpis.accountsPayable],
      ["Inventory", kpis.inventoryValue],
      ["Tax accrued", kpis.taxAccrued],
    ],
    [kpis],
  );

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "dashboard", label: "Dashboard" },
    { id: "pnl", label: "Group P&L" },
    { id: "compare", label: "Comparison" },
    { id: "inventory", label: "Inventory map" },
    { id: "approvals", label: "Approvals" },
    { id: "staff", label: "Staff" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="All Businesses"
        subtitle="Group control for every shop on this identity. Numbers drill to tenant orders — legal books stay separate."
      />

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button
            key={t.id}
            type="button"
            size="sm"
            variant={tab === t.id ? "default" : "secondary"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {tab === "dashboard" && (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {tiles.map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-lg border border-[#d9e0ea] bg-white p-3"
              >
                <p className="text-[0.7rem] font-medium uppercase tracking-wide text-[#6b7280]">
                  {label}
                </p>
                <p className="mt-1 text-lg font-semibold text-[#111827]">
                  {money(Number(value), currency)}
                </p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-lg border border-[#d9e0ea] bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-[#e5e7eb] text-left text-[#6b7280]">
                <tr>
                  <th className="px-3 py-2">Business</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Branches</th>
                  <th className="px-3 py-2">Open registers</th>
                </tr>
              </thead>
              <tbody>
                {(groupQ.data?.businesses ?? []).map((b) => (
                  <tr key={b.tenantId} className="border-t border-[#f3f4f6]">
                    <td className="px-3 py-2 font-medium">{b.name}</td>
                    <td className="px-3 py-2">{b.businessType}</td>
                    <td className="px-3 py-2">{b.branchCount}</td>
                    <td className="px-3 py-2">{b.openRegisterCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[#6b7280]">
            Low stock {Number(kpis.lowStock ?? 0)} · Dead stock{" "}
            {Number(kpis.deadStock ?? 0)} · Fast movers{" "}
            {Number(kpis.fastMoving ?? 0)}
          </p>
        </>
      )}

      {tab === "pnl" && (
        <div className="rounded-lg border border-[#d9e0ea] bg-white p-4">
          <p className="text-xs text-[#6b7280]">{pnlQ.data?.note}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <Kpi label="Revenue" value={money(pnlQ.data?.group.revenue, currency)} />
            <Kpi label="COGS" value={money(pnlQ.data?.group.cogs, currency)} />
            <Kpi
              label="Gross profit"
              value={money(pnlQ.data?.group.grossProfit, currency)}
            />
            <Kpi
              label="Net profit"
              value={money(pnlQ.data?.group.netProfit, currency)}
            />
          </div>
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-[#6b7280]">
              <tr>
                <th className="py-2">Business</th>
                <th>Revenue</th>
                <th>COGS</th>
                <th>Gross</th>
                <th>Opex</th>
                <th>Net</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(pnlQ.data?.businesses ?? []).map((b) => (
                <tr key={b.tenantId} className="border-t border-[#f3f4f6]">
                  <td className="py-2">{b.name}</td>
                  <td>{money(b.revenue, currency)}</td>
                  <td>{money(b.cogs, currency)}</td>
                  <td>{money(b.grossProfit, currency)}</td>
                  <td>{money(b.expenses, currency)}</td>
                  <td
                    className={cn(
                      b.netProfit < 0 ? "text-rose-600" : "text-emerald-700",
                    )}
                  >
                    {money(b.netProfit, currency)}
                  </td>
                  <td>
                    <Link
                      className="text-[#1a56db]"
                      href={`/orders?tenantHint=${b.tenantId}`}
                    >
                      Vouchers
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "compare" && (
        <div className="overflow-x-auto rounded-lg border border-[#d9e0ea] bg-white">
          <table className="w-full text-sm">
            <thead className="text-left text-[#6b7280]">
              <tr>
                <th className="px-3 py-2">Business</th>
                <th>Sales</th>
                <th>COGS</th>
                <th>Gross</th>
                <th>Margin</th>
                <th>Net</th>
                <th>Inventory</th>
                <th>Cash</th>
                <th>AR</th>
                <th>AP</th>
                <th>Growth</th>
              </tr>
            </thead>
            <tbody>
              {(cmpQ.data?.rows ?? []).map((r) => (
                <tr key={String(r.tenantId)} className="border-t border-[#f3f4f6]">
                  <td className="px-3 py-2">{String(r.name)}</td>
                  <td>{money(Number(r.revenue), currency)}</td>
                  <td>{money(Number(r.cogs), currency)}</td>
                  <td>{money(Number(r.grossProfit), currency)}</td>
                  <td>
                    {r.grossMarginPct == null ? "—" : `${r.grossMarginPct}%`}
                  </td>
                  <td>{money(Number(r.netProfit), currency)}</td>
                  <td>{money(Number(r.inventoryValue), currency)}</td>
                  <td>{money(Number(r.cash), currency)}</td>
                  <td>{money(Number(r.ar), currency)}</td>
                  <td>{money(Number(r.ap), currency)}</td>
                  <td>
                    {r.growth == null ? "—" : `${r.growth}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "inventory" && (
        <div className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setInvSearch(invQ.trim());
            }}
          >
            <Input
              value={invQ}
              onChange={(e) => setInvQ(e.target.value)}
              placeholder="SKU, name, or barcode"
            />
            <Button type="submit">Search</Button>
          </form>
          {(invQry.data?.items ?? []).map((item) => (
            <div
              key={item.sku}
              className="rounded-lg border border-[#d9e0ea] bg-white p-3"
            >
              <p className="font-medium">
                {item.name}{" "}
                <span className="text-[#6b7280]">({item.sku})</span>
              </p>
              <table className="mt-2 w-full text-sm">
                <thead className="text-left text-[#6b7280]">
                  <tr>
                    <th>Business</th>
                    <th>Location</th>
                    <th>Available</th>
                    <th>Damaged</th>
                    <th>In transit</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {item.locations.map((l) => (
                    <tr key={l.tenantId + l.location}>
                      <td>{l.business}</td>
                      <td>
                        {l.location}
                        {l.warehouse ? " (warehouse)" : ""}
                      </td>
                      <td>{l.available}</td>
                      <td>{l.damaged}</td>
                      <td>{l.inTransit}</td>
                      <td>{l.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {tab === "approvals" && (
        <div className="rounded-lg border border-[#d9e0ea] bg-white p-3 text-sm">
          <pre className="whitespace-pre-wrap text-xs text-[#374151]">
            {JSON.stringify(apprQ.data ?? [], null, 2)}
          </pre>
        </div>
      )}

      {tab === "staff" && (
        <div className="rounded-lg border border-[#d9e0ea] bg-white p-4 text-sm">
          <pre className="whitespace-pre-wrap text-xs text-[#374151]">
            {JSON.stringify(staffQ.data ?? {}, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.7rem] uppercase text-[#6b7280]">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
