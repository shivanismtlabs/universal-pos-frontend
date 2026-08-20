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
import { GEO_COUNTRIES } from "@/lib/geo";
import { PageHeader } from "@/components/page-header";


function blankForm() {
  return {
    enabled: false,
    basis: "accrual",
    baseCurrency: "",
    fiscalYearStartMonth: "4",
    taxCountry: "",
    inventoryAccountingEnabled: false,
    cogsEnabled: false,
  };
}

export default function AccountingSettingsPage() {
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.user?.roles);
  const can = canFinance(roles);
  const q = useQuery({
    queryKey: ["accounting", "settings"],
    queryFn: () => accountingApi.settings(),
    enabled: can,
  });
  const [form, setForm] = useState(blankForm);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!q.data || hydrated) return;
    setForm({
      enabled: q.data.enabled,
      basis: q.data.basis,
      baseCurrency: q.data.baseCurrency,
      fiscalYearStartMonth: String(q.data.fiscalYearStartMonth),
      taxCountry: q.data.taxCountry,
      inventoryAccountingEnabled: q.data.inventoryAccountingEnabled,
      cogsEnabled: q.data.cogsEnabled,
    });
    setHydrated(true);
  }, [q.data, hydrated]);

  const save = useMutation({
    mutationFn: () => {
      const currency = form.baseCurrency.trim().toUpperCase();
      const tax = form.taxCountry.trim().toUpperCase();
      if (currency.length !== 3) {
        throw new Error("Base currency must be a 3-letter code (e.g. INR)");
      }
      if (tax.length !== 2) {
        throw new Error("Tax country must be a 2-letter code (e.g. IN)");
      }
      return accountingApi.updateSettings({
        enabled: form.enabled,
        basis: form.basis,
        baseCurrency: currency,
        fiscalYearStartMonth: Number(form.fiscalYearStartMonth),
        taxCountry: tax,
        inventoryAccountingEnabled: form.inventoryAccountingEnabled,
        cogsEnabled: form.cogsEnabled,
      });
    },
    onSuccess: () => {
      toast.success("Accounting settings saved");
      setForm(blankForm());
      void qc.invalidateQueries({ queryKey: ["accounting"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : e.message || "Save failed"),
  });

  if (!can) {
    return (
      <p className="text-sm text-[#6b7280]">
        Accounting settings require a finance role.
      </p>
    );
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
            checked={form.enabled}
            onChange={(e) =>
              setForm((f) => ({ ...f, enabled: e.target.checked }))
            }
          />
          Accounting enabled
        </label>
        <p className="text-[12px] text-[#6b7280]">
          When enabled, POS sales, payments, returns, purchases, and expenses
          post journals in the same database transaction. External sync runs
          after commit.
        </p>
        <div>
          <Label>Accounting basis</Label>
          <Select
            value={form.basis}
            onChange={(e) => setForm((f) => ({ ...f, basis: e.target.value }))}
          >
            <option value="accrual">Accrual</option>
            <option value="cash">Cash</option>
          </Select>
        </div>
        <div>
          <Label>Base currency</Label>
          <Input
            value={form.baseCurrency}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                baseCurrency: e.target.value.toUpperCase(),
              }))
            }
            maxLength={3}
            placeholder="INR"
          />
        </div>
        <div>
          <Label>Fiscal year start month</Label>
          <Select
            value={form.fiscalYearStartMonth}
            onChange={(e) =>
              setForm((f) => ({ ...f, fiscalYearStartMonth: e.target.value }))
            }
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
          <Select
            value={form.taxCountry}
            onChange={(e) =>
              setForm((f) => ({ ...f, taxCountry: e.target.value }))
            }
          >
            <option value="">Select country</option>
            {!GEO_COUNTRIES.some((c) => c.code === form.taxCountry) &&
            form.taxCountry ? (
              <option value={form.taxCountry}>{form.taxCountry}</option>
            ) : null}
            {GEO_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.code})
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.inventoryAccountingEnabled}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                inventoryAccountingEnabled: e.target.checked,
              }))
            }
          />
          Inventory accounting enabled
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.cogsEnabled}
            onChange={(e) =>
              setForm((f) => ({ ...f, cogsEnabled: e.target.checked }))
            }
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
