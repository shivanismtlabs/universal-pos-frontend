"use client";

import { useEffect, useState, type ComponentType } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { authApi, appsApi, type PortalSessionResponse } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { applyPortalResponse } from "@/lib/auth-portal";
import { cn } from "@/lib/utils";

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

type IconType = ComponentType<{ className?: string }>;

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

type CreateForm = {
  businessType: string;
  organizationName: string;
  phone: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  currencyCode: string;
  fiscalYearStart: string;
  inventoryStartDate: string;
  taxId: string;
  storeName: string;
};

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
  const [showCustomFields, setShowCustomFields] = useState(false);
  const [customFields, setCustomFields] = useState<string[]>([""]);

  const form = useForm<CreateForm>({
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
  const isOther = selectedBusinessType === "other";

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
        phone: values.phone.trim() || undefined,
        addressLine1: values.addressLine1.trim() || undefined,
        city: values.city.trim() || undefined,
        state: values.state.trim() || undefined,
        postalCode: values.postalCode.trim() || undefined,
        countryCode: "IN",
        currencyCode: values.currencyCode || "INR",
        locale: "en-IN",
        fiscalYearStart: values.fiscalYearStart || undefined,
        inventoryStartDate: values.inventoryStartDate || undefined,
        taxId: values.taxId.trim() || undefined,
        storeName: values.storeName.trim() || undefined,
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

  return (
    <div className="min-h-dvh bg-[#eef2f7] text-[#0b1f33]">
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
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              clear();
              router.replace("/login");
            }}
          >
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
              {!showCreate ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={() => setShowCreate(true)}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Create organization
                </Button>
              ) : null}

              <AnimatePresence>
                {showCreate ? (
                  <motion.section
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="mt-4 rounded-2xl border border-[#d9e0ea] bg-white p-5 shadow-sm sm:p-6"
                  >
                    <h2 className="text-lg font-semibold">
                      Set up your organization
                    </h2>
                    <p className="mt-1 text-sm text-[#5a6b7d]">
                      Choose your business type first — it configures item extra
                      fields and billing style. Then enter legal / address
                      details.
                    </p>

                    <form
                      className="mt-5 grid gap-3 sm:grid-cols-2"
                      onSubmit={form.handleSubmit(onCreate)}
                      noValidate
                    >
                      <div className="sm:col-span-2">
                        <Label>Business type *</Label>
                        <p className="mt-0.5 mb-2 text-[0.72rem] text-[#8b9bb0]">
                          One Universal POS — each type only changes config
                          extras, not a separate app.
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
                              onClick={() =>
                                setShowCustomFields((v) => !v)
                              }
                            >
                              {showCustomFields
                                ? "− Hide custom fields"
                                : "+ Add custom field"}
                            </button>
                            <p className="mt-0.5 text-[0.72rem] text-[#8b9bb0]">
                              Optional — e.g. Membership tier, Session mins.
                              Shown on New Item as extras.
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
                          {...form.register("organizationName", {
                            required: true,
                            minLength: 2,
                          })}
                        />
                      </div>
                      <div>
                        <Label>Branch / store name</Label>
                        <Input
                          className="mt-1"
                          placeholder="Main Store"
                          {...form.register("storeName")}
                        />
                      </div>
                      <div>
                        <Label>Phone</Label>
                        <Input
                          className="mt-1"
                          placeholder="+91 …"
                          {...form.register("phone")}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label>Address</Label>
                        <Input
                          className="mt-1"
                          placeholder="Street address"
                          {...form.register("addressLine1")}
                        />
                      </div>
                      <div>
                        <Label>City</Label>
                        <Input className="mt-1" {...form.register("city")} />
                      </div>
                      <div>
                        <Label>State</Label>
                        <Select
                          className="mt-1"
                          {...form.register("state")}
                        >
                          <option value="">Select state</option>
                          {INDIAN_STATES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <Label>Postal code</Label>
                        <Input
                          className="mt-1"
                          {...form.register("postalCode")}
                        />
                      </div>
                      <div>
                        <Label>Tax ID / GSTIN</Label>
                        <Input
                          className="mt-1 uppercase"
                          placeholder="29AABCU…"
                          {...form.register("taxId")}
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
                  </motion.section>
                ) : null}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
