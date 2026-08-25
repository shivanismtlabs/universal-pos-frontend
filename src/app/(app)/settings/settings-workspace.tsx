"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import {
  tenantsApi,
  appsApi,
  iamApi,
  posApi,
  expensesApi,
  notifyApi,
} from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { useAuthStore } from "@/lib/auth-store";
import { canManageStaff } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { mediaUrl } from "@/lib/utils";
import { prepareProductImageDataUrl } from "@/lib/image-prepare";
import { canUseBiometrics, biometricBlockReason, registerDeviceBiometric } from "@/lib/webauthn";
import { useSetupReturn } from "@/lib/use-setup-return";
import {
  expenseCategoryNameSchema,
  settingsBrandSchema,
  settingsCounterSchema,
  settingsTaxSchema,
  zodFieldErrors,
  zodMessages,
} from "@/lib/validations";
import { GEO_COUNTRIES, geoDial } from "@/lib/geo";
import { CountryStateFields } from "@/components/country-state-fields";

export type SettingsSection =
  | "branding"
  | "tax"
  | "receipt"
  | "counter"
  | "returns"
  | "expenses"
  | "notifications";

type Tab = SettingsSection;

const SECTION_META: Record<
  Tab,
  { title: string; subtitle: string }
> = {
  branding: {
    title: "Business Profile",
    subtitle:
      "Shop identity, contact, fiscal calendar, and branding used on receipts",
  },
  tax: {
    title: "Tax",
    subtitle: "Tax registration, rate, and how tax is applied at checkout",
  },
  receipt: {
    title: "Receipt",
    subtitle: "Footer text printed on invoices and receipts",
  },
  counter: {
    title: "Counter",
    subtitle: "Discount limits, PIN switch, and UPI for the checkout desk",
  },
  returns: {
    title: "Returns",
    subtitle: "Approval threshold and reason codes for refunds",
  },
  expenses: {
    title: "Expense categories",
    subtitle: "Categories, receipt rules, and approval threshold",
  },
  notifications: {
    title: "Notifications",
    subtitle: "In-app and push alerts for this shop",
  },
};


const FISCAL_YEAR_OPTIONS = [
  { id: "April", label: "April – March" },
  { id: "January", label: "January – December" },
  { id: "July", label: "July – June" },
  { id: "October", label: "October – September" },
] as const;

const DATE_FORMAT_OPTIONS = [
  { id: "dd MMM yyyy", label: "dd MMM yyyy  [ 17 Aug 2026 ]" },
  { id: "dd/MM/yyyy", label: "dd/MM/yyyy  [ 17/08/2026 ]" },
  { id: "MM/dd/yyyy", label: "MM/dd/yyyy  [ 08/17/2026 ]" },
  { id: "yyyy-MM-dd", label: "yyyy-MM-dd  [ 2026-08-17 ]" },
] as const;

const LANGUAGE_OPTIONS = [
  { id: "en-IN", label: "English (India)" },
  { id: "hi-IN", label: "Hindi" },
  { id: "en-US", label: "English (US)" },
] as const;

const TIMEZONE_OPTIONS = [
  { id: "Asia/Kolkata", label: "(GMT 05:30) India Standard Time" },
  { id: "Asia/Dubai", label: "(GMT 04:00) Gulf Standard Time" },
  { id: "UTC", label: "(GMT 00:00) UTC" },
  { id: "America/New_York", label: "(GMT -05:00) Eastern Time" },
] as const;

const CURRENCY_OPTIONS = ["INR", "AED", "USD", "GBP", "EUR", "SGD"] as const;

function emptyProfileExtras() {
  return {
    countryCode: "IN",
    phoneCountryCode: "+91",
    phone: "",
    email: "",
    website: "",
    logoUrl: "",
    fiscalYearStart: "April",
    dateFormat: "dd MMM yyyy",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    pan: "",
    organizationType: "",
  };
}

