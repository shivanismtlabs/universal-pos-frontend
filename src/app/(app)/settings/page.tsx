"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { tenantsApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { useAuthStore } from "@/lib/auth-store";
import { canManageStaff } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";

type Tab = "branding" | "tax" | "receipt";

/**
 * Shop settings hub — Branding | Tax | Receipt.
 * Branding / tax / receipt for any shop.
 */
export default function SettingsPage() {
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.user?.roles);
  const canEdit = canManageStaff(roles);
  const { data: boot, refetch, productName } = useBootstrap();
  const [tab, setTab] = useState<Tab>("branding");

  const [branding, setBranding] = useState({
    productName: "",
    tagline: "",
    currencyCode: "INR",
    locale: "en-IN",
  });

  const [tax, setTax] = useState({
    gstin: "",
    taxMode: "in_gst",
    ratePercent: "5",
    inclusive: false,
  });

  const [receiptFooter, setReceiptFooter] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("15");

  useEffect(() => {
    if (!boot?.tenant) return;
    const t = boot.tenant;
    const settingsTax =
      t.settings && typeof t.settings === "object"
        ? ((t.settings as Record<string, unknown>).tax as
            | Record<string, unknown>
            | undefined)
        : undefined;
    const settingsPos =
      t.settings && typeof t.settings === "object"
        ? ((t.settings as Record<string, unknown>).pos as
            | Record<string, unknown>
            | undefined)
        : undefined;

    setBranding({
      productName: t.branding?.productName ?? t.name ?? "",
      tagline: t.branding?.tagline ?? "",
      currencyCode: t.currencyCode ?? "INR",
      locale: t.locale ?? "en-IN",
    });
    setTax({
      gstin: t.gstin ?? t.taxId ?? "",
      taxMode: t.taxMode ?? "in_gst",
      ratePercent: String(
        typeof settingsTax?.ratePercent === "number"
          ? settingsTax.ratePercent
          : 5,
      ),
      inclusive: settingsTax?.inclusive === true,
    });
    setReceiptFooter(
      typeof settingsTax?.receiptFooter === "string"
        ? settingsTax.receiptFooter
        : "",
    );
    setMaxDiscount(
      String(
        typeof settingsPos?.maxCashierDiscountPercent === "number"
          ? settingsPos.maxCashierDiscountPercent
          : 15,
      ),
    );
  }, [boot?.tenant]);

  const saveBrand = useMutation({
    mutationFn: () =>
      tenantsApi.updateMe({
        currencyCode: branding.currencyCode.trim().toUpperCase(),
        locale: branding.locale.trim(),
        branding: {
          productName: branding.productName.trim(),
          tagline: branding.tagline.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Branding saved");
      refetch();
      void qc.invalidateQueries({ queryKey: ["tenant-bootstrap"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const saveTax = useMutation({
    mutationFn: () => {
      const rate = Number(tax.ratePercent);
      if (!Number.isFinite(rate) || rate < 0 || rate > 40) {
        throw new Error("Tax rate must be between 0 and 40");
      }
      return tenantsApi.updateMe({
        gstin: tax.gstin.trim() || undefined,
        taxId: tax.gstin.trim() || undefined,
        taxMode: tax.taxMode,
        tax: {
          ratePercent: rate,
          inclusive: tax.inclusive,
          receiptFooter: receiptFooter.trim(),
        },
        maxCashierDiscountPercent: Number.isFinite(Number(maxDiscount))
          ? Number(maxDiscount)
          : 15,
      });
    },
    onSuccess: () => {
      toast.success("Tax settings saved — applies to next checkout");
      refetch();
      void qc.invalidateQueries({ queryKey: ["tenant-bootstrap"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError
          ? e.messages.join(", ")
          : e instanceof Error
            ? e.message
            : "Failed",
      ),
  });

  const tabs = useMemo(
    () =>
      [
        { id: "branding" as const, label: "Branding" },
        { id: "tax" as const, label: "Tax" },
        { id: "receipt" as const, label: "Receipt" },
      ] as const,
    [],
  );

  if (!canEdit) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center text-sm text-[#6b7280]">
        Only admin/manager can edit shop settings.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        title="Shop branding"
        subtitle={
          productName
            ? `Logo, name, tax, and receipt footer · showing as ${productName}`
            : "Logo, name, tax, and receipt footer for any shop"
        }
      />

      <div className="flex gap-1 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition",
              tab === t.id
                ? "bg-white text-[#0b1f33] shadow-sm"
                : "text-[#6b7280] hover:text-[#0b1f33]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "branding" && (
        <section className="space-y-3 rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <div>
            <Label>Shop title</Label>
            <Input
              className="mt-1"
              value={branding.productName}
              onChange={(e) =>
                setBranding((b) => ({ ...b, productName: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Tagline</Label>
            <Input
              className="mt-1"
              value={branding.tagline}
              onChange={(e) =>
                setBranding((b) => ({ ...b, tagline: e.target.value }))
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Currency</Label>
              <Input
                className="mt-1"
                value={branding.currencyCode}
                onChange={(e) =>
                  setBranding((b) => ({ ...b, currencyCode: e.target.value }))
                }
                maxLength={3}
              />
            </div>
            <div>
              <Label>Locale</Label>
              <Input
                className="mt-1"
                value={branding.locale}
                onChange={(e) =>
                  setBranding((b) => ({ ...b, locale: e.target.value }))
                }
              />
            </div>
          </div>
          <Button
            disabled={
              saveBrand.isPending || branding.productName.trim().length < 2
            }
            onClick={() => saveBrand.mutate()}
          >
            Save branding
          </Button>
        </section>
      )}

      {tab === "tax" && (
        <section className="space-y-3 rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <p className="text-xs text-[#6b7280]">
            Tax applies on POS checkout and GST invoices. Snapshot is stored on
            each order so later rate changes do not rewrite history.
          </p>
          <div>
            <Label>GSTIN / Tax ID</Label>
            <Input
              className="mt-1"
              value={tax.gstin}
              onChange={(e) =>
                setTax((t) => ({ ...t, gstin: e.target.value.toUpperCase() }))
              }
              placeholder="27AAAAA0000A1Z5"
              maxLength={15}
            />
          </div>
          <div>
            <Label>Tax mode</Label>
            <select
              className="mt-1 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm"
              value={tax.taxMode}
              onChange={(e) =>
                setTax((t) => ({ ...t, taxMode: e.target.value }))
              }
            >
              <option value="in_gst">India GST</option>
              <option value="simple">Simple %</option>
              <option value="vat">VAT</option>
              <option value="none">No tax</option>
            </select>
          </div>
          <div>
            <Label>Rate (%)</Label>
            <Input
              className="mt-1"
              type="number"
              min={0}
              max={40}
              step="0.01"
              value={tax.ratePercent}
              onChange={(e) =>
                setTax((t) => ({ ...t, ratePercent: e.target.value }))
              }
              disabled={tax.taxMode === "none"}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-[#0b1f33]">
            <input
              type="checkbox"
              checked={tax.inclusive}
              onChange={(e) =>
                setTax((t) => ({ ...t, inclusive: e.target.checked }))
              }
              disabled={tax.taxMode === "none"}
            />
            Prices include tax
          </label>
          <div>
            <Label>Max cashier discount (%)</Label>
            <Input
              className="mt-1"
              type="number"
              min={0}
              max={100}
              value={maxDiscount}
              onChange={(e) => setMaxDiscount(e.target.value)}
            />
            <p className="mt-1 text-xs text-[#6b7280]">
              Cashiers above this need a manager login. Default 15.
            </p>
          </div>
          <Button
            disabled={saveTax.isPending}
            onClick={() => saveTax.mutate()}
          >
            Save tax
          </Button>
        </section>
      )}

      {tab === "receipt" && (
        <section className="space-y-3 rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <div>
            <Label>Receipt footer</Label>
            <Input
              className="mt-1"
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              placeholder="Thank you for your purchase"
            />
          </div>
          <Button
            disabled={saveTax.isPending}
            onClick={() => saveTax.mutate()}
          >
            Save receipt
          </Button>
        </section>
      )}
    </div>
  );
}
