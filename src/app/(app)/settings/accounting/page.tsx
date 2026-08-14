"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpen } from "lucide-react";
import { accountingApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { canFinance } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";

export default function AccountingSettingsPage() {
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.user?.roles);
  const can = canFinance(roles);
  const q = useQuery({
    queryKey: ["accounting", "settings"],
    queryFn: () => accountingApi.settings(),
    enabled: can,
  });
  const [enabled, setEnabled] = useState(false);
  const [basis, setBasis] = useState("accrual");
  const [baseCurrency, setBaseCurrency] = useState("INR");
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState("4");
  const [taxCountry, setTaxCountry] = useState("IN");
  const [inventoryAccountingEnabled, setInv] = useState(false);
  const [cogsEnabled, setCogs] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!q.data || hydrated) return;
    setEnabled(q.data.enabled);
    setBasis(q.data.basis);
    setBaseCurrency(q.data.baseCurrency);
    setFiscalYearStartMonth(String(q.data.fiscalYearStartMonth));
    setTaxCountry(q.data.taxCountry);
    setInv(q.data.inventoryAccountingEnabled);
    setCogs(q.data.cogsEnabled);
    setHydrated(true);
  }, [q.data, hydrated]);

  const save = useMutation({
    mutationFn: () =>
      accountingApi.updateSettings({
        enabled,
        basis,
        baseCurrency,
        fiscalYearStartMonth: Number(fiscalYearStartMonth),
        taxCountry,
        inventoryAccountingEnabled,
        cogsEnabled,
      }),
    onSuccess: () => {
      toast.success("Accounting settings saved");
      void qc.invalidateQueries({ queryKey: ["accounting"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Save failed"),
  });

  if (!can) {
    return <p className="text-sm text-[#6b7280]">Accounting settings require a finance role.</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Accounting"
        subtitle="Enable the general ledger, choose cash or accrual, and optionally post inventory/COGS. External adapters live under Accounting → Integrations."
      />
      <div className="space-y-4 rounded-lg border border-[#e5e7eb] bg-white p-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Accounting enabled
        </label>
        <p className="text-[12px] text-[#6b7280]">
          When enabled, POS sales, payments, returns, purchases, and expenses post journals in the same database transaction. External sync runs after commit.
        </p>
        <div>
          <Label>Accounting basis</Label>
          <Select value={basis} onChange={(e) => setBasis(e.target.value)}>
            <option value="accrual">Accrual</option>
            <option value="cash">Cash</option>
          </Select>
        </div>
        <div>
          <Label>Base currency</Label>
          <Input
            value={baseCurrency}
            onChange={(e) => setBaseCurrency(e.target.value.toUpperCase())}
            maxLength={3}
          />
        </div>
        <div>
          <Label>Fiscal year start month</Label>
          <Select
            value={fiscalYearStartMonth}
            onChange={(e) => setFiscalYearStartMonth(e.target.value)}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {new Date(2000, i, 1).toLocaleString("en", { month: "long" })}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Tax country</Label>
          <Input value={taxCountry} onChange={(e) => setTaxCountry(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={inventoryAccountingEnabled}
            onChange={(e) => setInv(e.target.checked)}
          />
          Inventory accounting enabled
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={cogsEnabled}
            onChange={(e) => setCogs(e.target.checked)}
          />
          COGS enabled
        </label>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <BookOpen className="h-4 w-4" />
          Save
        </Button>
      </div>
    </div>
  );
}
