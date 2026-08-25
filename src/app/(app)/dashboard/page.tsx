"use client";

import { Suspense, startTransition, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useBootstrap } from "@/lib/bootstrap";
import { EmptyState, PageSkeleton } from "@/components/page-header";
import { HomeDashboard } from "@/components/home-dashboard";
import { HomeGettingStarted } from "@/components/home-getting-started";
import { OverviewDashboard } from "./overview-dashboard";
import { SaleDashboard } from "./sale-dashboard";
import { RentalDashboard } from "./rental-dashboard";
import { SubscriptionDashboard } from "./subscription-dashboard";
import { ServiceDashboard } from "./service-dashboard";
import { posApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Lock } from "lucide-react";

type HomeTab = "dashboard" | "getting-started" | "floors";
type FloorView = "sale" | "rent" | "service" | "subscription";

function parseHomeTab(raw: string | null): HomeTab | null {
  if (raw === "dashboard" || raw === "getting-started" || raw === "floors") {
    return raw;
  }
  return null;
}

/**
 * Home after login — Zoho-style Dashboard / Getting Started, plus mode floors.
 * Tabs unlock in order as setup progress completes.
 * URL `?tab=getting-started` keeps users on the checklist after setup actions.
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <DashboardPageInner />
    </Suspense>
  );
}

function DashboardPageInner() {
  const { isLoading, hasMode, data: boot } = useBootstrap();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const tabFromUrl = parseHomeTab(search.get("tab"));
  const [homeTab, setHomeTab] = useState<HomeTab>(
    tabFromUrl ?? "getting-started",
  );
  const [floor, setFloor] = useState<FloorView>("sale");

  const hasSale = hasMode("sale");
  const hasRent = hasMode("rental");
  const hasService = hasMode("service");
  const hasSub = hasMode("subscription");
  const hasAnyMode = hasSale || hasRent || hasService || hasSub;

  const floorQ = useQuery({
    queryKey: ["pos-sale-floor"],
    queryFn: () => posApi.saleFloor(),
    enabled: hasSale,
  });

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

  const products = floorQ.data?.counts?.products ?? 0;
  const dashboardUnlocked = taxConfigured;
  const floorsUnlocked = !hasSale || products > 0;

  useEffect(() => {
    if (tabFromUrl) {
      setHomeTab(tabFromUrl);
      return;
    }
    try {
      const seen = localStorage.getItem("upos-home-setup-seen");
      if (seen === "1" && dashboardUnlocked) {
        setHomeTab("dashboard");
        if (search.get("tab") !== "dashboard") {
          const qs = new URLSearchParams(search.toString());
          qs.set("tab", "dashboard");
          router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
        }
      }
    } catch {
      /* ignore */
    }
  }, [tabFromUrl, dashboardUnlocked, pathname, router, search]);

  useEffect(() => {
    if (homeTab === "dashboard" && dashboardUnlocked) {
      try {
        localStorage.setItem("upos-home-setup-seen", "1");
      } catch {
        /* ignore */
      }
    }
  }, [homeTab, dashboardUnlocked]);

  useEffect(() => {
    if (homeTab === "dashboard" && !dashboardUnlocked) {
      setHomeTab("getting-started");
    }
    if (homeTab === "floors" && !floorsUnlocked) {
      setHomeTab("getting-started");
    }
  }, [homeTab, dashboardUnlocked, floorsUnlocked]);

  function syncTabUrl(id: HomeTab) {
    const qs = new URLSearchParams(search.toString());
    if (id === "getting-started") {
      qs.set("tab", "getting-started");
    } else if (id === "dashboard") {
      qs.set("tab", "dashboard");
    } else {
      qs.set("tab", "floors");
    }
    const next = qs.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  if (isLoading) {
    return <PageSkeleton rows={6} />;
  }

  if (!hasAnyMode) {
    return (
      <EmptyState
        title="Complete shop setup"
        detail="Select the commerce modes your shop uses so the correct counters and product catalogues are available."
      />
    );
  }

  const showFloors =
    [hasSale, hasRent, hasService, hasSub].filter(Boolean).length > 0;

  function selectTab(id: HomeTab) {
    if (id === "dashboard" && !dashboardUnlocked) {
      toast.message("Finish tax settings in Getting Started first");
      setHomeTab("getting-started");
      syncTabUrl("getting-started");
      return;
    }
    if (id === "floors" && !floorsUnlocked) {
      toast.message("Add at least one item in Getting Started first");
      setHomeTab("getting-started");
      syncTabUrl("getting-started");
      return;
    }
    startTransition(() => {
      setHomeTab(id);
      syncTabUrl(id);
    });
  }

  return (
    <div className="space-y-5">
      {/* Zoho top tabs */}
      <div className="border-b border-[#d9e0ea]">
        <div
          role="tablist"
          aria-label="Home"
          className="flex flex-wrap gap-0"
        >
          {(
            [
              {
                id: "getting-started" as const,
                label: "Getting Started",
                locked: false,
              },
              {
                id: "dashboard" as const,
                label: "Dashboard",
                locked: !dashboardUnlocked,
              },
              ...(showFloors
                ? [
                    {
                      id: "floors" as const,
                      label: "Shop floors",
                      locked: !floorsUnlocked,
                    },
                  ]
                : []),
            ] as const
          ).map((t) => {
            const active = homeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-disabled={t.locked}
                title={
                  t.locked
                    ? t.id === "dashboard"
                      ? "Complete tax settings first"
                      : "Add inventory items first"
                    : undefined
                }
                onClick={() => selectTab(t.id)}
                className={cn(
                  "-mb-px inline-flex items-center gap-1.5 border-b-2 px-1 pb-2.5 pt-1 text-[0.9rem] font-medium transition sm:mr-6 sm:px-0",
                  active
                    ? "border-[#1a56db] font-semibold text-[#1a56db]"
                    : t.locked
                      ? "border-transparent text-[#b0bac8]"
                      : "border-transparent text-[#5a6b7d] hover:text-[#0b1f33]",
                )}
              >
                {t.label}
                {t.locked ? <Lock className="h-3 w-3 opacity-70" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      {homeTab === "dashboard" ? (
        <div className="space-y-6">
          <HomeDashboard />
          <OverviewDashboard embed />
        </div>
      ) : null}

      {homeTab === "getting-started" ? <HomeGettingStarted /> : null}

      {homeTab === "floors" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: "sale" as const, label: "Catalog & sell", show: hasSale },
                { id: "rent" as const, label: "Rental floor", show: hasRent },
                {
                  id: "service" as const,
                  label: "Services",
                  show: hasService,
                },
                {
                  id: "subscription" as const,
                  label: "Memberships",
                  show: hasSub,
                },
              ] as const
            )
              .filter((t) => t.show)
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => startTransition(() => setFloor(t.id))}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-[0.8rem] font-semibold transition",
                    floor === t.id
                      ? "bg-[#1a56db] text-white"
                      : "bg-white text-[#5a6b7d] ring-1 ring-[#d9e0ea]",
                  )}
                >
                  {t.label}
                </button>
              ))}
          </div>
          {floor === "sale" && hasSale ? <SaleDashboard embed /> : null}
          {floor === "rent" && hasRent ? <RentalDashboard /> : null}
          {floor === "service" && hasService ? <ServiceDashboard /> : null}
          {floor === "subscription" && hasSub ? (
            <SubscriptionDashboard />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
