"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { tenantsApi, appsApi, iamApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { useAuthStore } from "@/lib/auth-store";
import { canManageStaff } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { canUseBiometrics, registerDeviceBiometric } from "@/lib/webauthn";

type Tab = "branding" | "tax" | "receipt" | "counter";

const BUSINESS_TYPES = [
  { id: "retail", label: "Retail" },
  { id: "grocery", label: "Grocery / F&B" },
  { id: "restaurant", label: "Restaurant / café" },
  { id: "salon", label: "Salon & spa" },
  { id: "service", label: "Service business" },
  { id: "other", label: "Other / general" },
] as const;

/**
 * Shop settings — branding, tax, receipt, counter policies.
 * Backend: PATCH /tenants/me
 */
export default function SettingsPage() {
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.user?.roles);
  const canEdit = canManageStaff(roles);
  const { data: boot, refetch, productName, businessType } = useBootstrap();
  const [tab, setTab] = useState<Tab>("branding");
  const [selectedBusinessType, setSelectedBusinessType] = useState("retail");

  const locationsQ = useQuery({
    queryKey: ["tenant-locations"],
    queryFn: () => tenantsApi.listLocations(),
    enabled: canEdit,
  });

  const [branding, setBranding] = useState({
    productName: "",
    tagline: "",
    currencyCode: "INR",
    locale: "en-IN",
    timezone: "Asia/Kolkata",
  });

  const [tax, setTax] = useState({
    gstin: "",
    taxMode: "in_gst",
    ratePercent: "5",
    inclusive: false,
  });

  const [receiptFooter, setReceiptFooter] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("15");
  const [pinSwitchEnabled, setPinSwitchEnabled] = useState(true);

  useEffect(() => {
    if (!boot?.tenant) return;
    const t = boot.tenant;
    const settings = (t.settings ?? {}) as Record<string, unknown>;
    const settingsTax =
      settings.tax && typeof settings.tax === "object"
        ? (settings.tax as Record<string, unknown>)
        : undefined;
    const settingsPos =
      settings.pos && typeof settings.pos === "object"
        ? (settings.pos as Record<string, unknown>)
        : undefined;

    const bt =
      (typeof settings.businessType === "string" && settings.businessType) ||
      boot.business?.type ||
      businessType ||
      "general";
    setSelectedBusinessType(bt);

    setBranding({
      productName: t.branding?.productName ?? t.name ?? "",
      tagline: t.branding?.tagline ?? "",
      currencyCode: t.currencyCode ?? "INR",
      locale: t.locale ?? "en-IN",
      timezone: t.timezone ?? "Asia/Kolkata",
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
    setPinSwitchEnabled(settingsPos?.pinSwitchEnabled !== false);
  }, [boot?.tenant, boot?.business?.type, businessType]);

  const invalidate = () => {
    void refetch();
    void qc.invalidateQueries({ queryKey: ["tenant-bootstrap"] });
  };

  const errMsg = (e: unknown) =>
    e instanceof ApiError
      ? e.messages.join(", ")
      : e instanceof Error
        ? e.message
        : "Could not save settings";

  const saveBrand = useMutation({
    mutationFn: () => {
      const name = branding.productName.trim();
      if (name.length < 2) throw new Error("Shop name must be at least 2 characters");
      return tenantsApi.updateMe({
        name,
        currencyCode: branding.currencyCode.trim().toUpperCase() || "INR",
        locale: branding.locale.trim() || "en-IN",
        timezone: branding.timezone.trim() || "Asia/Kolkata",
        branding: {
          productName: name,
          tagline: branding.tagline.trim(),
        },
      });
    },
    onSuccess: () => {
      toast.success("Branding saved");
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const saveBusinessType = useMutation({
    mutationFn: () =>
      appsApi.setBusinessConfig({
        businessType: selectedBusinessType,
        applyDefaultModes: false,
      }),
    onSuccess: () => {
      toast.success("Business type saved — item extras follow this profile");
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const saveTax = useMutation({
    mutationFn: () => {
      const rate = Number(tax.ratePercent);
      if (tax.taxMode !== "none" && (!Number.isFinite(rate) || rate < 0 || rate > 40)) {
        throw new Error("Tax rate must be between 0 and 40");
      }
      const gstin = tax.gstin.trim().toUpperCase();
      return tenantsApi.updateMe({
        gstin: gstin || "",
        taxId: gstin || "",
        taxMode: tax.taxMode,
        tax: {
          ratePercent: tax.taxMode === "none" ? 0 : rate,
          inclusive: tax.inclusive,
          receiptFooter: receiptFooter.trim(),
        },
      });
    },
    onSuccess: () => {
      toast.success("Tax settings saved");
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const saveReceipt = useMutation({
    mutationFn: () =>
      tenantsApi.updateMe({
        tax: { receiptFooter: receiptFooter.trim() },
      }),
    onSuccess: () => {
      toast.success("Receipt footer saved");
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const saveCounter = useMutation({
    mutationFn: () => {
      const max = Number(maxDiscount);
      if (!Number.isFinite(max) || max < 0 || max > 100) {
        throw new Error("Discount limit must be between 0 and 100");
      }
      return tenantsApi.updateMe({
        maxCashierDiscountPercent: max,
        pinSwitchEnabled,
      });
    },
    onSuccess: () => {
      toast.success("Counter settings saved");
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const tabs = useMemo(
    () =>
      [
        { id: "branding" as const, label: "Branding" },
        { id: "tax" as const, label: "Tax" },
        { id: "receipt" as const, label: "Receipt" },
        { id: "counter" as const, label: "Counter" },
      ] as const,
    [],
  );

  if (!canEdit) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center text-sm text-[#6b7280]">
        Only owners and managers can change shop settings.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        title="Settings"
        subtitle={
          productName
            ? `Shop profile, tax, receipts, and counter policies · ${productName}`
            : "Shop profile, tax, receipts, and counter policies"
        }
      />

      <div className="flex gap-1 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 rounded-lg px-2 py-2 text-[0.8rem] font-medium transition sm:px-3 sm:text-sm",
              tab === t.id
                ? "bg-white text-[#0b1f33] shadow-sm"
                : "text-[#6b7280] hover:text-[#0b1f33]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "branding" ? (
        <section className="space-y-3 rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <div className="rounded-xl border border-[#d9e0ea] bg-[#f8fafc] p-3.5">
            <Label>Business type *</Label>
            <p className="mt-0.5 text-[0.72rem] text-[#6b7280]">
              Universal profile — drives New Item extras (duration, pack size…)
              and default billing style. Not a separate app per industry.
            </p>
            <ul className="mt-3 grid grid-cols-2 gap-2">
              {BUSINESS_TYPES.map((bt) => {
                const on = selectedBusinessType === bt.id;
                return (
                  <li key={bt.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedBusinessType(bt.id)}
                      className={cn(
                        "w-full rounded-lg border px-2.5 py-2 text-left text-sm font-medium transition",
                        on
                          ? "border-[#1a56db] bg-[#e8eefb] text-[#1a56db]"
                          : "border-[#e5e7eb] bg-white text-[#0b1f33] hover:border-[#c5d0e0]",
                      )}
                    >
                      {bt.label}
                    </button>
                  </li>
                );
              })}
            </ul>
            <Button
              type="button"
              size="sm"
              className="mt-3"
              disabled={saveBusinessType.isPending}
              onClick={() => saveBusinessType.mutate()}
            >
              {saveBusinessType.isPending ? "Saving…" : "Save business type"}
            </Button>
          </div>

          <p className="text-xs text-[#6b7280]">
            Display name and currency used across the app, counter, and receipts.
          </p>
          <div>
            <Label>Shop name</Label>
            <Input
              className="mt-1"
              value={branding.productName}
              onChange={(e) =>
                setBranding((b) => ({ ...b, productName: e.target.value }))
              }
              placeholder="Your business name"
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
              placeholder="Short line under the shop name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Currency</Label>
              <Input
                className="mt-1"
                value={branding.currencyCode}
                onChange={(e) =>
                  setBranding((b) => ({
                    ...b,
                    currencyCode: e.target.value.toUpperCase(),
                  }))
                }
                maxLength={3}
                placeholder="INR"
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
                placeholder="en-IN"
              />
            </div>
          </div>
          <div>
            <Label>Timezone</Label>
            <Input
              className="mt-1"
              value={branding.timezone}
              onChange={(e) =>
                setBranding((b) => ({ ...b, timezone: e.target.value }))
              }
              placeholder="Asia/Kolkata"
            />
          </div>
          <Button
            disabled={
              saveBrand.isPending || branding.productName.trim().length < 2
            }
            onClick={() => saveBrand.mutate()}
          >
            {saveBrand.isPending ? "Saving…" : "Save branding"}
          </Button>
        </section>
      ) : null}

      {tab === "tax" ? (
        <section className="space-y-3 rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <p className="text-xs text-[#6b7280]">
            Applied on checkout. Historical orders keep their tax snapshot.
          </p>
          <div>
            <Label>GSTIN / tax ID</Label>
            <Input
              className="mt-1"
              value={tax.gstin}
              onChange={(e) =>
                setTax((t) => ({ ...t, gstin: e.target.value.toUpperCase() }))
              }
              placeholder="Optional for simple tax modes"
              maxLength={20}
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
              <option value="simple">Simple percentage</option>
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
            Catalog prices include tax
          </label>
          <Button
            disabled={saveTax.isPending}
            onClick={() => saveTax.mutate()}
          >
            {saveTax.isPending ? "Saving…" : "Save tax"}
          </Button>
        </section>
      ) : null}

      {tab === "receipt" ? (
        <section className="space-y-3 rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <p className="text-xs text-[#6b7280]">
            Footer text printed on receipts at the end of a sale.
          </p>
          <div>
            <Label>Receipt footer</Label>
            <textarea
              className="mt-1 min-h-[88px] w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#0b1f33] outline-none focus:border-[#1a56db]"
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              placeholder="Thank you for shopping with us"
              maxLength={500}
            />
            <p className="mt-1 text-xs text-[#8b9bb0]">
              {receiptFooter.length}/500
            </p>
          </div>
          <Button
            disabled={saveReceipt.isPending}
            onClick={() => saveReceipt.mutate()}
          >
            {saveReceipt.isPending ? "Saving…" : "Save receipt"}
          </Button>
        </section>
      ) : null}

      {tab === "counter" ? (
        <section className="space-y-4 rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <p className="text-xs text-[#6b7280]">
            Policies for shared terminals and cashier discounts.
          </p>
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
              Higher discounts require a manager. Default is 15%.
            </p>
          </div>
          <label className="flex items-start gap-2.5 text-sm text-[#0b1f33]">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={pinSwitchEnabled}
              onChange={(e) => setPinSwitchEnabled(e.target.checked)}
            />
            <span>
              <span className="font-medium">PIN staff switch</span>
              <span className="mt-0.5 block text-xs text-[#6b7280]">
                Allow staff to switch on the counter with a PIN without full
                re-login.
              </span>
            </span>
          </label>

          <div className="rounded-xl border border-[#eef1f4] bg-[#f7f9fc] px-3 py-2.5">
            <p className="text-[0.75rem] font-semibold text-[#0b1f33]">
              Locations
            </p>
            <ul className="mt-1.5 space-y-1 text-[0.8rem] text-[#5a6b7d]">
              {(locationsQ.data ?? boot?.locations ?? []).map((loc) => (
                <li key={loc.id}>
                  · {loc.name}
                  {loc.code ? ` (${loc.code})` : ""}
                  {loc.type ? ` · ${loc.type}` : ""}
                </li>
              ))}
              {!(locationsQ.data ?? boot?.locations ?? []).length ? (
                <li>No locations loaded</li>
              ) : null}
            </ul>
            <p className="mt-2 text-[0.7rem] text-[#8b9bb0]">
              Location create/edit is available to the shop owner when needed.
            </p>
          </div>

          <Button
            disabled={saveCounter.isPending}
            onClick={() => saveCounter.mutate()}
          >
            {saveCounter.isPending ? "Saving…" : "Save counter settings"}
          </Button>

          <div className="mt-6 border-t border-[#eef1f4] pt-4">
            <p className="text-sm font-semibold text-[#0b1f33]">
              Biometric login (optional)
            </p>
            <p className="mt-1 text-xs text-[#6b7280]">
              Register this device&apos;s fingerprint / face / Windows Hello to
              sign in without typing a password. Works only on supporting
              browsers over HTTPS (or localhost).
            </p>
            <BiometricSetup />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function BiometricSetup() {
  const qc = useQueryClient();
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(canUseBiometrics()), []);

  const creds = useQuery({
    queryKey: ["webauthn-creds"],
    queryFn: () => iamApi.webauthnCredentials(),
  });

  const registerBio = useMutation({
    mutationFn: async () => registerDeviceBiometric("This device"),
    onSuccess: () => {
      toast.success("Biometric credential registered — use it on the sign-in page");
      void qc.invalidateQueries({ queryKey: ["webauthn-creds"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError
          ? e.messages.join(", ")
          : e instanceof Error
            ? e.message
            : "Registration failed",
      ),
  });

  const del = useMutation({
    mutationFn: (id: string) => iamApi.webauthnDeleteCredential(id),
    onSuccess: () => {
      toast.success("Removed");
      void qc.invalidateQueries({ queryKey: ["webauthn-creds"] });
    },
  });

  return (
    <div className="mt-3 space-y-2">
      {!supported ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-100">
          Open Universal POS over HTTPS (or localhost) on a browser that supports
          passkeys / Windows Hello / Touch ID.
        </p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        disabled={registerBio.isPending || !supported}
        onClick={() => registerBio.mutate()}
      >
        {registerBio.isPending
          ? "Follow device prompt…"
          : "Register biometrics on this device"}
      </Button>
      <ul className="space-y-1 text-sm text-[#5a6b7d]">
        {(creds.data ?? []).map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 ring-1 ring-[#e5e7eb]"
          >
            <span>
              {c.label || "Credential"} ·{" "}
              {new Date(c.createdAt).toLocaleDateString()}
            </span>
            <button
              type="button"
              className="text-xs font-medium text-red-600"
              onClick={() => del.mutate(c.id)}
            >
              Remove
            </button>
          </li>
        ))}
        {!creds.isLoading && !(creds.data ?? []).length ? (
          <li className="text-xs text-[#8b9bb0]">No devices registered yet.</li>
        ) : null}
      </ul>
    </div>
  );
}