const BUSINESS_TYPES = [
  { id: "retail", label: "Retail" },
  { id: "grocery", label: "Grocery" },
  { id: "restaurant", label: "Restaurant" },
  { id: "cafe", label: "Café" },
  { id: "bakery", label: "Bakery" },
  { id: "qsr", label: "QSR / fast food" },
  { id: "cloud_kitchen", label: "Cloud kitchen" },
  { id: "food_truck", label: "Food truck" },
  { id: "salon", label: "Salon & spa" },
  { id: "service", label: "Service business" },
  { id: "rental", label: "Rental" },
  { id: "subscription", label: "Subscription / gym" },
  { id: "other", label: "Other / general" },
] as const;

/**
 * Shop settings — branding, tax, receipt, counter policies.
 * Backend: PATCH /tenants/me
 */
function SettingsPageInner({ lockedSection }: { lockedSection: Tab }) {
  const qc = useQueryClient();
  const { fromSetupFlow, redirectAfterSetupSave } = useSetupReturn();
  const roles = useAuthStore((s) => s.user?.roles);
  const canEdit = canManageStaff(roles);
  const { data: boot, refetch, productName, businessType } = useBootstrap();
  const tab = lockedSection;
  const [selectedBusinessType, setSelectedBusinessType] = useState("retail");

  function goBackToGettingStartedIfNeeded() {
    if (!fromSetupFlow) return;
    redirectAfterSetupSave();
  }

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
  const [profile, setProfile] = useState(emptyProfileExtras);

  const [tax, setTax] = useState({
    gstin: "",
    taxMode: "in_gst",
    ratePercent: "5",
    inclusive: false,
  });

  const [receiptFooter, setReceiptFooter] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("15");
  const [pinSwitchEnabled, setPinSwitchEnabled] = useState(true);
  const [customerRequiredAtCheckout, setCustomerRequiredAtCheckout] =
    useState(false);
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
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoDrag, setLogoDrag] = useState(false);

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

    const rawBt =
      (typeof settings.businessType === "string" && settings.businessType) ||
      boot.business?.type ||
      businessType ||
      "retail";
    // UI uses "other"; registry also has legacy "general" — same template
    setSelectedBusinessType(rawBt === "general" ? "other" : rawBt);

    setBranding({
      productName: t.branding?.productName ?? t.name ?? "",
      tagline: t.branding?.tagline ?? "",
      currencyCode: t.currencyCode ?? "INR",
      locale: t.locale ?? "en-IN",
      timezone: t.timezone ?? "Asia/Kolkata",
    });
    const orgProfile =
      settings.organizationProfile &&
      typeof settings.organizationProfile === "object"
        ? (settings.organizationProfile as Record<string, unknown>)
        : {};
    const rawPhone =
      typeof orgProfile.phone === "string" ? orgProfile.phone : "";
    const storedCode =
      typeof orgProfile.phoneCountryCode === "string"
        ? orgProfile.phoneCountryCode
        : "";
    let phoneCountryCode = storedCode || "+91";
    let phoneLocal = rawPhone;
    const codeMatch = rawPhone.match(/^(\+\d{1,4})\s*(.*)$/);
    if (!storedCode && codeMatch) {
      phoneCountryCode = codeMatch[1] ?? "+91";
      phoneLocal = codeMatch[2] ?? "";
    }
    setProfile({
      countryCode:
        typeof orgProfile.countryCode === "string" && orgProfile.countryCode
          ? orgProfile.countryCode
          : "IN",
      phoneCountryCode,
      phone: phoneLocal,
      email:
        typeof orgProfile.email === "string"
          ? orgProfile.email
          : "",
      website:
        typeof orgProfile.website === "string" ? orgProfile.website : "",
      logoUrl:
        typeof t.branding?.logoUrl === "string" ? t.branding.logoUrl : "",
      fiscalYearStart:
        typeof orgProfile.fiscalYearStart === "string" &&
        orgProfile.fiscalYearStart
          ? orgProfile.fiscalYearStart
          : "April",
      dateFormat:
        typeof orgProfile.dateFormat === "string" && orgProfile.dateFormat
          ? orgProfile.dateFormat
          : "dd MMM yyyy",
      addressLine1:
        typeof orgProfile.addressLine1 === "string"
          ? orgProfile.addressLine1
          : "",
      addressLine2:
        typeof orgProfile.addressLine2 === "string"
          ? orgProfile.addressLine2
          : "",
      city: typeof orgProfile.city === "string" ? orgProfile.city : "",
      state: typeof orgProfile.state === "string" ? orgProfile.state : "",
      postalCode:
        typeof orgProfile.postalCode === "string"
          ? orgProfile.postalCode
          : "",
      pan: typeof orgProfile.pan === "string" ? orgProfile.pan : "",
      organizationType:
        typeof orgProfile.organizationType === "string"
          ? orgProfile.organizationType
          : "",
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
    setCustomerRequiredAtCheckout(settingsPos?.customerRequired === true);
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
    mutationFn: async () => {
      const parsed = settingsBrandSchema.safeParse(branding);
      if (!parsed.success) {
        setBrandErrors(zodFieldErrors(parsed.error));
        for (const m of zodMessages(parsed.error)) toast.error(m);
        throw new Error(zodMessages(parsed.error)[0] ?? "Invalid branding");
      }
      setBrandErrors({});
      const name = parsed.data.productName;
      const phoneLocal = profile.phone.trim();
      const phone = phoneLocal
        ? `${profile.phoneCountryCode} ${phoneLocal}`.trim()
        : "";
      const typeId =
        selectedBusinessType === "general" ? "other" : selectedBusinessType;
      const prevTypeRaw =
        (boot?.tenant?.settings as Record<string, unknown> | undefined)
          ?.businessType ??
        boot?.business?.type ??
        "";
      const prevType =
        prevTypeRaw === "general" ? "other" : String(prevTypeRaw || "");
      const typeChanged = Boolean(typeId) && typeId !== prevType;
      // Only re-apply commerce/capability defaults when the shop type actually changes
      // (same path as create-shop setup). Profile edits alone must not reset modes.
      await appsApi.setBusinessConfig({
        businessType: typeId,
        applyDefaultModes: typeChanged,
        applyDefaultCapabilities: typeChanged,
      });
      const logoTrimmed = profile.logoUrl.trim();
      return tenantsApi.updateMe({
        name,
        currencyCode: parsed.data.currencyCode || "INR",
        locale: parsed.data.locale || "en-IN",
        timezone: parsed.data.timezone || "Asia/Kolkata",
        branding: {
          productName: name,
          tagline: parsed.data.tagline?.trim() ?? "",
          // Omit empty logoUrl so Save cannot wipe a just-uploaded logo
          ...(logoTrimmed ? { logoUrl: logoTrimmed } : {}),
        },
        settings: {
          organizationProfile: {
            phone: phone || null,
            phoneCountryCode: profile.phoneCountryCode,
            email: profile.email.trim() || null,
            website: profile.website.trim() || null,
            countryCode: profile.countryCode || "IN",
            fiscalYearStart: profile.fiscalYearStart || null,
            dateFormat: profile.dateFormat || null,
            addressLine1: profile.addressLine1.trim() || null,
            addressLine2: profile.addressLine2.trim() || null,
            city: profile.city.trim() || null,
            state: profile.state.trim() || null,
            postalCode: profile.postalCode.trim() || null,
            pan: profile.pan.trim().toUpperCase() || null,
            organizationType: profile.organizationType.trim() || null,
            timezone: parsed.data.timezone || "Asia/Kolkata",
            locale: parsed.data.locale || "en-IN",
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Business profile saved");
      invalidate();
      goBackToGettingStartedIfNeeded();
    },
    onError: (e) => {
      if (e instanceof ApiError || !(e instanceof Error)) toast.error(errMsg(e));
    },
  });

  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      const imageBase64 = await prepareProductImageDataUrl(file);
      return tenantsApi.uploadLogo(imageBase64);
    },
    onSuccess: (res) => {
      const url =
        res && typeof res === "object" && "logoUrl" in res
          ? String((res as { logoUrl?: string }).logoUrl || "")
          : "";
      if (url) setProfile((p) => ({ ...p, logoUrl: url }));
      toast.success("Logo uploaded");
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const clearLogo = useMutation({
    mutationFn: () => tenantsApi.removeLogo(),
    onSuccess: () => {
      setProfile((p) => ({ ...p, logoUrl: "" }));
      toast.success("Logo removed");
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
      goBackToGettingStartedIfNeeded();
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
      goBackToGettingStartedIfNeeded();
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
      // UPI lives under settings.pos so older API builds (without upiVpa DTO fields) still accept it
      return tenantsApi.updateMe({
        maxCashierDiscountPercent: parsed.data.maxDiscount,
        pinSwitchEnabled: parsed.data.pinSwitchEnabled,
        settings: {
          pos: {
            upiVpa: parsed.data.upiVpa.trim() || null,
            upiPayeeName: parsed.data.upiPayeeName?.trim() || null,
            customerRequired: customerRequiredAtCheckout,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Counter settings saved");
      invalidate();
      goBackToGettingStartedIfNeeded();
    },
    onError: (e) => {
      const raw = errMsg(e);
      if (/upiVpa|upiPayeeName|upivpa/i.test(raw)) {
        toast.error(
          "Could not save UPI settings — update the API server, then try again",
        );
        return;
      }
      toast.error(raw);
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

  const notifTypesQ = useQuery({
    queryKey: ["notify-tenant-settings"],
    queryFn: () => notifyApi.tenantNotificationSettings(),
    enabled: canEdit && tab === "notifications",
  });

  const [notifEnabled, setNotifEnabled] = useState<Record<string, boolean>>(
    {},
  );

  useEffect(() => {
    if (!notifTypesQ.data?.types) return;
    const map: Record<string, boolean> = {};
    for (const t of notifTypesQ.data.types) map[t.code] = t.enabled;
    setNotifEnabled(map);
  }, [notifTypesQ.data]);

  const saveNotifications = useMutation({
    mutationFn: () =>
      notifyApi.updateTenantNotificationSettings(
        Object.entries(notifEnabled).map(([code, enabled]) => ({
          code,
          enabled,
        })),
      ),
    onSuccess: () => {
      toast.success("Notification settings saved");
      void qc.invalidateQueries({ queryKey: ["notify-tenant-settings"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const hasLocations = (locationsQ.data?.length ?? 0) > 0;
  const meta = SECTION_META[tab];

  if (!canEdit) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center text-sm text-[#6b7280]">
        Only owners and managers can change shop settings.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          title={meta.title}
          eyebrow="Business settings"
          subtitle={
            tab === "branding" && boot?.tenant?.id
              ? `ID: ${boot.tenant.id}${productName ? ` · ${productName}` : ""}`
              : productName
                ? `${meta.subtitle} · ${productName}`
                : meta.subtitle
          }
        />

      {tab === "branding" ? (
        <section className="space-y-5 rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <div className="grid gap-5 lg:grid-cols-[1fr_220px]">
            <div className="space-y-3">
              <div>
                <Label>Business name *</Label>
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
              <div>
                <Label>Business type *</Label>
                <Select
                className="mt-1 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm"
                value={selectedBusinessType}
                onChange={(e) => setSelectedBusinessType(e.target.value)}
              >
                {BUSINESS_TYPES.some((bt) => bt.id === selectedBusinessType) ? null : (
                  <option value={selectedBusinessType}>
                    {selectedBusinessType}
                  </option>
                )}
                {BUSINESS_TYPES.map((bt) => (
                    <option key={bt.id} value={bt.id}>
                      {bt.label}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-[0.72rem] text-[#6b7280]">
                  Same setup template as when the shop was created. Changing type
                  reapplies that template’s modes &amp; capabilities.{" "}
                  <span className="font-medium text-[#475569]">Other / general</span>{" "}
                  uses the universal profile (no industry-only fields).
                </p>
              </div>
              <div>
                <Label>Phone *</Label>
                <div className="mt-1 flex gap-2">
                  <Select
                    className="w-[7.25rem] rounded-lg border border-[#e5e7eb] bg-white px-2 py-2 text-sm"
                    value={profile.phoneCountryCode}
                    onChange={(e) =>
                      setProfile((p) => ({
                        ...p,
                        phoneCountryCode: e.target.value,
                      }))
                    }
                  >
                    {GEO_COUNTRIES.map((c) => (
                      <option key={c.code} value={c.dial}>
                        {c.dial} {c.code}
                      </option>
                    ))}
                  </Select>
                  <Input
                    className="flex-1"
                    value={profile.phone}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, phone: e.target.value }))
                    }
                    placeholder="9876543210"
                    inputMode="tel"
                  />
                </div>
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  className="mt-1"
                  type="email"
                  value={profile.email}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, email: e.target.value }))
                  }
                  placeholder="shop@example.com"
                />
              </div>
              <div>
                <Label>Website</Label>
                <Input
                  className="mt-1"
                  value={profile.website}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, website: e.target.value }))
                  }
                  placeholder="e.g. yourshop.com"
                />
              </div>
            </div>
            <div>
              <Label>Upload your logo</Label>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                disabled={!canEdit || uploadLogo.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) uploadLogo.mutate(file);
                }}
              />
              <button
                type="button"
                disabled={!canEdit || uploadLogo.isPending}
                onClick={() => logoInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (canEdit) setLogoDrag(true);
                }}
                onDragLeave={() => setLogoDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setLogoDrag(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file && canEdit) uploadLogo.mutate(file);
                }}
                className={`mt-1 flex min-h-[140px] w-full flex-col items-center justify-center rounded-lg border border-dashed px-3 py-4 text-center transition-colors ${
                  logoDrag
                    ? "border-[#1a56db] bg-[#eff6ff]"
                    : "border-[#c5d0e0] bg-[#f8fafc] hover:border-[#1a56db]"
                }`}
              >
                {profile.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mediaUrl(profile.logoUrl) || profile.logoUrl}
                    alt="Shop logo"
                    className="mb-2 max-h-[72px] max-w-[230px] object-contain"
                  />
                ) : (
                  <p className="text-sm font-medium text-[#374151]">
                    {uploadLogo.isPending
                      ? "Uploading…"
                      : "Click or drop a photo"}
                  </p>
                )}
                <p className="text-xs text-[#6b7280]">
                  JPEG, PNG, WebP or GIF · up to 1 MB preferred
                </p>
              </button>
              {profile.logoUrl && canEdit ? (
                <button
                  type="button"
                  className="mt-2 text-xs font-medium text-[#b91c1c]"
                  disabled={clearLogo.isPending}
                  onClick={() => clearLogo.mutate()}
                >
                  Remove logo
                </button>
              ) : null}
              <p className="mt-1.5 text-[0.7rem] leading-snug text-[#6b7280]">
                This logo will appear on receipts and shop branding. Preferred
                size: 230px × 60px @ 72 DPI.
              </p>
            </div>
          </div>

          {hasLocations ? (
            <div className="rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-3.5 py-2.5 text-sm text-[#1e3a8a]">
              <span className="font-semibold">Address:</span> Branch street
              addresses are managed on each location.{" "}
              <Link
                href="/settings/locations"
                className="font-semibold text-[#1a56db] underline-offset-2 hover:underline"
              >
                Go to Locations
              </Link>
            </div>
          ) : (
            <p className="text-xs text-[#6b7280]">
              Registered / legal address (optional). Branch street addresses live
              on Locations after you add stores.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Address line 1</Label>
              <Input
                className="mt-1"
                value={profile.addressLine1}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, addressLine1: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Address line 2</Label>
              <Input
                className="mt-1"
                value={profile.addressLine2}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, addressLine2: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
              <CountryStateFields
                countryCode={profile.countryCode}
                state={profile.state}
                countryRequired
                countryLabel="Business location"
                onCountry={(code) =>
                  setProfile((p) => ({
                    ...p,
                    countryCode: code,
                    phoneCountryCode: geoDial(code) || p.phoneCountryCode,
                  }))
                }
                onState={(state) => setProfile((p) => ({ ...p, state }))}
              />
            </div>
            <div>
              <Label>City</Label>
              <Input
                className="mt-1"
                value={profile.city}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, city: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Postal code</Label>
              <Input
                className="mt-1"
                value={profile.postalCode}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, postalCode: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>PAN</Label>
              <Input
                className="mt-1"
                value={profile.pan}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    pan: e.target.value.toUpperCase(),
                  }))
                }
                maxLength={10}
              />
            </div>
            <div>
              <Label>Organization type</Label>
              <Input
                className="mt-1"
                value={profile.organizationType}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    organizationType: e.target.value,
                  }))
                }
                placeholder="Private limited, proprietorship…"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Fiscal year</Label>
              <Select
                className="mt-1 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm"
                value={profile.fiscalYearStart}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    fiscalYearStart: e.target.value,
                  }))
                }
              >
                {FISCAL_YEAR_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Base currency</Label>
              <Select
                className="mt-1 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm"
                value={
                  CURRENCY_OPTIONS.includes(
                    branding.currencyCode as (typeof CURRENCY_OPTIONS)[number],
                  )
                    ? branding.currencyCode
                    : branding.currencyCode
                }
                onChange={(e) =>
                  setBranding((b) => ({
                    ...b,
                    currencyCode: e.target.value.toUpperCase(),
                  }))
                }
              >
                {!CURRENCY_OPTIONS.includes(
                  branding.currencyCode as (typeof CURRENCY_OPTIONS)[number],
                ) ? (
                  <option value={branding.currencyCode}>
                    {branding.currencyCode}
                  </option>
                ) : null}
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <FieldError message={brandErrors.currencyCode} />
            </div>
            <div>
              <Label>Time zone</Label>
              <Select
                className="mt-1 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm"
                value={branding.timezone}
                onChange={(e) =>
                  setBranding((b) => ({ ...b, timezone: e.target.value }))
                }
              >
                {!TIMEZONE_OPTIONS.some((z) => z.id === branding.timezone) ? (
                  <option value={branding.timezone}>
                    {branding.timezone}
                  </option>
                ) : null}
                {TIMEZONE_OPTIONS.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.label}
                  </option>
                ))}
              </Select>
              <FieldError message={brandErrors.timezone} />
            </div>
            <div>
              <Label>Date format</Label>
              <Select
                className="mt-1 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm"
                value={profile.dateFormat}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, dateFormat: e.target.value }))
                }
              >
                {!DATE_FORMAT_OPTIONS.some((d) => d.id === profile.dateFormat) ? (
                  <option value={profile.dateFormat}>
                    {profile.dateFormat}
                  </option>
                ) : null}
                {DATE_FORMAT_OPTIONS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Language</Label>
              <Select
                className="mt-1 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm"
                value={branding.locale}
                onChange={(e) =>
                  setBranding((b) => ({ ...b, locale: e.target.value }))
                }
              >
                {!LANGUAGE_OPTIONS.some((l) => l.id === branding.locale) ? (
                  <option value={branding.locale}>{branding.locale}</option>
                ) : null}
                {LANGUAGE_OPTIONS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </Select>
              <FieldError message={brandErrors.locale} />
            </div>
          </div>

          <Button
            disabled={
              saveBrand.isPending || branding.productName.trim().length < 2
            }
            onClick={() => saveBrand.mutate()}
          >
            {saveBrand.isPending ? "Saving…" : "Save"}
          </Button>
        </section>
      ) : null}

      {tab === "tax" ? (
        <section className="space-y-3 rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <p className="text-xs text-[#6b7280]">
            Applied on checkout. Historical orders keep their tax snapshot.
          </p>
          <div>
            <Label>Tax registration number</Label>
            <Input
              className="mt-1"
              value={tax.gstin}
              onChange={(e) =>
                setTax((t) => ({ ...t, gstin: e.target.value.toUpperCase() }))
              }
              placeholder="GSTIN, VAT number, EIN, ABN, or leave blank"
              maxLength={20}
            />
            <FieldError message={taxErrors.gstin} />
          </div>
          <div>
            <Label>Tax mode</Label>
            <Select
              className="mt-1 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm"
              value={tax.taxMode}
              onChange={(e) =>
                setTax((t) => ({ ...t, taxMode: e.target.value }))
              }
            >
              <option value="in_gst">India GST (CGST + SGST / IGST)</option>
              <option value="simple">Simple percentage (any country)</option>
              <option value="vat">VAT (EU / UK / UAE / AU)</option>
              <option value="none">No tax</option>
            </Select>
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
          <label className="flex items-start gap-2.5 text-sm text-[#0b1f33]">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={customerRequiredAtCheckout}
              onChange={(e) => setCustomerRequiredAtCheckout(e.target.checked)}
            />
            <span>
              <span className="font-medium">Require customer at checkout</span>
              <span className="mt-0.5 block text-xs text-[#6b7280]">
                Useful for service, rentals, subscriptions, and credit sales.
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
              <Select
                className="h-10 rounded-lg border border-[#e4e9f0] bg-white px-3 text-sm"
                value={reasonApplies}
                onChange={(e) => setReasonApplies(e.target.value)}
              >
                <option value="customer">Customer</option>
                <option value="supplier">Supplier</option>
                <option value="both">Both</option>
              </Select>
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

      {tab === "notifications" ? (
        <section className="space-y-4 rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <div>
            <h2 className="text-sm font-semibold text-[#0b1f33]">
              Notification types
            </h2>
            <p className="mt-1 text-xs text-[#6b7280]">
              Enable or disable shop-wide alerts. Delivered in-app and via
              Firebase Cloud Messaging (browser push) when configured. Staff can
              mute channels from preferences. Low stock is on by default.
            </p>
          </div>
          <ul className="divide-y divide-[#eef2f8] rounded-xl border border-[#eef2f8]">
            {(notifTypesQ.data?.types ?? []).map((t) => (
              <li
                key={t.code}
                className="flex items-start justify-between gap-3 px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#0b1f33]">
                    {t.label}
                    {t.urgent ? (
                      <span className="ml-2 rounded bg-[#fef3c7] px-1.5 py-0.5 text-[0.65rem] font-semibold text-[#b45309]">
                        Urgent
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[0.75rem] text-[#6b7280]">
                    {t.description}
                  </p>
                </div>
                <label className="flex shrink-0 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={notifEnabled[t.code] ?? t.enabled}
                    onChange={(e) =>
                      setNotifEnabled((m) => ({
                        ...m,
                        [t.code]: e.target.checked,
                      }))
                    }
                  />
                  {notifEnabled[t.code] ?? t.enabled ? "On" : "Off"}
                </label>
              </li>
            ))}
            {notifTypesQ.isLoading ? (
              <li className="px-3 py-6 text-center text-sm text-[#8b9bb0]">
                Loading…
              </li>
            ) : null}
          </ul>
          <Button
            disabled={saveNotifications.isPending || notifTypesQ.isLoading}
            onClick={() => saveNotifications.mutate()}
          >
            {saveNotifications.isPending
              ? "Saving…"
              : "Save notification settings"}
          </Button>
        </section>
      ) : null}
    </div>
  );
}

export function SettingsWorkspace({ section }: { section: Tab }) {
  return (
    <Suspense
      fallback={
        <p className="py-10 text-center text-sm text-[#6b7280]">Loading…</p>
      }
    >
      <SettingsPageInner lockedSection={section} />
    </Suspense>
  );
}

export default function SettingsPage() {
  return <SettingsWorkspace section="branding" />;
}

function BiometricSetup() {
  const qc = useQueryClient();
  const [supported, setSupported] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  useEffect(() => {
    setSupported(canUseBiometrics());
    setBlockReason(biometricBlockReason());
  }, []);

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
          {blockReason ||
            "Open Universal POS over HTTPS (or localhost) on a browser that supports passkeys / Windows Hello / Touch ID."}
        </p>
      ) : (
        <p className="text-xs text-[#5a6b7d]">
          Register once on this device, then use fingerprint / Windows Hello on
          the sign-in page with the same email.
        </p>
      )}
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
