"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
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
import { posApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { useAuthStore } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { ItemsImportDialog } from "@/components/items-import-dialog";
import { cn } from "@/lib/utils";

type StepId =
  | "store"
  | "tax"
  | "build"
  | "stockup"
  | "prefs"
  | "register"
  | "customers";

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

function firstName(full?: string | null) {
  if (!full?.trim()) return "there";
  const parts = full.trim().split(/\s+/);
  if (parts[0]?.toLowerCase() === "shop" && parts.length > 1) {
    return parts.slice(1).join(" ");
  }
  return parts[0] ?? "there";
}

/**
 * Zoho-style Getting Started for Universal POS.
 * commerce-mode aware — sale unlocks inventory steps; never industry-hardcoded.
 */
export function HomeGettingStarted() {
  const { hasMode, productName, data: boot } = useBootstrap();
  const user = useAuthStore((s) => s.user);
  const hasSale = hasMode("sale");
  const [importOpen, setImportOpen] = useState(false);

  const floor = useQuery({
    queryKey: ["pos-sale-floor"],
    queryFn: () => posApi.saleFloor(),
    enabled: hasSale,
  });

  const products = floor.data?.counts?.products ?? 0;
  const inStock = floor.data?.counts?.inStock ?? 0;

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
    if (t.taxMode === "none") return true;
    return (
      typeof tax.ratePercent === "number" ||
      (typeof tax.ratePercent === "string" && tax.ratePercent.trim() !== "")
    );
  }, [boot?.tenant]);

  const prefsConfigured = useMemo(() => {
    const branding = boot?.tenant?.branding;
    return Boolean(
      branding?.productName?.trim() || branding?.tagline?.trim(),
    );
  }, [boot?.tenant?.branding]);

  const steps = useMemo((): StepDef[] => {
    const list: StepDef[] = [
      {
        id: "store",
        n: 1,
        title: "Create a store",
        detail:
          "Your organization and default location are ready. Add more stores anytime from settings.",
        tip: "Universal POS supports multi-store later without changing how items work.",
        primary: { label: "Open settings", href: "/settings" },
        done: true,
      },
      {
        id: "tax",
        n: 2,
        title: "Configure tax settings",
        detail:
          "Set tax IDs, rates, and receipt fields so invoices match your region (GST/VAT or none).",
        tip: "Tax applies at checkout for any commerce mode you enable.",
        primary: { label: "Tax & shop settings", href: "/settings" },
        done: taxConfigured,
      },
    ];

    if (hasSale) {
      list.push(
        {
          id: "build",
          n: 3,
          title: "Build your inventory",
          detail:
            "Bulk import your items/services using a file, or create them one by one — same catalog for every industry.",
          tip: "Categories auto-create from CSV when missing. Prefer short universal SKUs.",
          buildInventory: true,
          done: products > 0,
        },
        {
          id: "stockup",
          n: 4,
          title: "Stock up your inventory",
          detail:
            "Raise opening stock via purchases or stock adjust so the counter never sells negative quantities.",
          tip: "Purchases from suppliers restock multiple items at once.",
          primary: { label: "Suppliers / purchases", href: "/suppliers" },
          secondary: { label: "Stock levels", href: "/inventory" },
          done: products > 0 && inStock > 0,
        },
      );
    }

    list.push(
      {
        id: "prefs",
        n: list.length + 1,
        title: "Manage store preferences",
        detail:
          "Branding, receipts, PIN switch, and commerce modes stay under one shop profile.",
        primary: { label: "Preferences", href: "/settings" },
        secondary: { label: "Software plan", href: "/plan" },
        done: prefsConfigured,
      },
      {
        id: "register",
        n: list.length + 2,
        title: "Setup POS register",
        detail:
          "Open the counter, run a sales register for the shift, and take your first payment.",
        primary: { label: "Open counter", href: "/counter" },
        secondary: { label: "All orders", href: "/orders" },
        done: prefsConfigured,
      },
      {
        id: "customers",
        n: list.length + 3,
        title: "Customers & reports",
        detail:
          "Save customers for credit and history. Review sales and export CSV when needed.",
        primary: { label: "Customers", href: "/customers" },
        secondary: { label: "Reports", href: "/reports" },
        done: prefsConfigured,
      },
    );

    return list.map((s, i) => ({ ...s, n: i + 1 }));
  }, [hasSale, products, inStock, taxConfigured, prefsConfigured]);

  const unlockedIds = useMemo(() => {
    const ids = new Set<StepId>();
    let lockedRest = false;
    for (const step of steps) {
      if (lockedRest) break;
      ids.add(step.id);
      if (!step.done) lockedRest = true;
    }
    return ids;
  }, [steps]);

  const firstOpen =
    steps.find((s) => unlockedIds.has(s.id) && !s.done)?.id ??
    steps.find((s) => unlockedIds.has(s.id))?.id ??
    steps[0]?.id ??
    "store";
  const [activeId, setActiveId] = useState<StepId>(firstOpen);

  useEffect(() => {
    if (!unlockedIds.has(activeId)) {
      setActiveId(firstOpen);
    }
  }, [activeId, firstOpen, unlockedIds]);

  const active = steps.find((s) => s.id === activeId) ?? steps[0];
  const doneCount = steps.filter((s) => s.done).length;
  const total = steps.length;
  const progress = total ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.65rem] font-semibold tracking-tight text-[#0b1f33] sm:text-[1.85rem]">
            Welcome, {firstName(user?.fullName)}!
          </h1>
          <p className="mt-1.5 text-[0.9rem] text-[#5a6b7d]">
            Follow this checklist to get started with{" "}
            {productName || "Universal POS"}.
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
            const locked = !unlockedIds.has(s.id);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={locked}
                  title={
                    locked
                      ? "Complete the previous step first"
                      : undefined
                  }
                  onClick={() => {
                    if (!locked) setActiveId(s.id);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3.5 text-left transition sm:px-5",
                    locked
                      ? "cursor-not-allowed bg-[#f8fafc] opacity-55"
                      : selected
                        ? "bg-[#eef4ff]"
                        : "bg-white hover:bg-[#f8fafc]",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[0.75rem] font-semibold",
                      s.done
                        ? "bg-[#1a56db] text-white"
                        : locked
                          ? "border border-[#d9e0ea] text-[#9aa8b8]"
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
                      locked
                        ? "font-medium text-[#8b9bb0]"
                        : selected
                          ? "font-semibold text-[#0b1f33]"
                          : "font-medium text-[#2c3e50]",
                    )}
                  >
                    {s.title}
                    {locked ? (
                      <span className="mt-0.5 block text-[0.7rem] font-normal text-[#9aa8b8]">
                        Complete previous step to unlock
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 shrink-0",
                      locked
                        ? "text-[#d9e0ea]"
                        : selected
                          ? "text-[#1a56db]"
                          : "text-[#cfd8e6]",
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
                    <Link href="/catalog/new">Add Item</Link>
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
                    href="/settings"
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
                ) : active?.id === "register" ? (
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
