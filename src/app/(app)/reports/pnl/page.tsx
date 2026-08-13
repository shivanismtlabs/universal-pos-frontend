"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { reportsApi, tenantsApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { cn, todayYmd } from "@/lib/utils";
import { downloadPnlExcel } from "@/lib/pnl-excel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

function pctLabel(n: number | null | undefined) {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : "";
  return sign + n.toFixed(1) + "%";
}

function pctTone(n: number | null | undefined) {
  if (n == null || n === 0) return "text-[#6b7280]";
  return n > 0 ? "text-emerald-700" : "text-rose-600";
}

export default function ProfitAndLossPage() {
  const { money } = useBootstrap();
  const [preset, setPreset] = useState("this_month");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-01";
  });
  const [to, setTo] = useState(todayYmd());
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [compare, setCompare] = useState(true);
  const [costingMethod, setCostingMethod] = useState<
    "" | "standard" | "weighted_average" | "fifo"
  >("");
  const [applied, setApplied] = useState({
    preset: "this_month",
    from: "",
    to: "",
    locationIds: [] as string[],
    compare: true,
    costingMethod: "" as "" | "standard" | "weighted_average" | "fifo",
  });

  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });

  const report = useQuery({
    queryKey: ["reports", "pnl", applied],
    queryFn: () =>
      reportsApi.profitAndLoss({
        preset: applied.preset,
        from: applied.preset === "custom" ? applied.from : undefined,
        to: applied.preset === "custom" ? applied.to : undefined,
        locationIds: applied.locationIds,
        compare: applied.compare,
        costingMethod: applied.costingMethod || undefined,
      }),
  });

  const data = report.data;
  const c = data?.current;
  const maxWaterfall = useMemo(() => {
    if (!data?.waterfall.length) return 1;
    return Math.max(
      1,
      ...data.waterfall.map((w) => Math.abs(w.value)),
    );
  }, [data?.waterfall]);

  function applyFilters() {
    setApplied({
      preset,
      from,
      to,
      locationIds,
      compare,
      costingMethod,
    });
  }

  function toggleLocation(id: string) {
    setLocationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function exportExcel() {
    if (!data || !c) {
      toast.error("Load the report first");
      return;
    }
    try {
      await downloadPnlExcel({
        tenantName: data.tenantName,
        periodLabel: data.period.from + " to " + data.period.to,
        currencyCode: data.currencyCode,
        costingMethod: data.costingMethod,
        lines: data.statement,
        current: c,
      });
      toast.success("Excel downloaded (with formulas)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Excel export failed");
    }
  }

  const card = "rounded-lg border border-[#e2e8f0] bg-white px-4 py-3";

  return (
    <div className="mx-auto max-w-5xl space-y-5 print:max-w-none">
      <PageHeader
        title="Profit & Loss"
        subtitle="Accountant-ready statement — revenue, COGS / service cost, expenses, and net profit."
        action={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button asChild variant="secondary" size="sm" className="h-9">
              <Link href="/reports/monthly">Monthly</Link>
            </Button>
            <Button asChild variant="secondary" size="sm" className="h-9">
              <Link href="/reports">All reports</Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-9"
              disabled={!data}
              onClick={() => void exportExcel()}
            >
              Excel (formulas)
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-9"
              disabled={!data}
              onClick={() => window.print()}
            >
              PDF / Print
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 rounded-lg border border-[#e2e8f0] bg-white p-4 lg:grid-cols-6 print:hidden">
        <div>
          <Label className="text-xs">Period</Label>
          <Select
            className="mt-1 h-9"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
          >
            <option value="this_month">This month</option>
            <option value="last_month">Last month</option>
            <option value="this_quarter">This quarter</option>
            <option value="this_year">This year</option>
            <option value="custom">Custom range</option>
          </Select>
        </div>
        {preset === "custom" ? (
          <>
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
          </>
        ) : null}
        <div>
          <Label className="text-xs">Costing method</Label>
          <Select
            className="mt-1 h-9"
            value={costingMethod}
            onChange={(e) =>
              setCostingMethod(
                e.target.value as "" | "standard" | "weighted_average" | "fifo",
              )
            }
          >
            <option value="">Tenant default</option>
            <option value="standard">Standard (catalog cost)</option>
            <option value="weighted_average">Weighted average (GRN)</option>
            <option value="fifo">FIFO (oldest GRN)</option>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Comparison</Label>
          <Select
            className="mt-1 h-9"
            value={compare ? "1" : "0"}
            onChange={(e) => setCompare(e.target.value === "1")}
          >
            <option value="1">Prior period on</option>
            <option value="0">Off</option>
          </Select>
        </div>
        <div className="flex items-end">
          <Button type="button" className="h-9 w-full" onClick={applyFilters}>
            Apply
          </Button>
        </div>
        <div className="lg:col-span-6">
          <Label className="text-xs">
            Branches (empty = consolidated all)
          </Label>
          <div className="mt-1 flex flex-wrap gap-2">
            {(locations.data ?? []).map((l) => {
              const on = locationIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => toggleLocation(l.id)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs",
                    on
                      ? "border-[#1a56db] bg-[#eff6ff] text-[#1a56db]"
                      : "border-[#e2e8f0] bg-white text-[#374151]",
                  )}
                >
                  {l.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {report.isLoading ? (
        <p className="text-sm text-[#6b7280]">Loading P&amp;L…</p>
      ) : report.isError ? (
        <p className="text-sm text-rose-600">
          Failed to load Profit &amp; Loss
          {report.error instanceof Error && report.error.message
            ? ": " + report.error.message
            : ". Restart the API if you just deployed report code."}
        </p>
      ) : data && c ? (
        <>
          <p className="text-xs text-[#6b7280]">
            {data.tenantName} · {data.period.from} → {data.period.to} ·{" "}
            {data.timezone} · {data.costingMethod}
          </p>
          <p className="text-[0.7rem] text-[#9ca3af]">{data.costingNote}</p>

          {data.comparison ? (
            <div className="grid gap-3 sm:grid-cols-4 print:hidden">
              {(
                [
                  ["Net sales Δ", data.comparison.netSalesPct],
                  ["Gross profit Δ", data.comparison.grossProfitPct],
                  ["OpEx Δ", data.comparison.opexPct],
                  ["Net profit Δ", data.comparison.netProfitPct],
                ] as const
              ).map(([label, pct]) => (
                <div key={label} className={card}>
                  <p className="text-[0.65rem] font-semibold tracking-wide text-[#9ca3af] uppercase">
                    {label}
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-lg font-semibold tabular-nums",
                      pctTone(pct),
                    )}
                  >
                    {pctLabel(pct)}
                  </p>
                  {data.previous ? (
                    <p className="text-[0.7rem] text-[#9ca3af]">
                      vs {data.previous.from} → {data.previous.to}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-5">
            <div
              className={cn(
                card,
                "lg:col-span-3 print:col-span-full print:border-0 print:shadow-none",
              )}
            >
              <div className="mb-3 border-b border-[#e2e8f0] pb-2">
                <p className="text-sm font-semibold">{data.tenantName}</p>
                <p className="text-xs text-[#6b7280]">
                  Profit &amp; Loss Statement · {data.period.from} to{" "}
                  {data.period.to}
                </p>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {data.statement.map((line) => {
                    if (line.section) {
                      return (
                        <tr key={line.key}>
                          <td
                            colSpan={3}
                            className="pt-3 pb-1 text-[0.7rem] font-semibold tracking-wide text-[#64748b] uppercase"
                          >
                            {line.label}
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr
                        key={line.key}
                        className={cn(
                          "border-t border-[#f1f5f9]",
                          line.bold && "border-[#cbd5e1]",
                        )}
                      >
                        <td
                          className={cn(
                            "py-1.5",
                            line.bold && "font-semibold text-[#0f172a]",
                            line.indent === 1 && "pl-4 text-[#475569]",
                            line.indent === 2 && "pl-8 text-[#64748b]",
                          )}
                        >
                          {line.label}
                        </td>
                        <td
                          className={cn(
                            "py-1.5 text-right tabular-nums",
                            line.bold && "font-semibold",
                            (line.amount ?? 0) < 0 && "text-[#64748b]",
                          )}
                        >
                          {line.amount == null
                            ? ""
                            : line.amount < 0
                              ? "(" + money(Math.abs(line.amount)) + ")"
                              : money(line.amount)}
                        </td>
                        <td className="w-16 py-1.5 text-right text-xs tabular-nums text-[#6b7280]">
                          {line.pct != null ? line.pct.toFixed(1) + "%" : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={cn(card, "lg:col-span-2 print:hidden")}>
              <p className="mb-3 text-sm font-semibold">Waterfall</p>
              <ul className="space-y-3">
                {data.waterfall.map((w) => {
                  const pct = Math.max(
                    4,
                    (Math.abs(w.value) / maxWaterfall) * 100,
                  );
                  const neg = w.value < 0;
                  return (
                    <li key={w.key}>
                      <div className="mb-1 flex justify-between gap-2 text-xs">
                        <span className="text-[#475569]">{w.label}</span>
                        <span
                          className={cn(
                            "tabular-nums font-medium",
                            neg ? "text-rose-600" : "text-[#0f172a]",
                          )}
                        >
                          {neg
                            ? "(" + money(Math.abs(w.value)) + ")"
                            : money(w.value)}
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-[#eef2f7]">
                        <div
                          className={
                            neg
                              ? "h-full rounded-full bg-rose-400"
                              : w.key === "net"
                                ? "h-full rounded-full bg-emerald-600"
                                : "h-full rounded-full bg-[#1a56db]"
                          }
                          style={{ width: pct + "%" }}
                        ></div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md bg-[#f8fafc] p-2">
                  <p className="text-[0.65rem] text-[#9ca3af] uppercase">
                    Gross margin
                  </p>
                  <p className="font-semibold tabular-nums">
                    {c.grossMarginPct != null
                      ? c.grossMarginPct.toFixed(1) + "%"
                      : "—"}
                  </p>
                </div>
                <div className="rounded-md bg-[#f8fafc] p-2">
                  <p className="text-[0.65rem] text-[#9ca3af] uppercase">
                    Net margin
                  </p>
                  <p className="font-semibold tabular-nums">
                    {c.netMarginPct != null
                      ? c.netMarginPct.toFixed(1) + "%"
                      : "—"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
