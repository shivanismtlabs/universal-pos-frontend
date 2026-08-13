"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { tenantsApi, appsApi, iamApi, posApi, expensesApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { useAuthStore } from "@/lib/auth-store";
import { canManageStaff } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/form";
import { PageHeader } from "@/components/page-header";
import { canUseBiometrics, registerDeviceBiometric } from "@/lib/webauthn";
import {
  expenseCategoryNameSchema,
  settingsBrandSchema,
  settingsCounterSchema,
  settingsTaxSchema,
  zodFieldErrors,
  zodMessages,
} from "@/lib/validations";

type Tab = "branding" | "tax" | "receipt" | "counter" | "returns" | "expenses";

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
  const [upiVpa, setUpiVpa] = useState("");
  const [upiPayeeName, setUpiPayeeName] = useState("");
  const [approvalThreshold, setApprovalThreshold] = useState("0");
  const [expenseApprovalThreshold, setExpenseApprovalThreshold] =
    useState("0");
  const [expCatName, setExpCatName] = useState("");
  const [expCatReceipt, setExpCatReceipt] = useState(false);
  const [expCatAccount, setExpCatAccount] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [reasonLabel, setReasonLabel] = useState("");
  const [reasonApplies, setReasonApplies] = useState("customer");
  const [brandErrors, setBrandErrors] = useState<Record<string, string>>({});
  const [taxErrors, setTaxErrors] = useState<Record<string, string>>({});
  const [counterErrors, setCounterErrors] = useState<Record<string, string>>(
    {},
  );

  const refundReasons = useQuery({
    queryKey: ["refund-reasons-settings"],
    queryFn: () => posApi.listRefundReasons(),
    enabled: canEdit && tab === "returns",
  });

  const expenseCategories = useQuery({
    queryKey: ["expense-categories-settings"],
    queryFn: () => expensesApi.listCategories(),
    enabled: canEdit && tab === "expenses",
  });


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
    const settingsReturns =
      settings.returns && typeof settings.returns === "object"
        ? (settings.returns as Record<string, unknown>)
        : undefined;
    const settingsExpenses =
      settings.expenses && typeof settings.expenses === "object"
        ? (settings.expenses as Record<string, unknown>)
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
        (() => {
          const raw = settingsTax?.ratePercent;
          if (typeof raw === "number" && Number.isFinite(raw)) return raw;
          if (typeof raw === "string" && raw.trim()) {
            const n = Number(raw.replace(/%/g, "").trim());
            if (Number.isFinite(n)) return n;
          }
          return t.taxMode === "vat" ? 20 : 5;
        })(),
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
    setUpiVpa(
      typeof settingsPos?.upiVpa === "string" ? settingsPos.upiVpa : "",
    );
    setUpiPayeeName(
      typeof settingsPos?.upiPayeeName === "string"
        ? settingsPos.upiPayeeName
        : "",
    );
    setApprovalThreshold(
      String(
        typeof settingsReturns?.approvalThresholdAmount === "number"
          ? settingsReturns.approvalThresholdAmount
          : typeof settingsReturns?.approvalThresholdAmount === "string"
            ? settingsReturns.approvalThresholdAmount
            : 0,
      ),
    );
    setExpenseApprovalThreshold(
      String(
        typeof settingsExpenses?.approvalThresholdAmount === "number"
          ? settingsExpenses.approvalThresholdAmount
          : typeof settingsExpenses?.approvalThresholdAmount === "string"
            ? settingsExpenses.approvalThresholdAmount
            : 0,
      ),
    );
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
      const parsed = settingsBrandSchema.safeParse(branding);
      if (!parsed.success) {
        setBrandErrors(zodFieldErrors(parsed.error));
        for (const m of zodMessages(parsed.error)) toast.error(m);
        throw new Error(zodMessages(parsed.error)[0] ?? "Invalid branding");
      }
      setBrandErrors({});
      const name = parsed.data.productName;
      return tenantsApi.updateMe({
        name,
        currencyCode: parsed.data.currencyCode || "INR",
        locale: parsed.data.locale || "en-IN",
        timezone: parsed.data.timezone || "Asia/Kolkata",
        branding: {
          productName: name,
          tagline: parsed.data.tagline?.trim() ?? "",
        },
      });
    },
    onSuccess: () => {
      toast.success("Branding saved");
      invalidate();
    },
    onError: (e) => {
      if (e instanceof ApiError || !(e instanceof Error)) toast.error(errMsg(e));
    },
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
      const taxMode = tax.taxMode as "in_gst" | "simple" | "vat" | "none";
      const parsed = settingsTaxSchema.safeParse({
        taxMode,
        ratePercent: taxMode === "none" ? 0 : tax.ratePercent,
        inclusive: tax.inclusive,
        gstin: tax.gstin,
      });
      if (!parsed.success) {
        setTaxErrors(zodFieldErrors(parsed.error));
        for (const m of zodMessages(parsed.error)) toast.error(m);
        throw new Error(zodMessages(parsed.error)[0] ?? "Invalid tax settings");
      }
      setTaxErrors({});
      const gstin = (parsed.data.gstin ?? "").trim().toUpperCase();
      return tenantsApi.updateMe({
        gstin: gstin || "",
        taxId: gstin || "",
        taxMode: parsed.data.taxMode,
        tax: {
          ratePercent:
            parsed.data.taxMode === "none" ? 0 : parsed.data.ratePercent,
          inclusive: parsed.data.inclusive,
          receiptFooter: receiptFooter.trim(),
        },
      });
    },
    onSuccess: () => {
      toast.success("Tax settings saved");
      invalidate();
    },
    onError: (e) => {
      if (e instanceof ApiError || !(e instanceof Error)) toast.error(errMsg(e));
    },
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
      const parsed = settingsCounterSchema.safeParse({
        maxDiscount,
        pinSwitchEnabled,
        upiVpa,
        upiPayeeName,
      });
      if (!parsed.success) {
        setCounterErrors(zodFieldErrors(parsed.error));
        for (const m of zodMessages(parsed.error)) toast.error(m);
        throw new Error(
          zodMessages(parsed.error)[0] ?? "Invalid counter settings",
        );
      }
      setCounterErrors({});
      return tenantsApi.updateMe({
        maxCashierDiscountPercent: parsed.data.maxDiscount,
        pinSwitchEnabled: parsed.data.pinSwitchEnabled,
        upiVpa: parsed.data.upiVpa.trim(),
        upiPayeeName: parsed.data.upiPayeeName?.trim() ?? "",
      });
    },
    onSuccess: () => {
      toast.success("Counter settings saved");
      invalidate();
    },
    onError: (e) => {
      if (e instanceof ApiError || !(e instanceof Error)) toast.error(errMsg(e));
    },
  });

  const saveReturns = useMutation({
    mutationFn: () =>
      tenantsApi.updateMe({
        settings: {
          returns: {
            approvalThresholdAmount: Number(approvalThreshold) || 0,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Return settings saved");
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const seedReasons = useMutation({
    mutationFn: () => posApi.seedRefundReasons(),
    onSuccess: () => {
      toast.success("Default return reasons ready");
      void qc.invalidateQueries({ queryKey: ["refund-reasons-settings"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const addReason = useMutation({
    mutationFn: () =>
      posApi.createRefundReason({
        code: reasonCode.trim(),
        label: reasonLabel.trim(),
        appliesTo: reasonApplies,
      }),
    onSuccess: () => {
      toast.success("Reason added");
      setReasonCode("");
      setReasonLabel("");
      void qc.invalidateQueries({ queryKey: ["refund-reasons-settings"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const saveExpenses = useMutation({
    mutationFn: () =>
      tenantsApi.updateMe({
        settings: {
          expenses: {
            approvalThresholdAmount: Number(expenseApprovalThreshold) || 0,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Expense settings saved");
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const seedExpenseCategories = useMutation({
    mutationFn: () => expensesApi.seedCategories(),
    onSuccess: () => {
      toast.success("Default expense categories ready");
      void qc.invalidateQueries({ queryKey: ["expense-categories-settings"] });
      void qc.invalidateQueries({ queryKey: ["expense-categories"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const addExpenseCategory = useMutation({
    mutationFn: () => {
      const parsed = expenseCategoryNameSchema.safeParse({ name: expCatName });
      if (!parsed.success) {
        for (const m of zodMessages(parsed.error)) toast.error(m);
        throw new Error(zodMessages(parsed.error)[0] ?? "Invalid category");
      }
      return expensesApi.createCategory({
        name: parsed.data.name,
        receiptRequired: expCatReceipt,
        accountCode: expCatAccount.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Category added");
      setExpCatName("");
      setExpCatReceipt(false);
      setExpCatAccount("");
      void qc.invalidateQueries({ queryKey: ["expense-categories-settings"] });
      void qc.invalidateQueries({ queryKey: ["expense-categories"] });
    },
    onError: (e) => {
      if (e instanceof ApiError || !(e instanceof Error)) toast.error(errMsg(e));
    },
  });

  const toggleExpenseCategory = useMutation({
    mutationFn: (row: { id: string; isActive?: boolean }) =>
      expensesApi.updateCategory(row.id, { isActive: row.isActive === false }),
    onSuccess: () => {
      toast.success("Category updated");
      void qc.invalidateQueries({ queryKey: ["expense-categories-settings"] });
      void qc.invalidateQueries({ queryKey: ["expense-categories"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const deleteExpenseCategory = useMutation({
    mutationFn: (id: string) => expensesApi.deleteCategory(id),
    onSuccess: () => {
      toast.success("Category removed");
      void qc.invalidateQueries({ queryKey: ["expense-categories-settings"] });
      void qc.invalidateQueries({ queryKey: ["expense-categories"] });
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
        { id: "returns" as const, label: "Returns" },
        { id: "expenses" as const, label: "Expenses" },
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
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Settings"
        subtitle={
          productName
            ? `Shop profile, tax, receipts, and counter policies · ${productName}`
            : "Shop profile, tax, receipts, and counter policies"
        }
      />

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "shrink-0 flex-1 rounded-lg px-2 py-2 text-[0.8rem] font-medium transition sm:px-3 sm:text-sm",
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
            <FieldError message={brandErrors.productName} />
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
            <FieldError message={brandErrors.tagline} />
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
              <FieldError message={brandErrors.currencyCode} />
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
              <FieldError message={brandErrors.locale} />
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
            <FieldError message={brandErrors.timezone} />
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
            <FieldError message={taxErrors.gstin} />
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
            <FieldError message={taxErrors.taxMode} />
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
            <FieldError message={taxErrors.ratePercent} />
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
              <p className="text-[0.75rem] text-[#8b9bb0]">
                Off = tax is added on top of ticket due (recommended). On =
                prices already include tax, so Due matches Subtotal.
              </p>
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
            <FieldError message={counterErrors.maxDiscount} />
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

          <div>
            <Label>Shop UPI ID (for QR payments)</Label>
            <Input
              className="mt-1"
              placeholder="shop@okaxis"
              value={upiVpa}
              onChange={(e) => setUpiVpa(e.target.value)}
              autoComplete="off"
            />
            <FieldError message={counterErrors.upiVpa} />
            <p className="mt-1 text-xs text-[#6b7280]">
              Required for Counter → QR. Without this, PhonePe/GPay show a
              technical glitch when customers scan.
            </p>
          </div>
          <div>
            <Label>UPI payee name</Label>
            <Input
              className="mt-1"
              placeholder={productName || "Shop name"}
              value={upiPayeeName}
              onChange={(e) => setUpiPayeeName(e.target.value)}
            />
            <FieldError message={counterErrors.upiPayeeName} />
          </div>

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
              sign in without typing a password. Use the same browser address
              every time (prefer{" "}
              <span className="font-mono">http://localhost:3000</span> — not
              127.0.0.1). Works on HTTPS or localhost.
            </p>
            <BiometricSetup />
          </div>
        </section>
      ) : null}

      {tab === "returns" ? (
        <section className="space-y-4 rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <p className="text-xs text-[#6b7280]">
            Customer return approval threshold and reason catalog. Supplier
            reasons use applies-to = supplier/both.
          </p>
          <div>
            <Label>Auto-approve returns up to (amount)</Label>
            <Input
              className="mt-1"
              type="number"
              min={0}
              value={approvalThreshold}
              onChange={(e) => setApprovalThreshold(e.target.value)}
            />
            <p className="mt-1 text-xs text-[#6b7280]">
              Cashiers can complete returns at or below this amount without
              manager approval. 0 = always require approval.
            </p>
          </div>
          <Button
            disabled={saveReturns.isPending}
            onClick={() => saveReturns.mutate()}
          >
            {saveReturns.isPending ? "Saving…" : "Save return settings"}
          </Button>

          <div className="border-t border-[#eef1f4] pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[#0b1f33]">
                Return reasons
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={seedReasons.isPending}
                onClick={() => seedReasons.mutate()}
              >
                Seed defaults
              </Button>
            </div>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
              {(refundReasons.data ?? []).map((r) => (
                <li
                  key={r.id}
                  className="flex justify-between gap-2 rounded-md bg-[#f7f9fc] px-2 py-1.5"
                >
                  <span>
                    {r.label}{" "}
                    <span className="font-mono text-[0.65rem] text-[#8b9bb0]">
                      {r.code}
                    </span>
                  </span>
                  <span className="text-[0.65rem] uppercase text-[#5a6b7d]">
                    {r.appliesTo ?? "customer"}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Code"
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
              />
              <Input
                placeholder="Label"
                value={reasonLabel}
                onChange={(e) => setReasonLabel(e.target.value)}
              />
              <select
                className="h-10 rounded-lg border border-[#e4e9f0] bg-white px-3 text-sm"
                value={reasonApplies}
                onChange={(e) => setReasonApplies(e.target.value)}
              >
                <option value="customer">Customer</option>
                <option value="supplier">Supplier</option>
                <option value="both">Both</option>
              </select>
              <Button
                type="button"
                disabled={
                  !reasonCode.trim() ||
                  !reasonLabel.trim() ||
                  addReason.isPending
                }
                onClick={() => addReason.mutate()}
              >
                Add reason
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "expenses" ? (
        <section className="space-y-4 rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <p className="text-xs text-[#6b7280]">
            Expense approval threshold and category catalog. Petty cash
            replenishment is not an expense — manage funds on the Expenses desk.
          </p>
          <div>
            <Label>Auto-approve expenses up to (amount)</Label>
            <Input
              className="mt-1"
              type="number"
              min={0}
              value={expenseApprovalThreshold}
              onChange={(e) => setExpenseApprovalThreshold(e.target.value)}
            />
            <p className="mt-1 text-xs text-[#6b7280]">
              Expenses at or below this amount can skip manager approval when
              policy allows. 0 = always require approval.
            </p>
          </div>
          <Button
            disabled={saveExpenses.isPending}
            onClick={() => saveExpenses.mutate()}
          >
            {saveExpenses.isPending ? "Saving…" : "Save expense settings"}
          </Button>

          <div className="border-t border-[#eef1f4] pt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#111827]">
                Expense categories
              </h3>
              <Button
                type="button"
                variant="secondary"
                disabled={seedExpenseCategories.isPending}
                onClick={() => seedExpenseCategories.mutate()}
              >
                {seedExpenseCategories.isPending
                  ? "Seeding…"
                  : "Seed defaults"}
              </Button>
            </div>
            <ul className="mb-3 space-y-1 text-sm text-[#5a6b7d]">
              {(expenseCategories.data ?? []).map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-[#f9fafb] px-2 py-1.5 ring-1 ring-[#e5e7eb]"
                >
                  <span>
                    {c.name}
                    {c.receiptRequired ? " · receipt required" : ""}
                    {c.accountCode ? ` · ${c.accountCode}` : ""}
                    {c.isActive === false ? " · inactive" : ""}
                  </span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      className="text-xs font-medium text-[#1a56db]"
                      onClick={() => toggleExpenseCategory.mutate(c)}
                    >
                      {c.isActive === false ? "Activate" : "Deactivate"}
                    </button>
                    <button
                      type="button"
                      className="text-xs font-medium text-red-600"
                      onClick={() => deleteExpenseCategory.mutate(c.id)}
                    >
                      Delete
                    </button>
                  </span>
                </li>
              ))}
              {!expenseCategories.isLoading &&
              !(expenseCategories.data ?? []).length ? (
                <li className="text-xs text-[#8b9bb0]">
                  No categories yet — seed defaults or add one below.
                </li>
              ) : null}
            </ul>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Category name"
                value={expCatName}
                onChange={(e) => setExpCatName(e.target.value)}
              />
              <Input
                placeholder="Account code (optional)"
                value={expCatAccount}
                onChange={(e) => setExpCatAccount(e.target.value)}
              />
            </div>
            <label className="mt-2 flex items-center gap-2 text-sm text-[#5a6b7d]">
              <input
                type="checkbox"
                checked={expCatReceipt}
                onChange={(e) => setExpCatReceipt(e.target.checked)}
              />
              Receipt required for this category
            </label>
            <Button
              className="mt-3"
              type="button"
              disabled={!expCatName.trim() || addExpenseCategory.isPending}
              onClick={() => addExpenseCategory.mutate()}
            >
              {addExpenseCategory.isPending ? "Adding…" : "Add category"}
            </Button>
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
