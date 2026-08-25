"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { enterpriseApi } from "@/lib/api/enterprise";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBootstrap } from "@/lib/bootstrap";
import { useAuthStore } from "@/lib/auth-store";
import { cn, moneyNumber } from "@/lib/utils";
import { ApiError } from "@/lib/api/client";

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

function PanelState({
  loading,
  error,
  errorMessage,
  empty,
  emptyText,
  onRetry,
  children,
}: {
  loading?: boolean;
  error?: boolean;
  errorMessage?: string;
  empty?: boolean;
  emptyText?: string;
  onRetry?: () => void;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border border-[#d9e0ea] bg-white p-6 text-sm text-[#6b7280]">
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-[#f5c2c2] bg-[#fff6f6] p-4 text-sm text-[#a01818]">
        <p className="font-semibold">Could not load this view.</p>
        {errorMessage ? (
          <p className="mt-1 text-[0.8rem] text-[#b45309]">{errorMessage}</p>
        ) : (
          <p className="mt-1 text-[0.8rem] text-[#8b9bb0]">
            Check you are signed in, then tap Retry. If this keeps failing,
            restart the API so group permissions refresh.
          </p>
        )}
        {onRetry ? (
          <Button type="button" size="sm" className="mt-2" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }
  if (empty) {
    return (
      <div className="rounded-lg border border-dashed border-[#d9e0ea] bg-[#f8fafc] p-6 text-center text-sm text-[#6b7280]">
        {emptyText ?? "Nothing here yet."}
      </div>
    );
  }
  return <>{children}</>;
}

function queryErrorMessage(err: unknown): string | undefined {
  if (err instanceof ApiError) return err.messages.join(", ") || err.message;
  if (err instanceof Error) return err.message;
  return undefined;
}

export default function GroupDashboardPage() {
  const { data: boot } = useBootstrap();
  const qc = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [invQ, setInvQ] = useState("");
  const [invSearch, setInvSearch] = useState("");
  const [apprFilter, setApprFilter] = useState<"pending" | "all">("pending");
  const [decideNote, setDecideNote] = useState<Record<string, string>>({});
  const currency = boot?.tenant?.currencyCode ?? "INR";
  const canDecide = Boolean(accessToken);

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
    queryKey: ["enterprise-appr", apprFilter],
    queryFn: () =>
      enterpriseApi.approvals(apprFilter === "pending" ? "pending" : undefined),
    enabled: tab === "approvals",
  });
  const staffQ = useQuery({
    queryKey: ["enterprise-staff"],
    queryFn: () => enterpriseApi.staff(),
    enabled: tab === "staff",
  });

  const businessName = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of groupQ.data?.businesses ?? []) {
      map.set(b.tenantId, b.name);
    }
    return map;
  }, [groupQ.data?.businesses]);

  const decideMut = useMutation({
    mutationFn: (args: {
      id: string;
      decision: "approved" | "rejected";
      note?: string;
    }) => enterpriseApi.decide(args.id, args.decision, args.note),
    onSuccess: () => {
      toast.success("Decision saved");
      void qc.invalidateQueries({ queryKey: ["enterprise-appr"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Could not update approval",
      ),
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

  const approvals = apprQ.data ?? [];
  const staff = staffQ.data;

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
        <PanelState
          loading={dashQ.isPending || groupQ.isPending}
          error={dashQ.isError || groupQ.isError}
          errorMessage={
            queryErrorMessage(dashQ.error) || queryErrorMessage(groupQ.error)
          }
          onRetry={() => {
            void dashQ.refetch();
            void groupQ.refetch();
          }}
        >
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
          <div className="mt-4 overflow-x-auto rounded-lg border border-[#d9e0ea] bg-white">
            {(groupQ.data?.businesses ?? []).length === 0 ? (
              <p className="p-6 text-center text-sm text-[#6b7280]">
                No businesses in this group yet.{" "}
                <Link href="/organizations" className="font-medium text-[#1a56db]">
                  Add an organization
                </Link>
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-[#e5e7eb] text-left text-[#6b7280]">
                  <tr>
                    <th className="px-3 py-2">Business</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Branches</th>
                    <th className="px-3 py-2">Open registers</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(groupQ.data?.businesses ?? []).map((b) => (
                    <tr key={b.tenantId} className="border-t border-[#f3f4f6]">
                      <td className="px-3 py-2 font-medium">{b.name}</td>
                      <td className="px-3 py-2">{b.businessType}</td>
                      <td className="px-3 py-2">{b.branchCount}</td>
                      <td className="px-3 py-2">{b.openRegisterCount}</td>
                      <td className="px-3 py-2 text-right">
                        {b.canEnter ? (
                          <Link
                            href="/organizations"
                            className="text-xs font-semibold text-[#1a56db]"
                          >
                            Open
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="mt-2 text-xs text-[#6b7280]">
            Low stock {Number(kpis.lowStock ?? 0)} · Dead stock{" "}
            {Number(kpis.deadStock ?? 0)} · Fast movers{" "}
            {Number(kpis.fastMoving ?? 0)}
          </p>
        </PanelState>
      )}

      {tab === "pnl" && (
        <PanelState
          loading={pnlQ.isPending}
          error={pnlQ.isError}
          errorMessage={queryErrorMessage(pnlQ.error)}
          empty={!pnlQ.isPending && !(pnlQ.data?.businesses?.length)}
          emptyText="No businesses to show in group P&L."
          onRetry={() => void pnlQ.refetch()}
        >
          <div className="rounded-lg border border-[#d9e0ea] bg-white p-4">
            {pnlQ.data?.note ? (
              <p className="text-xs text-[#6b7280]">{pnlQ.data.note}</p>
            ) : null}
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
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[#6b7280]">
                  <tr>
                    <th className="py-2">Business</th>
                    <th>Revenue</th>
                    <th>COGS</th>
                    <th>Gross</th>
                    <th>Opex</th>
                    <th>Net</th>
                    <th />
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
          </div>
        </PanelState>
      )}

      {tab === "compare" && (
        <PanelState
          loading={cmpQ.isPending}
          error={cmpQ.isError}
          errorMessage={queryErrorMessage(cmpQ.error)}
          empty={!cmpQ.isPending && !(cmpQ.data?.rows?.length)}
          emptyText="No businesses to compare yet."
          onRetry={() => void cmpQ.refetch()}
        >
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
                  <tr
                    key={String(r.tenantId)}
                    className="border-t border-[#f3f4f6]"
                  >
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
                    <td>{r.growth == null ? "—" : `${r.growth}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelState>
      )}

      {tab === "inventory" && (
        <div className="space-y-3">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const q = invQ.trim();
              if (q.length < 2) {
                toast.message("Enter at least 2 characters to search");
                return;
              }
              setInvSearch(q);
            }}
          >
            <Input
              value={invQ}
              onChange={(e) => setInvQ(e.target.value)}
              placeholder="SKU, name, or barcode (min 2 characters)"
              className="max-w-md"
            />
            <Button type="submit">Search</Button>
          </form>
          {!invSearch ? (
            <div className="rounded-lg border border-dashed border-[#d9e0ea] bg-[#f8fafc] p-6 text-center text-sm text-[#6b7280]">
              Search across every shop in the group by SKU, name, or barcode.
            </div>
          ) : (
            <PanelState
              loading={invQry.isFetching}
              error={invQry.isError}
              errorMessage={queryErrorMessage(invQry.error)}
              empty={!invQry.isFetching && !(invQry.data?.items?.length)}
              emptyText={`No stock matches for “${invSearch}”.`}
              onRetry={() => void invQry.refetch()}
            >
              {(invQry.data?.items ?? []).map((item) => (
                <div
                  key={item.sku}
                  className="rounded-lg border border-[#d9e0ea] bg-white p-3"
                >
                  <p className="font-medium">
                    {item.name}{" "}
                    <span className="text-[#6b7280]">({item.sku})</span>
                  </p>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-[#6b7280]">
                        <tr>
                          <th className="py-1">Business</th>
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
                </div>
              ))}
            </PanelState>
          )}
        </div>
      )}

      {tab === "approvals" && (
        <div className="space-y-3">
          {!canDecide ? (
            <div className="rounded-lg border border-[#c9d7f5] bg-[#f5f8ff] px-3 py-2 text-sm text-[#1341a8]">
              Viewing as identity only.{" "}
              <Link href="/organizations" className="font-semibold underline">
                Enter a shop
              </Link>{" "}
              to approve or reject requests for that business.
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={apprFilter === "pending" ? "default" : "secondary"}
              onClick={() => setApprFilter("pending")}
            >
              Pending
            </Button>
            <Button
              type="button"
              size="sm"
              variant={apprFilter === "all" ? "default" : "secondary"}
              onClick={() => setApprFilter("all")}
            >
              All
            </Button>
          </div>
          <PanelState
            loading={apprQ.isPending}
            error={apprQ.isError}
            errorMessage={queryErrorMessage(apprQ.error)}
            empty={!apprQ.isPending && approvals.length === 0}
            emptyText={
              apprFilter === "pending"
                ? "No pending approvals."
                : "No approval history yet."
            }
            onRetry={() => void apprQ.refetch()}
          >
            <div className="overflow-x-auto rounded-lg border border-[#d9e0ea] bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-[#e5e7eb] text-left text-[#6b7280]">
                  <tr>
                    <th className="px-3 py-2">Business</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Requested</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {approvals.map((row) => {
                    const pending = row.status === "pending";
                    const amt = moneyNumber(row.amount);
                    return (
                      <tr key={row.id} className="border-t border-[#f3f4f6] align-top">
                        <td className="px-3 py-2 font-medium">
                          {businessName.get(row.tenantId) ?? row.tenantId.slice(0, 8)}
                        </td>
                        <td className="px-3 py-2 capitalize">
                          {row.type.replaceAll("_", " ")}
                          <p className="text-[0.65rem] text-[#8b9bb0]">
                            {row.entityType}
                          </p>
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {amt > 0 ? money(amt, currency) : "—"}
                        </td>
                        <td className="max-w-[14rem] px-3 py-2 text-[#374151]">
                          {row.reason || "—"}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              "inline-flex rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase",
                              row.status === "pending" &&
                                "bg-amber-50 text-amber-800",
                              row.status === "approved" &&
                                "bg-emerald-50 text-emerald-800",
                              row.status === "rejected" &&
                                "bg-rose-50 text-rose-800",
                              !["pending", "approved", "rejected"].includes(
                                row.status,
                              ) && "bg-[#f3f4f6] text-[#6b7280]",
                            )}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[#6b7280]">
                          {new Date(row.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-2">
                          {pending ? (
                            <div className="min-w-[11rem] space-y-1.5">
                              <Input
                                className="h-8 text-xs"
                                placeholder="Note (optional)"
                                value={decideNote[row.id] ?? ""}
                                disabled={!canDecide || decideMut.isPending}
                                onChange={(e) =>
                                  setDecideNote((cur) => ({
                                    ...cur,
                                    [row.id]: e.target.value,
                                  }))
                                }
                              />
                              <div className="flex gap-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={!canDecide || decideMut.isPending}
                                  onClick={() =>
                                    decideMut.mutate({
                                      id: row.id,
                                      decision: "approved",
                                      note: decideNote[row.id]?.trim() || undefined,
                                    })
                                  }
                                >
                                  Approve
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  disabled={!canDecide || decideMut.isPending}
                                  onClick={() =>
                                    decideMut.mutate({
                                      id: row.id,
                                      decision: "rejected",
                                      note: decideNote[row.id]?.trim() || undefined,
                                    })
                                  }
                                >
                                  Reject
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-[#8b9bb0]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </PanelState>
        </div>
      )}

      {tab === "staff" && (
        <PanelState
          loading={staffQ.isPending}
          error={staffQ.isError}
          errorMessage={queryErrorMessage(staffQ.error)}
          empty={!staffQ.isPending && !(staff?.memberships?.length)}
          emptyText="No shop memberships on this identity."
          onRetry={() => void staffQ.refetch()}
        >
          <div className="space-y-4">
            {staff?.identity ? (
              <div className="rounded-lg border border-[#d9e0ea] bg-white p-4">
                <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[#6b7280]">
                  Group identity
                </p>
                <p className="mt-1 text-base font-semibold text-[#111827]">
                  {staff.identity.fullName || "—"}
                </p>
                <p className="text-sm text-[#5a6b7d]">{staff.identity.email}</p>
                <p className="mt-1 text-xs text-[#6b7280]">
                  Role:{" "}
                  <span className="font-semibold capitalize text-[#0b1f33]">
                    {staff.identity.groupRole}
                  </span>
                </p>
              </div>
            ) : null}
            <div className="overflow-x-auto rounded-lg border border-[#d9e0ea] bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-[#e5e7eb] text-left text-[#6b7280]">
                  <tr>
                    <th className="px-3 py-2">Business</th>
                    <th className="px-3 py-2">Slug</th>
                    <th className="px-3 py-2">Shop roles</th>
                    <th className="px-3 py-2">In group</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(staff?.memberships ?? []).map((m) => (
                    <tr key={m.tenantId} className="border-t border-[#f3f4f6]">
                      <td className="px-3 py-2 font-medium">{m.name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-[#5a6b7d]">
                        {m.slug}
                      </td>
                      <td className="px-3 py-2">
                        {m.roles.length ? m.roles.join(", ") : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {m.inGroup ? "Yes" : "No"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href="/organizations"
                          className="text-xs font-semibold text-[#1a56db]"
                        >
                          Open shop
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </PanelState>
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
