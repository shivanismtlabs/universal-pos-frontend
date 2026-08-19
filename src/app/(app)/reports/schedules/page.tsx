"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { reportsApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";

type Row = {
  id: string;
  reportKey: string;
  cadence: "daily" | "weekly" | "monthly";
  recipientsText: string;
  enabled: boolean;
};

const KEY_LABELS: Record<string, string> = {
  sales_summary: "Sales summary (all modes)",
  daily_sales: "Daily activity",
  rental_ops: "Rental / assets",
  subscriptions: "Plans & memberships",
  inventory_utilization: "Inventory snapshot",
};

export default function ReportSchedulesPage() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);

  const data = useQuery({
    queryKey: ["reports", "schedules"],
    queryFn: () => reportsApi.listReportSchedules(),
  });

  useEffect(() => {
    if (!data.data) return;
    setRows(
      data.data.schedules.map((s) => ({
        id: s.id,
        reportKey: s.reportKey,
        cadence: s.cadence,
        recipientsText: s.recipients.join(", "),
        enabled: s.enabled,
      })),
    );
  }, [data.data]);

  const keys = data.data?.availableKeys ?? [
    "sales_summary",
    "daily_sales",
  ];

  const save = useMutation({
    mutationFn: () =>
      reportsApi.upsertReportSchedules(
        rows.map((r) => ({
          id: r.id,
          reportKey: r.reportKey,
          cadence: r.cadence,
          recipients: r.recipientsText
            .split(/[,;\s]+/)
            .map((x) => x.trim())
            .filter(Boolean),
          enabled: r.enabled,
        })),
      ),
    onSuccess: () => {
      toast.success("Schedules saved");
      void qc.invalidateQueries({ queryKey: ["reports", "schedules"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Save failed"),
  });

  const send = useMutation({
    mutationFn: (force: boolean) => reportsApi.sendReportSchedules(force),
    onSuccess: (res) => {
      toast.success(
        res.sent
          ? `Sent ${res.sent} report email(s)`
          : "No schedules were due (use Send now to force)",
      );
      void qc.invalidateQueries({ queryKey: ["reports", "schedules"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Send failed"),
  });

  const hint = useMemo(() => {
    const packs = data.data?.packs;
    if (!packs) return "";
    const on: string[] = [];
    if (packs.rental) on.push("rental");
    if (packs.subscription) on.push("plans");
    if (packs.inventory) on.push("inventory");
    return on.length
      ? `Extra packs for this business: ${on.join(", ")}`
      : "Core sales emails only — extra packs appear when you enable rental or subscription modes.";
  }, [data.data?.packs]);

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        reportKey: keys[0] ?? "sales_summary",
        cadence: "daily",
        recipientsText: "",
        enabled: true,
      },
    ]);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Scheduled report emails"
        subtitle="Email daily, weekly (Mondays), or monthly (1st) summaries. Same scheduler for every business type."
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={addRow}>
              Add schedule
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={send.isPending}
              onClick={() => send.mutate(true)}
            >
              Send now
            </Button>
            <Button
              size="sm"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              Save
            </Button>
          </div>
        }
      />
      <p className="text-xs text-[#8b9bb0]">{hint}</p>

      <div className="space-y-3">
        {rows.map((row, idx) => (
          <div
            key={row.id}
            className="grid gap-3 rounded-[12px] border border-[#e8edf4] bg-white p-4 sm:grid-cols-2"
          >
            <div className="field-shell">
              <Label className="text-xs">Report</Label>
              <Select
                className="mt-1 h-9"
                value={row.reportKey}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, i) =>
                      i === idx ? { ...r, reportKey: e.target.value } : r,
                    ),
                  )
                }
              >
                {keys.map((k) => (
                  <option key={k} value={k}>
                    {KEY_LABELS[k] ?? k}
                  </option>
                ))}
              </Select>
            </div>
            <div className="field-shell">
              <Label className="text-xs">Cadence</Label>
              <Select
                className="mt-1 h-9"
                value={row.cadence}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, i) =>
                      i === idx
                        ? {
                            ...r,
                            cadence: e.target.value as Row["cadence"],
                          }
                        : r,
                    ),
                  )
                }
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly (Monday)</option>
                <option value="monthly">Monthly (1st)</option>
              </Select>
            </div>
            <div className="field-shell sm:col-span-2">
              <Label className="text-xs">Recipients (comma-separated)</Label>
              <Input
                className="mt-1 h-9"
                value={row.recipientsText}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, i) =>
                      i === idx ? { ...r, recipientsText: e.target.value } : r,
                    ),
                  )
                }
                placeholder="owner@shop.com, accountant@shop.com"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-[#0b1f33]">
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, i) =>
                      i === idx ? { ...r, enabled: e.target.checked } : r,
                    ),
                  )
                }
              />
              Enabled
            </label>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="justify-self-end"
              onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
            >
              Remove
            </Button>
          </div>
        ))}
        {!rows.length ? (
          <p className="rounded-[12px] border border-dashed border-[#d9e0ea] bg-[#f8fafc] px-4 py-8 text-center text-sm text-[#8b9bb0]">
            No schedules yet. Add one for sales, or for rental / plans when those modes are on.
          </p>
        ) : null}
      </div>
    </div>
  );
}
