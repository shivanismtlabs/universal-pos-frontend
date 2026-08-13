"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { customersApi, reportsApi, tenantsApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { cn, todayYmd } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

type Tab =
  | "top"
  | "history"
  | "new_returning"
  | "rfm"
  | "outstanding"
  | "loyalty";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "top", label: "Top customers" },
  { id: "history", label: "Purchase history" },
  { id: "new_returning", label: "New vs returning" },
  { id: "rfm", label: "RFM segments" },
  { id: "outstanding", label: "Outstanding / credit" },
  { id: "loyalty", label: "Loyalty points" },
];

const SEGMENTS = ["", "VIP", "Loyal", "At-Risk", "Lost", "New", "Regular"];

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
}

function severityClass(s: string) {
  if (s === "critical") return "bg-rose-700 text-white";
  if (s === "high") return "bg-rose-100 text-rose-900";
  if (s === "medium") return "bg-amber-100 text-amber-900";
  return "bg-[#f3f4f6] text-[#4b5563]";
}

function pieColor(segment: string) {
  const map: Record<string, string> = {
    VIP: "#1a56db",
    Loyal: "#0e9f6e",
    "At-Risk": "#d97706",
    Lost: "#e02424",
    New: "#7e3af2",
    Regular: "#6b7280",
  };
  return map[segment] ?? "#9ca3af";
}

