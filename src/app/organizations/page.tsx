"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion } from "motion/react";
import {
  Building2,
  Plus,
  LogOut,
  ShoppingBag,
  Wheat,
  UtensilsCrossed,
  Scissors,
  Wrench,
  LayoutGrid,
  Check,
  Trash2,
  Package,
  CreditCard,
  Users,
  BarChart3,
  Store,
  ShieldCheck,
  ArrowLeftRight,
  Boxes,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FieldError } from "@/components/ui/form";
import { authApi, appsApi, type PortalSessionResponse } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { applyPortalResponse } from "@/lib/auth-portal";
import { TotpChallengeForm, is2faChallenge } from "@/components/totp-challenge-form";
import { cn } from "@/lib/utils";
import {
  INDIAN_STATES,
  citiesForState,
  isKnownIndianState,
} from "@/lib/india-locations";
import { phoneSchema } from "@/lib/validations";

const createOrgSchema = z
  .object({
    businessType: z.string().min(1, "Select a business type"),
    organizationName: z
      .string()
      .trim()
      .min(2, "Organization name must be at least 2 characters")
      .max(100, "Organization name is too long"),
    phone: phoneSchema.optional().or(z.literal("")),
    addressLine1: z
      .string()
      .trim()
      .min(3, "Enter street address")
      .max(255, "Address is too long"),
    state: z
      .string()
      .min(1, "Select a state")
      .refine(isKnownIndianState, "Select a valid state"),
    city: z.string().min(1, "Select a city"),
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Enter a valid 6-digit PIN code"),
    currencyCode: z.string().min(3).max(3),
    fiscalYearStart: z.string().min(1),
    inventoryStartDate: z.string().min(1, "Inventory start date is required"),
    taxId: z
      .string()
      .trim()
      .max(20)
      .refine(
        (v) => !v || /^[0-9A-Z]{15}$/i.test(v.replace(/\s/g, "")),
        "GSTIN must be 15 characters (letters/numbers)",
      ),
    storeName: z.string().trim().max(100).optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    const cities = citiesForState(v.state);
    if (cities.length && !cities.includes(v.city)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["city"],
        message: "Select a city for the chosen state",
      });
    }
  });

type CreateForm = z.infer<typeof createOrgSchema>;

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

/**
 * Retail vs Grocery stay separate — genuinely different item extras:
 * retail: brand / size / colour · grocery: packSize / expiryTracked
 */
const BUSINESS_TYPES: Array<{
  id: string;
  label: string;
  detail: string;
  Icon: IconType;
}> = [
  {
    id: "retail",
    label: "Retail",
    detail: "Brand, size & colour on items · apparel / gift / electronics",
    Icon: ShoppingBag,
  },
  {
    id: "grocery",
    label: "Grocery / F&B retail",
    detail: "Pack size, expiry track · kg / L units & bulk stock",
    Icon: Wheat,
  },
  {
    id: "restaurant",
    label: "Restaurant / café",
    detail: "Menu items · table meta on orders",
    Icon: UtensilsCrossed,
  },
  {
    id: "salon",
    label: "Salon & spa",
    detail: "Duration, appointments, services + retail",
    Icon: Scissors,
  },
  {
    id: "service",
    label: "Service business",
    detail: "Billable services (gym, repair, consultancy…)",
    Icon: Wrench,
  },
  {
    id: "other",
    label: "Other / general",
    detail: "Universal blank slate — add your own item fields",
    Icon: LayoutGrid,
  },
];

/** Left rail — Zoho POS–style “what you get” (commerce-mode agnostic). */
const PLATFORM_HIGHLIGHTS: Array<{
  title: string;
  detail: string;
  Icon: IconType;
}> = [
  {
    title: "Items & stock",
    detail: "Catalog, Stock on Hand, reorder points, multi-location qty",
    Icon: Package,
  },
  {
    title: "Counter billing",
    detail: "Fast checkout, tax, discounts, multi-pay, park & resume",
    Icon: CreditCard,
  },
  {
    title: "Customers & perks",
    detail: "Profiles, dues, loyalty path, and store credit when you need it",
    Icon: Users,
  },
  {
    title: "Purchases & suppliers",
    detail: "Receive stock, supplier invoices, and returns to vendor",
    Icon: Boxes,
  },
  {
    title: "Branches & transfers",
    detail: "One org, many stores — move stock between locations",
    Icon: ArrowLeftRight,
  },
  {
    title: "Reports & exports",
    detail: "Sales, inventory, and CSV/Excel when you need to share",
    Icon: BarChart3,
  },
  {
    title: "Team & PIN switch",
    detail: "Roles, counter PIN unlock, and session controls",
    Icon: ShieldCheck,
  },
  {
    title: "One Universal POS",
    detail: "Sale, rental, service, or subscription — not separate industry apps",
    Icon: Store,
  },
];

