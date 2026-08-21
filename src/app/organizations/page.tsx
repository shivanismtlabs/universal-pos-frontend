"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType, Suspense } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";
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
  HelpCircle,
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
import { authApi, appsApi, tenantsApi, type PortalSessionResponse } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { applyPortalResponse } from "@/lib/auth-portal";
import { defaultHomeForRoles } from "@/lib/roles";
import { TotpChallengeForm, is2faChallenge } from "@/components/totp-challenge-form";
import { cn } from "@/lib/utils";
import { phoneSchema } from "@/lib/validations";
import { geoStates, isKnownGeoState } from "@/lib/geo";
import { CountryStateFields } from "@/components/country-state-fields";
import { PhoneCountryInput } from "@/components/phone-country-input";
import { citiesForState } from "@/lib/india-locations";

const createOrgSchema = z
  .object({
    businessType: z.string().min(1, "Pick a starting setup, or My business isn’t listed"),
    businessLabel: z.string().trim().max(80).optional().or(z.literal("")),
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
    countryCode: z.string().min(1, "Select a country"),
    state: z.string().min(1, "Select a state"),
    city: z.string().min(1, "Enter a city"),
    postalCode: z.string().trim().min(3, "Enter postal / PIN code").max(12),
    currencyCode: z.string().min(3).max(3),
    fiscalYearStart: z.string().min(1),
    inventoryStartDate: z.string().min(1, "Inventory start date is required"),
    taxId: z.string().trim().max(20).optional().or(z.literal("")),
    storeName: z.string().trim().max(100).optional().or(z.literal("")),
    email: z
      .string()
      .trim()
      .max(120)
      .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email"),
    website: z
      .string()
      .trim()
      .max(200)
      .optional()
      .or(z.literal("")),
    addressLine2: z.string().trim().max(200).optional().or(z.literal("")),
    timezone: z.string().min(1).max(64),
    locale: z.string().min(2).max(16),
    organizationType: z.string().max(40).optional().or(z.literal("")),
    pan: z
      .string()
      .trim()
      .max(10)
      .refine(
        (v) => !v || /^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(v),
        "PAN must be 10 characters (AAAAA9999A)",
      ),
  })
  .superRefine((v, ctx) => {
    if (!isKnownGeoState(v.countryCode, v.state) && geoStates(v.countryCode).length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["state"],
        message: "Select a valid state",
      });
    }
    const cities = v.countryCode === "IN" ? citiesForState(v.state) : [];
    if (cities.length && !cities.includes(v.city)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["city"],
        message: "Select a city for the chosen state",
      });
    }
    if (
      v.countryCode === "IN" &&
      v.taxId &&
      !/^[0-9A-Z]{15}$/i.test(v.taxId.replace(/\s/g, ""))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["taxId"],
        message: "GSTIN must be 15 characters (letters/numbers)",
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
    detail: "Optional dining pack: tables, KOT, takeaway — still Universal POS",
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
    detail: "Billable services (consultancy, detailing…)",
    Icon: Wrench,
  },
  {
    id: "gym",
    label: "Gym / fitness",
    detail: "Memberships, check-in, optional PT bookings",
    Icon: Users,
  },
  {
    id: "rental",
    label: "Rental",
    detail: "Issue / return with deposits — not a permanent sale",
    Icon: Package,
  },
  {
    id: "repair",
    label: "Repair shop",
    detail: "Customer assets + jobs + parts/labor",
    Icon: Wrench,
  },
  {
    id: "pet_grooming",
    label: "Pet grooming",
    detail: "Appointments + optional retail products",
    Icon: Scissors,
  },
  {
    id: "other",
    label: "Not listed",
    detail: "Any business — catalog, counter, customers, reports",
    Icon: HelpCircle,
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
  return (
    <Suspense
      fallback={
        <div className="grid min-h-dvh place-items-center bg-[#eef2f7] text-sm text-[#5a6b7d]">
          Loading…
        </div>
      }
    >
      <OrganizationsPageInner />
    </Suspense>
  );
}

function OrganizationsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const completeSetup = searchParams.get("setup") === "1";
  const qc = useQueryClient();
  const identityToken = useAuthStore((s) => s.identityToken);
  const identity = useAuthStore((s) => s.identity);
  const accessToken = useAuthStore((s) => s.accessToken);
  const clear = useAuthStore((s) => s.clear);
  /** Wait for client + zustand rehydrate before using tokens (prevents crash/redirect thrash) */
  const [hydrated, setHydrated] = useState(false);
  /** Drop leftover shop JWT only once when opening the identity org picker */
  const clearedStaleShopRef = useRef(false);
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
  const user = useAuthStore((s) => s.user);

  const form = useForm<CreateForm>({
    resolver: zodResolver(createOrgSchema),
    mode: "onBlur",
    defaultValues: {
      businessType: "",
      businessLabel: "",
      organizationName: "",
      phone: "",
      addressLine1: "",
      countryCode: "IN",
      city: "",
      state: "",
      postalCode: "",
      currencyCode: "INR",
      fiscalYearStart: "April",
      inventoryStartDate: new Date().toISOString().slice(0, 10),
      taxId: "",
      storeName: "",
      email: "",
      website: "",
      addressLine2: "",
      timezone: "Asia/Kolkata",
      locale: "en-IN",
      organizationType: "",
      pan: "",
    },
  });

  const selectedBusinessType = form.watch("businessType");
  const selectedState = form.watch("state");
  const selectedCountry = form.watch("countryCode");
  const cityOptions = useMemo(
    () =>
      selectedCountry === "IN" ? citiesForState(selectedState || "") : [],
    [selectedCountry, selectedState],
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

    // Live/old signup: shop already exists — show org profile form (business type, etc.)
    if (accessToken && completeSetup) {
      setShowCreate(true);
      setLoading(false);
      return;
    }

    /**
     * One-time only: identity org picker + leftover shop JWT from a previous visit.
     * Must NOT re-run after Open/Create — that briefly has identityToken + accessToken
     * and was wiping the new session (stuck on this page after "Welcome to your shop").
     */
    if (
      !clearedStaleShopRef.current &&
      identityToken &&
      accessToken &&
      !completeSetup &&
      !user
    ) {
      clearedStaleShopRef.current = true;
      useAuthStore.setState({
        accessToken: null,
        stationToken: null,
        refreshToken: null,
        user: null,
        tenantSlug: "",
      });
      return;
    }

    // Just opened / created a shop — go to app (keep identityToken for Switch org)
    if (accessToken && user) {
      clearedStaleShopRef.current = true;
      router.replace(defaultHomeForRoles(user.roles, user.permissions));
      return;
    }

    if (!identityToken && !accessToken) {
      router.replace("/login");
      return;
    }

    if (identityToken && !accessToken) {
      void refreshList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate + auth transitions
  }, [hydrated, identityToken, accessToken, completeSetup, user]);

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
      clearedStaleShopRef.current = true;
      qc.clear();
      try {
        const boot = await appsApi.bootstrap();
        qc.setQueryData(["tenant-bootstrap"], boot);
      } catch {
        /* AppShell retries */
      }
      toast.success("Welcome to your shop");
      const u = useAuthStore.getState().user;
      router.replace(defaultHomeForRoles(u?.roles, u?.permissions));
      return;
    }
    toast.message("Select an organization to continue");
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

      async function persistOrgProfile(next: CreateForm) {
        const addressLine = [
          next.addressLine1.trim(),
          next.addressLine2?.trim(),
          next.city.trim(),
          next.state.trim(),
          next.postalCode.trim(),
        ]
          .filter(Boolean)
          .join(", ");

        await tenantsApi.updateMe({
          name: next.organizationName.trim(),
          currencyCode: next.currencyCode || "INR",
          locale: next.locale || "en-IN",
          timezone: next.timezone || "Asia/Kolkata",
          taxId: next.taxId?.trim() || undefined,
          settings: {
            organizationProfile: {
              phone: next.phone?.trim() || null,
              email: next.email?.trim() || null,
              website: next.website?.trim() || null,
              addressLine1: next.addressLine1.trim(),
              addressLine2: next.addressLine2?.trim() || null,
              city: next.city.trim(),
              state: next.state.trim(),
              postalCode: next.postalCode.trim(),
              fiscalYearStart: next.fiscalYearStart,
              inventoryStartDate: next.inventoryStartDate,
              timezone: next.timezone || "Asia/Kolkata",
              locale: next.locale || "en-IN",
              organizationType: next.organizationType?.trim() || null,
              pan: next.pan?.trim()?.toUpperCase() || null,
              completedAt: new Date().toISOString(),
            },
            ...(next.businessLabel?.trim()
              ? { businessLabel: next.businessLabel.trim() }
              : {}),
            ...(customItemFields?.length ? { customItemFields } : {}),
          },
        });

        try {
          const locs = await tenantsApi.listLocations();
          const main = Array.isArray(locs) ? locs[0] : undefined;
          if (main?.id) {
            await tenantsApi.updateLocation(main.id, {
              name: next.storeName?.trim() || main.name || "Main Store",
              phone: next.phone?.trim() || undefined,
              address: addressLine || undefined,
            });
          }
        } catch {
          /* location update optional on older APIs */
        }
      }

      // Path A: identity portal → create brand-new organization
      if (identityToken && !completeSetup) {
        // Live API still rejects email/website/PAN etc. on POST /auth/organizations.
        const data = await authApi.createOrganization({
          organizationName: values.organizationName.trim(),
          businessType: values.businessType,
          businessLabel: values.businessLabel?.trim() || undefined,
          customItemFields:
            customItemFields && customItemFields.length
              ? customItemFields
              : undefined,
          phone: values.phone?.trim() || undefined,
          addressLine1: values.addressLine1.trim() || undefined,
          city: values.city.trim() || undefined,
          state: values.state.trim() || undefined,
          postalCode: values.postalCode.trim() || undefined,
          countryCode: values.countryCode || "IN",
          currencyCode: values.currencyCode || "INR",
          locale: values.locale || "en-IN",
          fiscalYearStart: values.fiscalYearStart || undefined,
          inventoryStartDate: values.inventoryStartDate || undefined,
          taxId: values.taxId?.trim() || undefined,
          storeName: values.storeName?.trim() || undefined,
        });
        applyPortalResponse(data);
        try {
          await persistOrgProfile(values);
        } catch {
          /* extras optional until API is upgraded */
        }
        await enterApp(data);
        return;
      }

      // Path B: shop already provisioned (older live signup) — complete profile
      if (!accessToken) {
        throw new Error("Session expired — sign in again");
      }

      await persistOrgProfile(values);

      await appsApi.setBusinessConfig({
        businessType: values.businessType,
        applyDefaultModes: true,
        businessLabel: values.businessLabel?.trim() || undefined,
      });

      try {
        const boot = await appsApi.bootstrap();
        qc.setQueryData(["tenant-bootstrap"], boot);
      } catch {
        /* AppShell retries */
      }

      toast.success("Organization profile saved");
      const u = useAuthStore.getState().user;
      router.replace(defaultHomeForRoles(u?.roles, u?.permissions));
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
        <div className="grid min-h-dvh w-full lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="relative hidden flex-col overflow-hidden bg-[#0a0e14] px-5 py-6 text-[#e8edf4] lg:flex">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.45]"
              style={{
                background:
                  "radial-gradient(ellipse 80% 50% at 20% 0%, rgba(26,86,219,0.35), transparent 55%)",
              }}
            />
            <div className="relative z-10 flex h-full flex-col">
              <p className="text-[0.65rem] font-semibold tracking-[0.16em] text-[#7eb0ff] uppercase">
                Universal POS
              </p>
              <h1 className="mt-2 text-[1.15rem] font-bold leading-snug tracking-tight text-white">
                Run commerce in one workspace
              </h1>
              <ul className="mt-6 flex-1 space-y-3.5">
                {PLATFORM_HIGHLIGHTS.map((item) => {
                  const Icon = item.Icon;
                  return (
                    <li key={item.title} className="flex items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#1a56db]/25 text-[#8eb6ff]">
                        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                      </span>
                      <span className="text-[0.875rem] font-medium text-[#e8edf4]">
                        {item.title}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-auto border-t border-white/[0.08] pt-3 text-[0.7rem] leading-snug text-[#7a8696]">
                Same POS for any business. Templates only pre-fill extras.
              </p>
            </div>
          </aside>

          <main className="flex min-h-dvh flex-col bg-[#f4f6fa]">
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#e4e9f0] bg-white px-4 py-2.5 sm:px-6">
              <div className="min-w-0">
                <p className="text-[0.65rem] font-bold tracking-[0.12em] text-[#1a56db] uppercase lg:hidden">
                  Universal POS
                </p>
                <h2 className="text-[1rem] font-semibold text-[#0b1f33]">
                  {completeSetup
                    ? "Complete your organization"
                    : "Set up your organization"}
                </h2>
                <p className="truncate text-[0.72rem] text-[#5a6b7d]">
                  {identity
                    ? `${identity.fullName} · ${identity.email}`
                    : completeSetup
                      ? "Name, address, and starting setup — then open shop"
                      : "Enter your business profile to get started"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {orgs.length && !completeSetup ? (
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

            <div className="flex-1 overflow-y-auto p-3 sm:p-4">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="min-h-full w-full rounded-xl border border-[#e4e9f0] bg-white px-4 py-3.5 shadow-[0_8px_30px_-18px_rgba(11,31,51,0.35)] sm:px-6 sm:py-4"
              >
                <form
                  className="mx-auto grid max-w-2xl gap-2.5 sm:grid-cols-2"
                  onSubmit={form.handleSubmit(onCreate)}
                  noValidate
                >
                  <div className="sm:col-span-2">
                    <Label>Starting setup *</Label>
                    <p className="mb-1.5 mt-0.5 text-[0.7rem] text-[#8b9bb0]">
                      Closest match, or Not listed — POS still runs.
                    </p>
                    <input
                      type="hidden"
                      {...form.register("businessType", {
                        required: true,
                      })}
                    />
                    <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {BUSINESS_TYPES.map((bt) => {
                        const on = selectedBusinessType === bt.id;
                        const Icon = bt.Icon;
                        return (
                          <li key={bt.id} className={bt.id === "other" ? "col-span-2 sm:col-span-1" : undefined}>
                            <button
                              type="button"
                              title={bt.detail}
                              onClick={() =>
                                form.setValue("businessType", bt.id, {
                                  shouldValidate: true,
                                  shouldDirty: true,
                                })
                              }
                              className={cn(
                                "flex h-9 w-full items-center gap-1.5 rounded-md border px-2 text-left transition",
                                on
                                  ? "border-[#1a56db] bg-[#e8eefb] text-[#0b1f33]"
                                  : bt.id === "other"
                                    ? "border-dashed border-[#c5d0e0] bg-[#fafbfc] text-[#0b1f33] hover:border-[#1a56db]/40"
                                    : "border-[#e4e9f0] bg-white text-[#0b1f33] hover:border-[#c5d0e0]",
                              )}
                            >
                              <Icon
                                className={cn(
                                  "h-3.5 w-3.5 shrink-0",
                                  on ? "text-[#1a56db]" : "text-[#5a6b7d]",
                                )}
                              />
                              <span className="truncate text-[0.78rem] font-medium">
                                {bt.label}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {selectedBusinessType ? (
                      <p className="mt-1 text-[0.7rem] text-[#5a6b7d]">
                        {
                          BUSINESS_TYPES.find((b) => b.id === selectedBusinessType)
                            ?.detail
                        }
                      </p>
                    ) : null}
                    <FieldError
                      message={form.formState.errors.businessType?.message}
                    />

                    {isOther ? (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <div className="min-w-[12rem] flex-1">
                          <Label htmlFor="business-label">Your business</Label>
                          <Input
                            id="business-label"
                            className="mt-0.5 h-9"
                            placeholder="e.g. Swimming academy"
                            {...form.register("businessLabel")}
                          />
                        </div>
                        <button
                          type="button"
                          className="mb-0.5 text-xs font-semibold text-[#1a56db] hover:underline"
                          onClick={() => setShowCustomFields((v) => !v)}
                        >
                          {showCustomFields ? "Hide fields" : "+ Custom fields"}
                        </button>
                      </div>
                    ) : null}
                    {isOther && showCustomFields ? (
                      <ul className="mt-2 space-y-1.5">
                        {customFields.map((val, idx) => (
                          <li key={idx} className="flex items-center gap-2">
                            <Input
                              className="h-9"
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
                                className="shrink-0 rounded-md p-1.5 text-[#8b9bb0] hover:bg-[#f4f6fa] hover:text-[#c81e1e]"
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
                    <PhoneCountryInput
                      value={form.watch("phone") ?? ""}
                      onChange={(v) =>
                        form.setValue("phone", v, { shouldValidate: true })
                      }
                    />
                    <FieldError
                      message={form.formState.errors.phone?.message}
                    />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input
                      className="mt-1"
                      type="email"
                      placeholder="billing@shop.com"
                      {...form.register("email")}
                    />
                    <FieldError
                      message={form.formState.errors.email?.message}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Website</Label>
                    <Input
                      className="mt-1"
                      placeholder="https://"
                      {...form.register("website")}
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
                  <div className="sm:col-span-2">
                    <Label>Address line 2</Label>
                    <Input
                      className="mt-1"
                      placeholder="Area, landmark (optional)"
                      {...form.register("addressLine2")}
                    />
                  </div>
                  <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                    <CountryStateFields
                      countryRequired
                      stateRequired
                      countryCode={form.watch("countryCode")}
                      state={form.watch("state")}
                      onCountry={(code) => {
                        form.setValue("countryCode", code, {
                          shouldValidate: true,
                        });
                        form.setValue("state", "");
                        form.setValue("city", "");
                      }}
                      onState={(state) => {
                        form.setValue("state", state, { shouldValidate: true });
                      }}
                    />
                  </div>
                  <div>
                    <Label>City *</Label>
                    {cityOptions.length ? (
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
                    ) : (
                      <Input
                        className="mt-1"
                        placeholder="City"
                        {...form.register("city")}
                      />
                    )}
                    <FieldError
                      message={form.formState.errors.city?.message}
                    />
                  </div>
                  <div>
                    <Label>Postal code *</Label>
                    <Input
                      className="mt-1"
                      placeholder="PIN / ZIP"
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
                    <Label>PAN</Label>
                    <Input
                      className="mt-1 uppercase"
                      placeholder="AAAAA9999A"
                      maxLength={10}
                      {...form.register("pan")}
                    />
                    <FieldError
                      message={form.formState.errors.pan?.message}
                    />
                  </div>
                  <div>
                    <Label>Organization type</Label>
                    <Select
                      className="mt-1"
                      {...form.register("organizationType")}
                    >
                      <option value="">Select (optional)</option>
                      <option value="proprietorship">Proprietorship</option>
                      <option value="partnership">Partnership</option>
                      <option value="llp">LLP</option>
                      <option value="pvt_ltd">Private Limited</option>
                      <option value="public">Public Limited</option>
                      <option value="trust">Trust / Society</option>
                      <option value="other">Other</option>
                    </Select>
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
                    <Label>Time zone</Label>
                    <Select className="mt-1" {...form.register("timezone")}>
                      <option value="Asia/Kolkata">
                        Asia/Kolkata (IST)
                      </option>
                      <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">
                        America/New York
                      </option>
                    </Select>
                  </div>
                  <div>
                    <Label>Language</Label>
                    <Select className="mt-1" {...form.register("locale")}>
                      <option value="en-IN">English (India)</option>
                      <option value="hi-IN">Hindi</option>
                      <option value="en-US">English (US)</option>
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

                  <div className="flex flex-wrap gap-2 sm:col-span-2 sm:pt-0.5">
                    <Button type="submit" disabled={creating}>
                      {creating
                        ? completeSetup
                          ? "Saving…"
                          : "Creating…"
                        : completeSetup
                          ? "Save & open shop"
                          : "Get started"}
                    </Button>
                    {orgs.length && !completeSetup ? (
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
            {orgs.length > 1 ? (
              <p className="mt-2 text-sm">
                <a href="/group" className="font-medium text-[#1a56db]">
                  All Businesses — group sales, profit, inventory
                </a>
              </p>
            ) : null}
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