export default function CustomerReportsPage() {
  const { money } = useBootstrap();
  const [tab, setTab] = useState<Tab>("top");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(todayYmd);
  const [locationId, setLocationId] = useState("");
  const [segment, setSegment] = useState("");
  const [minSpend, setMinSpend] = useState("0");
  const [minDue, setMinDue] = useState("0");
  const [q, setQ] = useState("");
  const [rankBy, setRankBy] = useState<"spend" | "visits" | "profit">("spend");
  const [customerId, setCustomerId] = useState("");
  const [applied, setApplied] = useState({
    from: defaultFrom(),
    to: todayYmd(),
    locationId: "",
    segment: "",
    minSpend: 0,
    minDue: 0,
    q: "",
    rankBy: "spend" as "spend" | "visits" | "profit",
    customerId: "",
  });

  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });
  const customerPick = useQuery({
    queryKey: ["customers", "pick-reports"],
    queryFn: () => customersApi.list({ limit: 100 }),
  });

  const common = useMemo(
    () => ({
      from: applied.from,
      to: applied.to,
      locationId: applied.locationId || undefined,
      segment: applied.segment || undefined,
      minSpend: applied.minSpend || undefined,
      q: applied.q || undefined,
      limit: 100,
    }),
    [applied],
  );

  const top = useQuery({
    queryKey: ["reports", "cust-top", common, applied.rankBy],
    queryFn: () =>
      reportsApi.customerTop({ ...common, rankBy: applied.rankBy }),
    enabled: tab === "top",
  });
  const history = useQuery({
    queryKey: ["reports", "cust-history", common, applied.customerId],
    queryFn: () =>
      reportsApi.customerPurchaseHistory({
        ...common,
        customerId: applied.customerId,
      }),
    enabled: tab === "history" && Boolean(applied.customerId),
  });
  const nvr = useQuery({
    queryKey: ["reports", "cust-nvr", common],
    queryFn: () => reportsApi.customerNewVsReturning(common),
    enabled: tab === "new_returning",
  });
  const rfm = useQuery({
    queryKey: ["reports", "cust-rfm", common],
    queryFn: () => reportsApi.customerRfm(common),
    enabled: tab === "rfm",
  });
  const outstanding = useQuery({
    queryKey: [
      "reports",
      "cust-due",
      applied.locationId,
      applied.segment,
      applied.minDue,
      applied.q,
    ],
    queryFn: () =>
      reportsApi.customerOutstanding({
        locationId: applied.locationId || undefined,
        segment: applied.segment || undefined,
        minDue: applied.minDue || undefined,
        q: applied.q || undefined,
        limit: 200,
      }),
    enabled: tab === "outstanding",
  });
  const loyalty = useQuery({
    queryKey: ["reports", "cust-loyalty", common],
    queryFn: () => reportsApi.customerLoyalty(common),
    enabled: tab === "loyalty",
  });

  const pieMax = useMemo(
    () => Math.max(1, ...(rfm.data?.pie.map((p) => p.customerCount) ?? [1])),
    [rfm.data?.pie],
  );
  const seriesMax = useMemo(() => {
    const s = nvr.data?.series ?? [];
    return Math.max(
      1,
      ...s.map((d) => d.newCustomers + d.returningVisits),
    );
  }, [nvr.data?.series]);
  const agingMax = useMemo(
    () =>
      Math.max(
        1,
        ...(outstanding.data?.agingBuckets.map((b) => b.amount) ?? [1]),
      ),
    [outstanding.data?.agingBuckets],
  );

  function applyFilters() {
    setApplied({
      from,
      to,
      locationId,
      segment,
      minSpend: Number(minSpend) || 0,
      minDue: Number(minDue) || 0,
      q: q.trim(),
      rankBy,
      customerId,
    });
  }

  function exportCurrent() {
    if (tab === "top" && top.data?.items.length) {
      downloadCsv(
        `top-customers_${applied.from}_${applied.to}.csv`,
        [
          "rank",
          "name",
          "phone",
          "visits",
          "spend",
          "profit",
          "avg_ticket",
          "segment",
          "last_visit",
        ],
        top.data.items.map((r) => [
          r.rank,
          r.fullName,
          r.phone,
          r.visits,
          r.totalSpend,
          r.profitContributed,
          r.avgTicket,
          r.rfmSegment,
          r.lastVisit ?? "",
        ]),
      );
      return;
    }
    if (tab === "history" && history.data?.items.length) {
      downloadCsv(
        `purchase-history_${history.data.customer.phone}.csv`,
        [
          "date",
          "order",
          "branch",
          "amount",
          "balance_due",
          "payment",
          "items",
        ],
        history.data.items.map((r) => [
          r.date,
          r.orderNumber,
          r.branch,
          r.amount,
          r.balanceDue,
          r.paymentMethodLabel,
          r.lineItems.map((i) => `${i.name} x${i.qty}`).join("; "),
        ]),
      );
      return;
    }
    if (tab === "rfm" && rfm.data?.items.length) {
      downloadCsv(
        `rfm_${applied.from}_${applied.to}.csv`,
        [
          "name",
          "phone",
          "segment",
          "R",
          "F",
          "M",
          "recency_days",
          "frequency",
          "monetary",
        ],
        rfm.data.items.map((r) => [
          r.fullName,
          r.phone,
          r.segment,
          r.rScore,
          r.fScore,
          r.mScore,
          r.recencyDays,
          r.frequency,
          r.monetary,
        ]),
      );
      return;
    }
    if (tab === "outstanding" && outstanding.data?.items.length) {
      downloadCsv(
        `outstanding_credit.csv`,
        [
          "name",
          "phone",
          "total_due",
          "oldest_days",
          "severity",
          "b0_30",
          "b30_60",
          "b60_90",
          "b90_plus",
        ],
        outstanding.data.items.map((r) => [
          r.fullName,
          r.phone,
          r.totalDue,
          r.oldestDays,
          r.severity,
          r.buckets["0_30"] ?? 0,
          r.buckets["30_60"] ?? 0,
          r.buckets["60_90"] ?? 0,
          r.buckets["90_plus"] ?? 0,
        ]),
      );
      return;
    }
    if (tab === "loyalty" && loyalty.data?.items.length) {
      downloadCsv(
        `loyalty_points_${applied.from}_${applied.to}.csv`,
        [
          "name",
          "phone",
          "balance",
          "earned",
          "redeemed",
          "adjusted",
          "expiring",
        ],
        loyalty.data.items.map((r) => [
          r.fullName,
          r.phone,
          r.balance,
          r.earned,
          r.redeemed,
          r.adjusted,
          r.expiringPoints,
        ]),
      );
      return;
    }
    if (tab === "new_returning" && nvr.data?.series.length) {
      downloadCsv(
        `new_vs_returning_${applied.from}_${applied.to}.csv`,
        ["date", "new_customers", "returning_visits"],
        nvr.data.series.map((r) => [r.date, r.newCustomers, r.returningVisits]),
      );
      return;
    }
    toast.error("Nothing to export yet");
  }

  function exportMarketingBulk() {
    const rows =
      tab === "rfm"
        ? rfm.data?.items.map((r) => [
            r.fullName,
            r.phone,
            r.segment,
            r.monetary,
            r.profileHref,
          ])
        : tab === "top"
          ? top.data?.items.map((r) => [
              r.fullName,
              r.phone,
              r.rfmSegment,
              r.totalSpend,
              r.profileHref,
            ])
          : null;
    if (!rows?.length) {
      toast.error("Open Top or RFM with data for CRM export");
      return;
    }
    downloadCsv(
      `crm_export_${tab}_${applied.from}.csv`,
      ["full_name", "phone", "segment", "value", "profile_href"],
      rows,
    );
    toast.success("CRM/marketing CSV ready");
  }

  return (
    <div className="document-print-root mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Customer Reports"
        subtitle="Behavior, value, retention, credit aging, and loyalty — drill into profiles for full history."
        action={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button asChild size="sm" variant="secondary">
              <Link href="/reports">All reports</Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={exportCurrent}
            >
              CSV
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={exportMarketingBulk}
            >
              CRM bulk export
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => window.print()}
            >
              PDF / Print
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-1.5 print:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition",
              tab === t.id
                ? "bg-[#1a56db] text-white"
                : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 rounded-lg border border-[#e2e8f0] bg-white p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 print:hidden">
        <div>
          <Label className="text-xs">From</Label>
          <Input
            className="mt-1 h-9"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input
            className="mt-1 h-9"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Branch</Label>
          <Select
            className="mt-1 h-9"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            <option value="">All</option>
            {(locations.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label className="text-xs">Segment / tag</Label>
          <Select
            className="mt-1 h-9"
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
          >
            <option value="">All</option>
            {SEGMENTS.filter(Boolean).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label className="text-xs">Min spend</Label>
          <Input
            className="mt-1 h-9"
            type="number"
            min={0}
            value={minSpend}
            onChange={(e) => setMinSpend(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Search</Label>
          <Input
            className="mt-1 h-9"
            placeholder="Name / phone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {tab === "top" ? (
          <div>
            <Label className="text-xs">Rank by</Label>
            <Select
              className="mt-1 h-9"
              value={rankBy}
              onChange={(e) =>
                setRankBy(e.target.value as "spend" | "visits" | "profit")
              }
            >
              <option value="spend">Spend</option>
              <option value="visits">Visits</option>
              <option value="profit">Profit</option>
            </Select>
          </div>
        ) : null}
        {tab === "history" ? (
          <div>
            <Label className="text-xs">Customer</Label>
            <Select
              className="mt-1 h-9"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">Select…</option>
              {(customerPick.data?.items ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} · {c.phone}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        {tab === "outstanding" ? (
          <div>
            <Label className="text-xs">Min due</Label>
            <Input
              className="mt-1 h-9"
              type="number"
              min={0}
              value={minDue}
              onChange={(e) => setMinDue(e.target.value)}
            />
          </div>
        ) : null}
        <div className="flex items-end">
          <Button type="button" className="h-9 w-full" onClick={applyFilters}>
            Apply
          </Button>
        </div>
      </div>

      {tab === "top" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Customers", top.data?.summary.customerCount],
              ["Spend", top.data ? money(top.data.summary.totalSpend) : "—"],
              ["Visits", top.data?.summary.totalVisits],
              [
                "Profit",
                top.data ? money(top.data.summary.totalProfit) : "—",
              ],
            ].map(([label, val]) => (
              <div
                key={String(label)}
                className="rounded-lg border border-[#e2e8f0] bg-white px-4 py-3"
              >
                <p className="text-[0.65rem] font-semibold tracking-wide text-[#6b7280] uppercase">
                  {label}
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {val ?? "—"}
                </p>
              </div>
            ))}
          </div>
          <DataTable
            loading={top.isLoading}
            empty={!top.data?.items.length}
            headers={[
              "#",
              "Customer",
              "Visits",
              "Spend",
              "Profit",
              "Avg ticket",
              "Segment",
              "",
            ]}
            rows={(top.data?.items ?? []).map((r) => [
              r.rank,
              <div key="n">
                <p className="font-medium">{r.fullName}</p>
                <p className="text-xs text-[#6b7280]">{r.phone}</p>
              </div>,
              r.visits,
              money(r.totalSpend),
              money(r.profitContributed),
              money(r.avgTicket),
              r.rfmSegment,
              <Link
                key="p"
                href={r.profileHref}
                className="text-xs font-semibold text-[#1a56db]"
              >
                Profile
              </Link>,
            ])}
          />
        </>
      ) : null}

      {tab === "history" ? (
        !applied.customerId ? (
          <p className="rounded-lg border border-[#e2e8f0] bg-white px-4 py-8 text-center text-sm text-[#6b7280]">
            Select a customer and Apply to load purchase history.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e2e8f0] bg-white px-4 py-3">
              <div>
                <p className="font-semibold text-[#111827]">
                  {history.data?.customer.fullName ?? "…"}
                </p>
                <p className="text-xs text-[#6b7280]">
                  {history.data?.customer.phone}
                  {history.data?.customer.profileHref ? (
                    <>
                      {" · "}
                      <Link
                        href={history.data.customer.profileHref}
                        className="font-semibold text-[#1a56db]"
                      >
                        Open profile
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex gap-4 text-sm">
                <span>
                  Orders:{" "}
                  <strong>{history.data?.summary.orderCount ?? "—"}</strong>
                </span>
                <span>
                  Spent:{" "}
                  <strong>
                    {history.data
                      ? money(history.data.summary.totalSpent)
                      : "—"}
                  </strong>
                </span>
                <span>
                  Due:{" "}
                  <strong>
                    {history.data ? money(history.data.summary.openDue) : "—"}
                  </strong>
                </span>
              </div>
            </div>
            <DataTable
              loading={history.isLoading}
              empty={!history.data?.items.length}
              headers={[
                "Date",
                "Order",
                "Branch",
                "Amount",
                "Payment",
                "Items",
                "",
              ]}
              rows={(history.data?.items ?? []).map((r) => [
                r.date,
                r.orderNumber,
                r.branch,
                money(r.amount),
                r.paymentMethodLabel,
                r.lineItems
                  .slice(0, 3)
                  .map((i) => `${i.name}×${i.qty}`)
                  .join(", ") + (r.lineItems.length > 3 ? "…" : ""),
                <Link
                  key="o"
                  href={r.href}
                  className="text-xs font-semibold text-[#1a56db]"
                >
                  View
                </Link>,
              ])}
            />
          </>
        )
      ) : null}

      {tab === "new_returning" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["New", nvr.data?.summary.newCustomers],
              ["Returning", nvr.data?.summary.returningCustomers],
              [
                "Retention %",
                nvr.data?.summary.retentionRatePct != null
                  ? `${nvr.data.summary.retentionRatePct}%`
                  : "—",
              ],
              ["Orders", nvr.data?.summary.totalOrders],
            ].map(([label, val]) => (
              <div
                key={String(label)}
                className="rounded-lg border border-[#e2e8f0] bg-white px-4 py-3"
              >
                <p className="text-[0.65rem] font-semibold tracking-wide text-[#6b7280] uppercase">
                  {label}
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {val ?? "—"}
                </p>
              </div>
            ))}
          </div>
          <section className="rounded-lg border border-[#e2e8f0] bg-white p-4">
            <h2 className="text-sm font-semibold">Daily acquisition trend</h2>
            <ul className="mt-3 max-h-80 space-y-1.5 overflow-y-auto">
              {(nvr.data?.series ?? []).map((d) => {
                const total = d.newCustomers + d.returningVisits;
                const w = Math.max(4, (total / seriesMax) * 100);
                const newW =
                  total > 0 ? (d.newCustomers / total) * 100 : 0;
                return (
                  <li
                    key={d.date}
                    className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 text-xs"
                  >
                    <span className="tabular-nums text-[#6b7280]">{d.date}</span>
                    <div className="flex h-2.5 overflow-hidden rounded bg-[#f3f4f6]">
                      <div
                        className="h-full bg-[#1a56db]"
                        style={{ width: `${(w * newW) / 100}%` }}
                        title="New"
                      />
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${(w * (100 - newW)) / 100}%` }}
                        title="Returning"
                      />
                    </div>
                    <span className="tabular-nums text-[#374151]">
                      {d.newCustomers}/{d.returningVisits}
                    </span>
                  </li>
                );
              })}
              {nvr.isLoading ? (
                <li className="py-6 text-center text-[#6b7280]">Loading…</li>
              ) : null}
            </ul>
          </section>
        </>
      ) : null}

      {tab === "rfm" ? (
        <>
          <section className="rounded-lg border border-[#e2e8f0] bg-white p-4">
            <h2 className="text-sm font-semibold">Segmentation mix</h2>
            <ul className="mt-3 space-y-2">
              {(rfm.data?.pie ?? []).map((p) => (
                <li
                  key={p.segment}
                  className="grid grid-cols-[6rem_1fr_auto] items-center gap-2"
                >
                  <span className="text-xs font-medium">{p.segment}</span>
                  <div className="h-3 overflow-hidden rounded bg-[#f3f4f6]">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${Math.max(3, (p.customerCount / pieMax) * 100)}%`,
                        background: pieColor(p.segment),
                      }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-[#4b5563]">
                    {p.customerCount} · {money(p.totalSpend)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <DataTable
            loading={rfm.isLoading}
            empty={!rfm.data?.items.length}
            headers={[
              "Customer",
              "Segment",
              "R/F/M",
              "Recency d",
              "Freq",
              "Monetary",
              "",
            ]}
            rows={(rfm.data?.items ?? []).map((r) => [
              <div key="n">
                <p className="font-medium">{r.fullName}</p>
                <p className="text-xs text-[#6b7280]">{r.phone}</p>
              </div>,
              <span
                key="s"
                className="rounded px-2 py-0.5 text-[0.65rem] font-semibold text-white"
                style={{ background: pieColor(r.segment) }}
              >
                {r.segment}
              </span>,
              `${r.rScore}/${r.fScore}/${r.mScore}`,
              r.recencyDays,
              r.frequency,
              money(r.monetary),
              <Link
                key="p"
                href={r.profileHref}
                className="text-xs font-semibold text-[#1a56db]"
              >
                Profile
              </Link>,
            ])}
          />
        </>
      ) : null}

      {tab === "outstanding" ? (
        <>
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-[0.65rem] font-semibold tracking-wide text-rose-800 uppercase">
              Total outstanding
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-rose-950">
              {outstanding.data
                ? money(outstanding.data.summary.totalOutstanding)
                : "—"}
            </p>
            <p className="text-xs text-rose-800/80">
              {outstanding.data?.summary.customerCount ?? 0} customers ·{" "}
              {outstanding.data?.summary.criticalCount ?? 0} critical (90+ days)
            </p>
          </div>
          <section className="rounded-lg border border-[#e2e8f0] bg-white p-4">
            <h2 className="text-sm font-semibold">Aging buckets</h2>
            <ul className="mt-3 space-y-2">
              {(outstanding.data?.agingBuckets ?? []).map((b) => (
                <li
                  key={b.key}
                  className="grid grid-cols-[7rem_1fr_auto] items-center gap-2"
                >
                  <span className="text-xs font-medium">{b.label}</span>
                  <div className="h-3 overflow-hidden rounded bg-[#f3f4f6]">
                    <div
                      className={cn(
                        "h-full rounded",
                        b.severity === "critical" && "bg-rose-700",
                        b.severity === "high" && "bg-rose-500",
                        b.severity === "medium" && "bg-amber-500",
                        b.severity === "watch" && "bg-[#1a56db]",
                      )}
                      style={{
                        width: `${Math.max(3, (b.amount / agingMax) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs tabular-nums">{money(b.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
          <DataTable
            loading={outstanding.isLoading}
            empty={!outstanding.data?.items.length}
            headers={[
              "Severity",
              "Customer",
              "Total due",
              "Oldest",
              "0–30",
              "30–60",
              "60–90",
              "90+",
              "",
            ]}
            rows={(outstanding.data?.items ?? []).map((r) => [
              <span
                key="sev"
                className={cn(
                  "rounded px-2 py-0.5 text-[0.65rem] font-semibold uppercase",
                  severityClass(r.severity),
                )}
              >
                {r.severity}
              </span>,
              <div key="n">
                <p className="font-medium">{r.fullName}</p>
                <p className="text-xs text-[#6b7280]">{r.phone}</p>
              </div>,
              money(r.totalDue),
              `${r.oldestDays}d`,
              money(r.buckets["0_30"] ?? 0),
              money(r.buckets["30_60"] ?? 0),
              money(r.buckets["60_90"] ?? 0),
              money(r.buckets["90_plus"] ?? 0),
              <Link
                key="p"
                href={r.profileHref}
                className="text-xs font-semibold text-[#1a56db]"
              >
                Profile
              </Link>,
            ])}
          />
        </>
      ) : null}

      {tab === "loyalty" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Earned", loyalty.data?.summary.pointsEarned],
              ["Redeemed", loyalty.data?.summary.pointsRedeemed],
              ["Balances", loyalty.data?.summary.pointsOutstanding],
              ["Expiring", loyalty.data?.summary.pointsExpiring],
            ].map(([label, val]) => (
              <div
                key={String(label)}
                className="rounded-lg border border-[#e2e8f0] bg-white px-4 py-3"
              >
                <p className="text-[0.65rem] font-semibold tracking-wide text-[#6b7280] uppercase">
                  {label}
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {val ?? "—"}
                </p>
              </div>
            ))}
          </div>
          {loyalty.data && !loyalty.data.loyaltyEnabled ? (
            <p className="text-sm text-amber-800">
              Loyalty appears disabled in settings — balances still shown.
            </p>
          ) : null}
          <DataTable
            loading={loyalty.isLoading}
            empty={!loyalty.data?.items.length}
            headers={[
              "Customer",
              "Balance",
              "Earned",
              "Redeemed",
              "Adjust",
              "Expiring",
              "",
            ]}
            rows={(loyalty.data?.items ?? []).map((r) => [
              <div key="n">
                <p className="font-medium">{r.fullName}</p>
                <p className="text-xs text-[#6b7280]">{r.phone}</p>
              </div>,
              r.balance,
              r.earned,
              r.redeemed,
              r.adjusted,
              r.expiringPoints,
              <Link
                key="p"
                href={r.profileHref}
                className="text-xs font-semibold text-[#1a56db]"
              >
                Profile
              </Link>,
            ])}
          />
        </>
      ) : null}
    </div>
  );
}

function DataTable({
  headers,
  rows,
  loading,
  empty,
}: {
  headers: string[];
  rows: Array<Array<ReactNode>>;
  loading?: boolean;
  empty?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#e2e8f0] bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#f8fafc] text-[0.65rem] tracking-[0.08em] text-[#6b7280] uppercase">
            <tr>
              {headers.map((h) => (
                <th key={h || "x"} className="px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {loading ? (
              <tr>
                <td
                  colSpan={headers.length}
                  className="px-3 py-8 text-center text-[#6b7280]"
                >
                  Loading…
                </td>
              </tr>
            ) : empty ? (
              <tr>
                <td
                  colSpan={headers.length}
                  className="px-3 py-8 text-center text-[#6b7280]"
                >
                  No rows for these filters
                </td>
              </tr>
            ) : (
              rows.map((cells, i) => (
                <tr key={i} className="hover:bg-[#f8fafc]">
                  {cells.map((c, j) => (
                    <td key={j} className="px-3 py-2 tabular-nums">
                      {c}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