export default function OrganizationsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const identityToken = useAuthStore((s) => s.identityToken);
  const identity = useAuthStore((s) => s.identity);
  const accessToken = useAuthStore((s) => s.accessToken);
  const clear = useAuthStore((s) => s.clear);
  /** Wait for client + zustand rehydrate before using tokens (prevents crash/redirect thrash) */
  const [hydrated, setHydrated] = useState(false);
  const [orgs, setOrgs] = useState<
    NonNullable<PortalSessionResponse["organizations"]>
  >([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [entering, setEntering] = useState<string | null>(null);
  const [totpToken, setTotpToken] = useState<string | null>(null);
  const [showCustomFields, setShowCustomFields] = useState(false);
  const [customFields, setCustomFields] = useState<string[]>([""]);

  const form = useForm<CreateForm>({
    resolver: zodResolver(createOrgSchema),
    mode: "onBlur",
    defaultValues: {
      businessType: "retail",
      organizationName: "",
      phone: "",
      addressLine1: "",
      city: "",
      state: "",
      postalCode: "",
      currencyCode: "INR",
      fiscalYearStart: "April",
      inventoryStartDate: new Date().toISOString().slice(0, 10),
      taxId: "",
      storeName: "",
    },
  });

  const selectedBusinessType = form.watch("businessType");
  const selectedState = form.watch("state");
  const cityOptions = useMemo(
    () => citiesForState(selectedState || ""),
    [selectedState],
  );
  const isOther = selectedBusinessType === "other";

  useEffect(() => {
    form.setValue("city", "");
  }, [selectedState, form]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (identity?.phone) {
      form.setValue("phone", identity.phone);
    }
  }, [hydrated, identity?.phone, form]);

  useEffect(() => {
    if (!hydrated) return;
    if (accessToken) {
      router.replace("/dashboard");
      return;
    }
    if (!identityToken) {
      router.replace("/login");
      return;
    }
    void refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once after hydrate
  }, [hydrated, identityToken, accessToken]);

  useEffect(() => {
    if (!isOther) {
      setShowCustomFields(false);
    }
  }, [isOther]);

  async function refreshList() {
    setLoading(true);
    try {
      const data = await authApi.listOrganizations();
      setOrgs(data.organizations ?? []);
      if (!(data.organizations?.length)) setShowCreate(true);
    } catch (e) {
      toast.error(
        e instanceof ApiError
          ? e.messages.join(", ")
          : "Session expired — sign in again",
      );
      clear();
      router.replace("/login");
    } finally {
      setLoading(false);
    }
  }

  async function enterApp(data: PortalSessionResponse) {
    const dest = applyPortalResponse(data);
    if (dest === "app") {
      try {
        const boot = await appsApi.bootstrap();
        qc.setQueryData(["tenant-bootstrap"], boot);
      } catch {
        /* AppShell retries */
      }
      toast.success("Welcome to your shop");
      router.replace("/dashboard");
    }
  }

  async function onSelect(tenantId: string) {
    setEntering(tenantId);
    try {
      const data = await authApi.selectOrganization(tenantId);
      if (is2faChallenge(data)) {
        setTotpToken(data.totpToken);
        return;
      }
      await enterApp(data);
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Could not open shop",
      );
    } finally {
      setEntering(null);
    }
  }

  async function onCreate(values: CreateForm) {
    setCreating(true);
    try {
      const customItemFields =
        values.businessType === "other"
          ? customFields
              .map((label) => label.trim())
              .filter(Boolean)
              .map((label) => ({ label }))
          : undefined;

      const data = await authApi.createOrganization({
        organizationName: values.organizationName.trim(),
        businessType: values.businessType,
        customItemFields:
          customItemFields && customItemFields.length
            ? customItemFields
            : undefined,
        phone: values.phone?.trim() || undefined,
        addressLine1: values.addressLine1.trim() || undefined,
        city: values.city.trim() || undefined,
        state: values.state.trim() || undefined,
        postalCode: values.postalCode.trim() || undefined,
        countryCode: "IN",
        currencyCode: values.currencyCode || "INR",
        locale: "en-IN",
        fiscalYearStart: values.fiscalYearStart || undefined,
        inventoryStartDate: values.inventoryStartDate || undefined,
        taxId: values.taxId?.trim() || undefined,
        storeName: values.storeName?.trim() || undefined,
      });
      await enterApp(data);
    } catch (e) {
      toast.error(
        e instanceof ApiError
          ? e.messages.join(", ")
          : "Could not create organization",
      );
    } finally {
      setCreating(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#eef2f7] text-sm text-[#5a6b7d]">
        Loading…
      </div>
    );
  }

  const totpOverlay = totpToken ? (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-[#0b1f33]">
          Two-factor authentication
        </h2>
        <div className="mt-4">
          <TotpChallengeForm
            totpToken={totpToken}
            onVerified={enterApp}
            onCancel={() => setTotpToken(null)}
          />
        </div>
      </div>
    </div>
  ) : null;

  function signOut() {
    clear();
    router.replace("/login");
  }

  /** Zoho-style: left “what you get” · right organization form */
  if (showCreate && !loading) {
    return (
      <div className="min-h-dvh bg-[#eef2f7] text-[#0b1f33]">
        {totpOverlay}
        <div className="mx-auto grid min-h-dvh max-w-[1180px] lg:grid-cols-[minmax(300px,0.92fr)_minmax(0,1.2fr)]">
          <aside className="relative flex flex-col overflow-hidden bg-[#0a0e14] px-6 py-8 text-[#e8edf4] sm:px-8 sm:py-10 lg:px-9 lg:py-12">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.55]"
              style={{
                background:
                  "radial-gradient(ellipse 80% 50% at 20% 0%, rgba(26,86,219,0.35), transparent 55%), radial-gradient(ellipse 60% 40% at 90% 100%, rgba(26,86,219,0.12), transparent 50%)",
              }}
            />
            <div className="relative z-10 flex h-full flex-col">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
              >
                <p className="text-[0.7rem] font-semibold tracking-[0.16em] text-[#7eb0ff] uppercase">
                  Universal POS
                </p>
                <h1 className="mt-3 max-w-sm text-[1.55rem] font-bold leading-tight tracking-tight text-white sm:text-[1.75rem]">
                  Everything you need to run commerce
                </h1>
                <p className="mt-2.5 max-w-sm text-[0.875rem] leading-relaxed text-[#9aa6b5]">
                  One platform for any business — set up your organization once,
                  then sell, stock, and report from the same workspace.
                </p>
              </motion.div>

              <ul className="relative z-10 mt-8 flex-1 space-y-3.5">
                {PLATFORM_HIGHLIGHTS.map((item, i) => {
                  const Icon = item.Icon;
                  return (
                    <motion.li
                      key={item.title}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.28, delay: 0.05 + i * 0.04 }}
                      className="flex gap-3"
                    >
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#1a56db]/25 text-[#8eb6ff] ring-1 ring-[#1a56db]/35">
                        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[0.875rem] font-semibold text-white">
                          {item.title}
                        </span>
                        <span className="mt-0.5 block text-[0.75rem] leading-snug text-[#8b96a5]">
                          {item.detail}
                        </span>
                      </span>
                    </motion.li>
                  );
                })}
              </ul>

              <p className="relative z-10 mt-8 border-t border-white/[0.08] pt-5 text-[0.75rem] text-[#7a8696]">
                Premium trial includes inventory, billing, and reports. Switch
                plans anytime from your shop.
              </p>
            </div>
          </aside>

          <main className="flex min-h-dvh flex-col bg-[#f4f6fa]">
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#e4e9f0] bg-white px-5 py-3.5 sm:px-8">
              <div className="min-w-0">
                <p className="text-[0.65rem] font-bold tracking-[0.12em] text-[#1a56db] uppercase lg:hidden">
                  Universal POS
                </p>
                <h2 className="text-[1.05rem] font-semibold text-[#0b1f33] sm:text-[1.15rem]">
                  Set up your organization
                </h2>
                <p className="mt-0.5 truncate text-[0.75rem] text-[#5a6b7d]">
                  {identity
                    ? `${identity.fullName} · ${identity.email}`
                    : "Enter your business profile to get started"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {orgs.length ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setShowCreate(false)}
                  >
                    Back to list
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={signOut}
                >
                  <LogOut className="mr-1.5 h-3.5 w-3.5" />
                  Sign out
                </Button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, delay: 0.06 }}
                className="mx-auto max-w-xl rounded-xl border border-[#e4e9f0] bg-white p-5 shadow-[0_8px_30px_-18px_rgba(11,31,51,0.35)] sm:p-6"
              >
                <p className="text-sm text-[#5a6b7d]">
                  Choose your business type, then enter organization and address
                  details — like Zoho POS organization setup.
                </p>

                <form
                  className="mt-5 grid gap-3 sm:grid-cols-2"
                  onSubmit={form.handleSubmit(onCreate)}
                  noValidate
                >
                  <div className="sm:col-span-2">
                    <Label>Business type *</Label>
                    <p className="mt-0.5 mb-2 text-[0.72rem] text-[#8b9bb0]">
                      One Universal POS — each type only changes config extras,
                      not a separate app.
                    </p>
                    <input
                      type="hidden"
                      {...form.register("businessType", {
                        required: true,
                      })}
                    />
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {BUSINESS_TYPES.map((bt) => {
                        const on = selectedBusinessType === bt.id;
                        const Icon = bt.Icon;
                        return (
                          <li key={bt.id}>
                            <button
                              type="button"
                              onClick={() =>
                                form.setValue("businessType", bt.id, {
                                  shouldValidate: true,
                                  shouldDirty: true,
                                })
                              }
                              className={cn(
                                "relative flex h-full w-full flex-col rounded-lg border px-3 py-2.5 pr-9 text-left transition",
                                on
                                  ? "border-[#1a56db] bg-[#e8eefb] shadow-[0_0_0_1px_#1a56db]"
                                  : "border-[#d9e0ea] bg-white hover:border-[#c5d0e0]",
                              )}
                            >
                              <span
                                className={cn(
                                  "absolute top-2 right-2 grid h-5 w-5 place-items-center rounded-full border text-white",
                                  on
                                    ? "border-[#1a56db] bg-[#1a56db]"
                                    : "border-[#cfd8e6] bg-white",
                                )}
                                aria-hidden
                              >
                                {on ? (
                                  <Check
                                    className="h-3 w-3"
                                    strokeWidth={3}
                                  />
                                ) : null}
                              </span>
                              <span
                                className={cn(
                                  "mb-1.5 grid h-8 w-8 place-items-center rounded-md",
                                  on
                                    ? "bg-white text-[#1a56db]"
                                    : "bg-[#f4f6fa] text-[#5a6b7d]",
                                )}
                              >
                                <Icon className="h-4 w-4" />
                              </span>
                              <span className="text-sm font-semibold text-[#0b1f33]">
                                {bt.label}
                              </span>
                              <span className="mt-0.5 text-[0.72rem] leading-snug text-[#5a6b7d]">
                                {bt.detail}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>

                    {isOther ? (
                      <div className="mt-3 rounded-lg border border-dashed border-[#c5d0e0] bg-[#fafbfc] px-3 py-2.5">
                        <button
                          type="button"
                          className="text-sm font-semibold text-[#1a56db] hover:underline"
                          onClick={() => setShowCustomFields((v) => !v)}
                        >
                          {showCustomFields
                            ? "− Hide custom fields"
                            : "+ Add custom field"}
                        </button>
                        <p className="mt-0.5 text-[0.72rem] text-[#8b9bb0]">
                          Optional — e.g. Membership tier, Session mins. Shown
                          on New Item as extras.
                        </p>
                        {showCustomFields ? (
                          <ul className="mt-2 space-y-2">
                            {customFields.map((val, idx) => (
                              <li
                                key={idx}
                                className="flex items-center gap-2"
                              >
                                <Input
                                  placeholder={`Custom field ${idx + 1}`}
                                  value={val}
                                  onChange={(e) => {
                                    const next = [...customFields];
                                    next[idx] = e.target.value;
                                    setCustomFields(next);
                                  }}
                                />
                                {customFields.length > 1 ? (
                                  <button
                                    type="button"
                                    className="shrink-0 rounded-md p-2 text-[#8b9bb0] hover:bg-white hover:text-[#c81e1e]"
                                    onClick={() =>
                                      setCustomFields((rows) =>
                                        rows.filter((_, i) => i !== idx),
                                      )
                                    }
                                    aria-label="Remove field"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                ) : null}
                              </li>
                            ))}
                            {customFields.length < 8 ? (
                              <button
                                type="button"
                                className="text-xs font-semibold text-[#1a56db]"
                                onClick={() =>
                                  setCustomFields((rows) => [...rows, ""])
                                }
                              >
                                + Another field
                              </button>
                            ) : null}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="sm:col-span-2">
                    <Label>Organization name *</Label>
                    <Input
                      className="mt-1"
                      placeholder="City Apparel Store"
                      {...form.register("organizationName")}
                    />
                    <FieldError
                      message={
                        form.formState.errors.organizationName?.message
                      }
                    />
                  </div>
                  <div>
                    <Label>Branch / store name</Label>
                    <Input
                      className="mt-1"
                      placeholder="Main Store"
                      {...form.register("storeName")}
                    />
                    <FieldError
                      message={form.formState.errors.storeName?.message}
                    />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input
                      className="mt-1"
                      placeholder="+91 …"
                      {...form.register("phone")}
                    />
                    <FieldError
                      message={form.formState.errors.phone?.message}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Address *</Label>
                    <Input
                      className="mt-1"
                      placeholder="Street address"
                      {...form.register("addressLine1")}
                    />
                    <FieldError
                      message={form.formState.errors.addressLine1?.message}
                    />
                  </div>
                  <div>
                    <Label>State *</Label>
                    <Select className="mt-1" {...form.register("state")}>
                      <option value="">Select state first</option>
                      {INDIAN_STATES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                    <FieldError
                      message={form.formState.errors.state?.message}
                    />
                  </div>
                  <div>
                    <Label>City *</Label>
                    <Select
                      className="mt-1"
                      disabled={!selectedState}
                      {...form.register("city")}
                    >
                      <option value="">
                        {selectedState
                          ? "Select city"
                          : "Select state first"}
                      </option>
                      {cityOptions.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                    <FieldError
                      message={form.formState.errors.city?.message}
                    />
                  </div>
                  <div>
                    <Label>Postal code *</Label>
                    <Input
                      className="mt-1"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="6-digit PIN"
                      {...form.register("postalCode")}
                    />
                    <FieldError
                      message={form.formState.errors.postalCode?.message}
                    />
                  </div>
                  <div>
                    <Label>Tax ID / GSTIN</Label>
                    <Input
                      className="mt-1 uppercase"
                      placeholder="29AABCU9603R1ZM"
                      {...form.register("taxId")}
                    />
                    <FieldError
                      message={form.formState.errors.taxId?.message}
                    />
                  </div>
                  <div>
                    <Label>Currency</Label>
                    <Select
                      className="mt-1"
                      {...form.register("currencyCode")}
                    >
                      <option value="INR">INR — Indian Rupee</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                      <option value="AED">AED</option>
                    </Select>
                  </div>
                  <div>
                    <Label>Fiscal year starts</Label>
                    <Select
                      className="mt-1"
                      {...form.register("fiscalYearStart")}
                    >
                      {["January", "April", "July", "October"].map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Inventory start date</Label>
                    <Input
                      className="mt-1"
                      type="date"
                      {...form.register("inventoryStartDate")}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 sm:col-span-2 sm:pt-2">
                    <Button type="submit" disabled={creating}>
                      {creating ? "Creating…" : "Get started"}
                    </Button>
                    {orgs.length ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setShowCreate(false)}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </form>
              </motion.div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#eef2f7] text-[#0b1f33]">
      {totpOverlay}
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[0.7rem] font-semibold tracking-[0.14em] text-[#1a56db] uppercase">
              Universal POS
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Your organizations
            </h1>
            <p className="mt-1.5 max-w-lg text-sm text-[#5a6b7d]">
              {identity
                ? `Signed in as ${identity.fullName} · ${identity.email}`
                : "Pick a shop or create a new one."}
            </p>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={signOut}>
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            Sign out
          </Button>
        </header>

        {loading ? (
          <p className="rounded-2xl border border-[#d9e0ea] bg-white p-10 text-center text-sm text-[#5a6b7d]">
            Loading organizations…
          </p>
        ) : (
          <>
            {orgs.length ? (
              <ul className="space-y-3">
                {orgs.map((o) => (
                  <li key={o.tenantId}>
                    <button
                      type="button"
                      disabled={!!entering}
                      onClick={() => void onSelect(o.tenantId)}
                      className={cn(
                        "flex w-full items-center gap-4 rounded-2xl border border-[#d9e0ea] bg-white p-4 text-left shadow-sm transition",
                        "hover:border-[#1a56db]/40 hover:shadow-md",
                        entering === o.tenantId && "opacity-70",
                      )}
                    >
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#e8eefb] text-[#1a56db]">
                        <Building2 className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{o.name}</span>
                        <span className="mt-0.5 block text-xs text-[#8b9bb0]">
                          {o.slug}
                          {o.role ? ` · ${o.role}` : ""} · {o.currencyCode}
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-[#1a56db]">
                        {entering === o.tenantId ? "Opening…" : "Open →"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-4 rounded-2xl border border-dashed border-[#cfd8e6] bg-white/70 px-5 py-6 text-center text-sm text-[#5a6b7d]">
                No shops yet. Create your first organization to open the POS.
              </p>
            )}

            <div className="mt-6">
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => setShowCreate(true)}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Create organization
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
