"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Lightbulb,
  Package,
  Settings2,
  ShoppingCart,
  Store,
  Upload,
  Users,
  Wallet,
} from "lucide-react";
import { catalogApi, customersApi, ordersApi, posApi, resourcesApi, subscriptionsApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { useAuthStore } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { ItemsImportDialog } from "@/components/items-import-dialog";
import { cn } from "@/lib/utils";
import {
  gettingStartedPath,
  readSetupStepParam,
  withGettingStartedReturn,
} from "@/lib/setup-return";

type StepId =
  | "store"
  | "tax"
  | "build"
  | "stockup"
  | "rentalunits"
  | "resources"
  | "services"
  | "plans"
  | "prefs"
  | "register"
  | "customers"
  | "livesell";

type StepDef = {
  id: StepId;
  n: number;
  title: string;
  detail: string;
  tip?: string;
  done: boolean;
  /** Zoho dual-panel: import + manual */
  buildInventory?: boolean;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
};

function userDisplayName(full?: string | null) {
  return full?.trim() || "User";
}

/**
 * Zoho-style Getting Started for Universal POS.
 * commerce-mode aware — sale unlocks inventory steps; never industry-hardcoded.
 */
export function HomeGettingStarted() {
  const {
    hasMode,
    hasCapability,
    productName,
    data: boot,
    businessConfig,
  } = useBootstrap();
  const user = useAuthStore((s) => s.user);
  const search = useSearchParams();
  const stepFromUrl = readSetupStepParam(search);
  const hasSale = hasMode("sale");
  const hasRental = hasMode("rental") || hasCapability("AVAILABILITY");
  const hasService = hasMode("service");
  const hasPlans =
    hasMode("subscription") ||
    hasCapability("SUBSCRIPTION") ||
    hasCapability("MEMBERSHIP");
  const [importOpen, setImportOpen] = useState(false);

  const floor = useQuery({
    queryKey: ["pos-sale-floor"],
    queryFn: () => posApi.saleFloor(),
    enabled: hasSale,
  });
  const catalogCount = useQuery({
    queryKey: ["catalog-setup-count"],
    queryFn: () => catalogApi.listProducts({ status: "active", limit: 1 }),
  });
  const resourcesCount = useQuery({
    queryKey: ["resources-setup-count"],
    queryFn: () => resourcesApi.list({ limit: 1 }),
    enabled: hasRental && !hasSale,
  });
  const rentalFloor = useQuery({
    queryKey: ["pos-rental-floor-setup"],
    queryFn: () => posApi.rentalFloor(),
    enabled: hasRental,
  });
  const plansCount = useQuery({
    queryKey: ["subscriptions-plans-setup"],
    queryFn: () => subscriptionsApi.listPlans(),
    enabled: hasPlans,
  });
  const customersCount = useQuery({
    queryKey: ["customers-setup-count"],
    queryFn: () => customersApi.list({ limit: 1 }),
  });
  const ordersCount = useQuery({
    queryKey: ["orders-setup-count"],
    queryFn: () => ordersApi.list({ limit: 1 }),
  });
  const locationId = boot?.locations?.[0]?.id;
  const registerSession = useQuery({
    queryKey: ["pos-register-session-setup", locationId],
    queryFn: () => posApi.currentRegister(locationId),
    enabled: Boolean(locationId),
  });

  const products =
    catalogCount.data?.meta?.total ?? floor.data?.counts?.products ?? 0;
  const inStock = floor.data?.counts?.inStock ?? 0;
  const resourceTotal = resourcesCount.data?.meta?.total ?? 0;
  const rentalUnitTotal = rentalFloor.data?.counts?.units ?? 0;
  const rentalStyleTotal = rentalFloor.data?.counts?.products ?? 0;
  const planTotal =
    plansCount.data?.counts?.plans ?? plansCount.data?.items?.length ?? 0;
  const hasCustomers =
    (customersCount.data?.meta?.total ?? customersCount.data?.items?.length ?? 0) > 0;
  const hasOrders =
    (ordersCount.data?.meta?.total ?? ordersCount.data?.items?.length ?? 0) > 0;
  const hasRegister = Boolean(registerSession.data?.session?.id) || hasOrders;

  const taxConfigured = useMemo(() => {
    const t = boot?.tenant;
    if (!t) return false;
    if (t.taxId || t.gstin) return true;
    const settings =
      t.settings && typeof t.settings === "object"
        ? (t.settings as Record<string, unknown>)
        : {};
    const tax =
      settings.tax && typeof settings.tax === "object"
        ? (settings.tax as Record<string, unknown>)
        : {};
    if (
      typeof tax.ratePercent === "number" ||
      (typeof tax.ratePercent === "string" && tax.ratePercent.trim() !== "")
    ) {
      return true;
    }
    return Boolean(t.taxMode && t.taxMode !== "none");
  }, [boot?.tenant]);

  const prefsConfigured = useMemo(() => {
    const branding = boot?.tenant?.branding;
    const settings =
      boot?.tenant?.settings && typeof boot.tenant.settings === "object"
        ? (boot.tenant.settings as Record<string, unknown>)
        : {};
    return Boolean(
      branding?.logoUrl ||
        branding?.tagline?.trim() ||
        (settings.pos &&
          typeof settings.pos === "object" &&
          (settings.pos as Record<string, unknown>).receiptFooter),
    );
  }, [boot?.tenant]);

  const steps = useMemo((): StepDef[] => {
    const list: StepDef[] = [
      {
        id: "store",
        n: 1,
        title: "Create a store",
        detail:
          "Your organization and default location are ready. Add more stores anytime from settings.",
        tip: "Universal POS supports multi-store later without changing how items work.",
        primary: {
          label: "Open settings",
          href: withGettingStartedReturn("/settings", "store"),
        },
        done: true,
      },
      {
        id: "tax",
        n: 2,
        title: "Configure tax settings",
        detail:
          "Set tax IDs, rates, and receipt fields so invoices match your region (GST/VAT or none).",
        tip: "Tax applies at checkout for any commerce mode you enable.",
        primary: {
          label: "Tax & shop settings",
          href: withGettingStartedReturn("/settings/tax", "tax"),
        },
        done: taxConfigured,
      },
    ];

    const buildTitle =
      hasSale && hasRental
        ? "Add items to sell & rent"
        : hasSale
          ? "Build your inventory"
          : hasService
            ? "Add services you bill"
            : hasRental
              ? "Add rentable outfits"
              : hasPlans
                ? "Add plans to your catalog"
                : "Add items to your catalog";
    const buildDetail =
      hasSale && hasRental
        ? "Retail accessories (ties, bags, kits) via Items import or New Item. Formal wear sizes & barcodes go in the rental stock step next."
        : hasSale
          ? "Bulk import your items/services using a file, or create them one by one — same catalog for every industry."
          : "Create catalog items for this shop (goods, services, rentals, or plans). Import a file or add them one by one.";

    list.push({
      id: "build",
      n: list.length + 1,
      title: buildTitle,
      detail: buildDetail,
      tip: "Categories auto-create from CSV when missing. Prefer short universal SKUs.",
      buildInventory: true,
      done: products > 0,
    });

    if (hasSale) {
      list.push({
        id: "stockup",
        n: list.length + 1,
        title: "Stock up your inventory",
        detail:
          "Raise opening stock via purchases or stock adjust so the counter never sells negative quantities.",
        tip: "Purchases from suppliers restock multiple items at once.",
        primary: {
          label: "Add supplier",
          href: withGettingStartedReturn("/suppliers/new", "stockup"),
        },
        secondary: {
          label: "Stock levels",
          href: withGettingStartedReturn("/inventory", "stockup"),
        },
        done: products > 0 && inStock > 0,
      });
    }

    if (hasService) {
      list.push({
        id: "services",
        n: list.length + 1,
        title: "Charge a service",
        detail:
          "Open the counter Services tab and bill a timed or walk-in service — same checkout as retail.",
        tip: "Appointments stay under the Appointments screen when that capability is on.",
        primary: {
          label: "Counter · services",
          href: withGettingStartedReturn("/counter?view=service", "services"),
        },
        secondary: {
          label: "Appointments",
          href: withGettingStartedReturn("/appointments", "services"),
        },
        done: products > 0 && prefsConfigured,
      });
    }

    if (hasRental) {
      list.push({
        id: "rentalunits",
        n: list.length + 1,
        title: hasSale
          ? "Add rental outfits (sizes & barcodes)"
          : "Add rental units",
        detail: hasSale
          ? "Each tuxedo, gown, or jacket gets a barcode per size — scan at the Counter Rent tab. Deposits and return dates apply here, not on sale items."
          : "Add styles with rental price, deposit, and unit barcodes (size/variant). Same flow for formal wear, gear, or any rentable SKU.",
        tip: "Use Rental desk → Stock tab, then Counter → Rent tab to scan barcodes.",
        primary: {
          label: "Rental desk",
          href: withGettingStartedReturn("/rental", "rentalunits"),
        },
        secondary: {
          label: "Counter → Rent",
          href: withGettingStartedReturn("/counter?view=rental", "rentalunits"),
        },
        done: rentalUnitTotal > 0 || rentalStyleTotal > 0,
      });
    }

    if (hasRental && hasSale) {
      list.push({
        id: "livesell",
        n: list.length + 1,
        title: "Sell accessories live",
        detail:
          "Use the Sell tab for retail items (bow ties, bags, kits). Use the Rent tab for outfits — one counter, two views.",
        tip: "Mixed rent + sale on one receipt is not supported yet; complete as two orders if needed.",
        primary: {
          label: "Counter → Sell",
          href: withGettingStartedReturn("/counter?view=sale", "livesell"),
        },
        secondary: {
          label: "Items to sell",
          href: withGettingStartedReturn("/catalog", "livesell"),
        },
        done: hasOrders,
      });
    }

    if (hasRental && !hasSale) {
      list.push({
        id: "resources",
        n: list.length + 1,
        title: "Set up bookable resources",
        detail:
          "Optional: rooms, tables, vehicles, or other assets you assign at the counter — in addition to unit barcodes.",
        tip: "Formal wear shops usually skip this and use rental units only.",
        primary: {
          label: "Resources",
          href: withGettingStartedReturn("/resources", "resources"),
        },
        secondary: {
          label: "Counter → Rent",
          href: withGettingStartedReturn("/counter?view=rental", "resources"),
        },
        done: resourceTotal > 0,
      });
    }

    if (hasPlans) {
      list.push({
        id: "plans",
        n: list.length + 1,
        title: "Create a plan or membership",
        detail:
          "Sell recurring access (classes, retainers, clubs) from catalog items in subscription mode.",
        tip: "Check-in uses the same membership record for gym, salon, or coworking.",
        primary: {
          label: "Counter · plans",
          href: withGettingStartedReturn("/counter?view=subscription", "plans"),
        },
        secondary: {
          label: "Check-in",
          href: withGettingStartedReturn("/check-in", "plans"),
        },
        done: planTotal > 0,
      });
    }

    list.push(
      {
        id: "prefs",
        n: list.length + 1,
        title: "Manage store preferences",
        detail:
          "Branding, receipts, PIN switch, and commerce modes stay under one shop profile.",
        primary: {
          label: "Preferences",
          href: withGettingStartedReturn("/settings", "prefs"),
        },
        secondary: {
          label: "Software plan",
          href: withGettingStartedReturn("/plan", "prefs"),
        },
        done: prefsConfigured,
      },
      {
        id: "register",
        n: list.length + 1,
        title: "Setup POS register",
        detail:
          hasSale && hasRental
            ? "Open the counter — Sell tab for retail, Rent tab for outfits. Open a sales register on the Sell tab for shift cash tracking."
            : "Open the counter, run a sales register for the shift, and take your first payment.",
        primary: {
          label: hasSale && hasRental ? "Open counter (Sell / Rent)" : "Open counter",
          href: withGettingStartedReturn(
            hasSale ? "/counter?view=sale" : "/counter?view=rental",
            "register",
          ),
        },
        secondary: {
          label: "All orders",
          href: withGettingStartedReturn("/orders", "register"),
        },
        done: hasRegister,
      },
      {
        id: "customers",
        n: list.length + 1,
        title: "Customers & reports",
        detail:
          "Save customers for credit and history. Review sales and export CSV when needed.",
        primary: {
          label: "Customers",
          href: withGettingStartedReturn("/customers", "customers"),
        },
        secondary: {
          label: "Reports",
          href: withGettingStartedReturn("/reports", "customers"),
        },
        done: hasCustomers || hasOrders,
      },
    );

    return list.map((s, i) => ({ ...s, n: i + 1 }));
  }, [
    hasSale,
    hasService,
    hasRental,
    hasPlans,
    products,
    inStock,
    resourceTotal,
    rentalUnitTotal,
    rentalStyleTotal,
    planTotal,
    taxConfigured,
    prefsConfigured,
    hasRegister,
    hasCustomers,
    hasOrders,
  ]);

  const firstOpen =
    steps.find((s) => !s.done)?.id ?? steps[0]?.id ?? "store";
  const [activeId, setActiveId] = useState<StepId>(() => {
    if (stepFromUrl && steps.some((s) => s.id === stepFromUrl)) {
      return stepFromUrl as StepId;
    }
    return firstOpen;
  });

  useEffect(() => {
    if (stepFromUrl && steps.some((s) => s.id === stepFromUrl)) {
      setActiveId(stepFromUrl as StepId);
    }
  }, [stepFromUrl, steps]);

  const active = steps.find((s) => s.id === activeId) ?? steps[0];
  const doneCount = steps.filter((s) => s.done).length;
  const total = steps.length;
  const progress = total ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.65rem] font-semibold tracking-tight text-[#0b1f33] sm:text-[1.85rem]">
            Welcome, {userDisplayName(user?.fullName)}!
          </h1>
          <p className="mt-1.5 text-[0.9rem] text-[#5a6b7d]">
            Follow this checklist to get started with{" "}
            {productName || "Universal POS"}.
            {businessConfig?.gettingStartedHints?.[0]
              ? ` ${businessConfig.gettingStartedHints[0]}.`
              : ""}
          </p>
        </div>
        <div className="min-w-[10rem] text-right">
          <p className="text-[0.8rem] font-medium text-[#5a6b7d]">
            {doneCount}/{total} Steps Completed
          </p>
          <div className="mt-1.5 h-1.5 w-40 max-w-full overflow-hidden rounded-full bg-[#e5eaf1] sm:ml-auto">
            <div
              className="h-full rounded-full bg-[#1a56db] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-0 overflow-hidden rounded-xl border border-[#d9e0ea] bg-white shadow-[0_1px_2px_rgba(11,31,51,0.04)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <ol className="divide-y divide-[#eef1f4] border-b border-[#eef1f4] lg:border-r lg:border-b-0">
          {steps.map((s) => {
            const selected = s.id === active?.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(s.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3.5 text-left transition sm:px-5",
                    selected
                      ? "bg-[#eef4ff]"
                      : "bg-white hover:bg-[#f8fafc]",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[0.75rem] font-semibold",
                      s.done
                        ? "bg-[#1a56db] text-white"
                        : selected
                          ? "border-2 border-[#1a56db] text-[#1a56db]"
                          : "border border-[#cfd8e6] text-[#5a6b7d]",
                    )}
                  >
                    {s.done ? (
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    ) : (
                      s.n
                    )}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 text-[0.9rem]",
                      selected
                        ? "font-semibold text-[#0b1f33]"
                        : "font-medium text-[#2c3e50]",
                    )}
                  >
                    {s.title}
                  </span>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 shrink-0",
                      selected ? "text-[#1a56db]" : "text-[#cfd8e6]",
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ol>

        <div className="relative flex min-h-[22rem] flex-col p-5 sm:p-7">
          <h2 className="text-lg font-semibold text-[#0b1f33]">
            {active?.title}
            {active?.title?.endsWith(".") ? "" : "."}
          </h2>
          <p className="mt-1.5 max-w-xl text-[0.875rem] leading-relaxed text-[#5a6b7d]">
            {active?.detail}
          </p>

          {active?.buildInventory ? (
            <div className="mt-6 flex-1">
              <div className="grid gap-0 overflow-hidden rounded-lg border border-[#e8edf4] sm:grid-cols-2">
                <div className="flex flex-col items-center px-5 py-8 text-center">
                  <Upload className="h-7 w-7 text-[#1a56db]" />
                  <p className="mt-3 text-[0.8rem] leading-snug text-[#5a6b7d]">
                    Bulk import your items/services using file format including
                    .csv and .tsv.
                  </p>
                  <Button
                    className="mt-5"
                    type="button"
                    onClick={() => setImportOpen(true)}
                  >
                    Import Items
                  </Button>
                </div>
                <div className="relative flex flex-col items-center border-t border-[#e8edf4] px-5 py-8 text-center sm:border-t-0 sm:border-l">
                  <span className="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-2 text-[0.7rem] font-semibold text-[#8b9bb0] sm:block">
                    Or
                  </span>
                  <Package className="h-7 w-7 text-[#1a56db]" />
                  <p className="mt-3 text-[0.8rem] leading-snug text-[#5a6b7d]">
                    Manually create the items/services that your business deals
                    with.
                  </p>
                  <Button asChild className="mt-5" variant="secondary">
                    <Link href={withGettingStartedReturn("/catalog/new", "build")}>
                      Add Item
                    </Link>
                  </Button>
                </div>
              </div>
              <p className="mt-4 flex items-start gap-2 text-[0.78rem] text-[#5a6b7d]">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1a56db]" />
                <span>
                  For advanced tracking (batch / serial), enable packs from
                  settings when your shop needs them — core Universal POS stays
                  simple without industry locks.{" "}
                  <Link
                    href={withGettingStartedReturn("/settings", "build")}
                    className="font-semibold text-[#1a56db] hover:underline"
                  >
                    Configure item preferences
                  </Link>
                </span>
              </p>
            </div>
          ) : (
            <div className="mt-6 flex flex-1 flex-col items-center justify-center rounded-lg border border-[#e8edf4] bg-[#f8fafc] px-4 py-8">
              <div className="mb-4 grid h-12 w-12 place-items-center rounded-lg bg-white text-[#1a56db] shadow-sm ring-1 ring-[#e8edf4]">
                {active?.id === "store" ? (
                  <Store className="h-6 w-6" />
                ) : active?.id === "tax" || active?.id === "prefs" ? (
                  <Settings2 className="h-6 w-6" />
                ) : active?.id === "register" || active?.id === "services" ? (
                  <ShoppingCart className="h-6 w-6" />
                ) : active?.id === "customers" ? (
                  <Users className="h-6 w-6" />
                ) : active?.id === "stockup" ? (
                  <FileSpreadsheet className="h-6 w-6" />
                ) : (
                  <Wallet className="h-6 w-6" />
                )}
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {active?.primary ? (
                  <Button asChild>
                    <Link href={active.primary.href}>
                      {active.primary.label}
                    </Link>
                  </Button>
                ) : null}
                {active?.secondary ? (
                  <Button asChild variant="secondary">
                    <Link href={active.secondary.href}>
                      {active.secondary.label}
                    </Link>
                  </Button>
                ) : null}
              </div>
              {active?.tip ? (
                <p className="mt-6 flex max-w-sm items-start gap-2 text-[0.78rem] leading-snug text-[#5a6b7d]">
                  <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1a56db]" />
                  <span>{active.tip}</span>
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <ItemsImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          void floor.refetch();
        }}
      />
    </div>
  );
}
