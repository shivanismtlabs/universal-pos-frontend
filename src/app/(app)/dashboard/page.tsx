"use client";

import { Suspense, startTransition, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useBootstrap } from "@/lib/bootstrap";
import { EmptyState, PageSkeleton } from "@/components/page-header";
import { HomeDashboard } from "@/components/home-dashboard";
import { HomeGettingStarted } from "@/components/home-getting-started";
import { OverviewDashboard } from "./overview-dashboard";
import { SaleDashboard } from "./sale-dashboard";
import { RentalHomeCard } from "@/components/rental-home-card";
import { SubscriptionDashboard } from "./subscription-dashboard";
import { ServiceDashboard } from "./service-dashboard";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";

type HomeTab = "dashboard" | "getting-started" | "floors";
type FloorView = "sale" | "rent" | "service" | "subscription";

function homeSetupSeenKey(tenantId?: string | null) {
  return tenantId
    ? `upos-home-setup-seen:${tenantId}`
    : "upos-home-setup-seen";
}

function parseHomeTab(raw: string | null): HomeTab | null {
  if (raw === "dashboard" || raw === "getting-started" || raw === "floors") {
    return raw;
  }
  return null;
}

/**
 * Home after login — Zoho-style Dashboard / Getting Started, plus mode floors.
 * Tabs stay freely switchable; URL `?tab=` syncs selection.
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <DashboardPageInner />
    </Suspense>
  );
}

function DashboardPageInner() {
  const { isLoading, hasMode } = useBootstrap();
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const tabFromUrl = parseHomeTab(search.get("tab"));
  const floorFromUrl = search.get("floor") as FloorView | null;
  const [homeTab, setHomeTab] = useState<HomeTab>(
    tabFromUrl ?? (floorFromUrl ? "floors" : "getting-started"),
  );

  const hasSale = hasMode("sale");
  const hasRent = hasMode("rental");
  const hasService = hasMode("service");
  const hasSub = hasMode("subscription");
  const hasAnyMode = hasSale || hasRent || hasService || hasSub;

  const enabledFloors = useMemo((): FloorView[] => {
    const list: FloorView[] = [];
    if (hasSale) list.push("sale");
    if (hasService) list.push("service");
    if (hasSub) list.push("subscription");
    return list;
  }, [hasSale, hasService, hasSub]);

  /** Shop floors tab is for multi-mode shops only (Zoho Home). */
  const showFloors = enabledFloors.length > 1;

  const [floor, setFloor] = useState<FloorView>(() => {
    if (
      floorFromUrl &&
      (["sale", "rent", "service", "subscription"] as const).includes(
        floorFromUrl,
      )
    ) {
      return floorFromUrl;
    }
    return enabledFloors[0] ?? "sale";
  });

  useEffect(() => {
    if (
      floorFromUrl &&
      enabledFloors.includes(floorFromUrl as FloorView)
    ) {
      setFloor(floorFromUrl as FloorView);
      if (showFloors && homeTab !== "floors") {
        setHomeTab("floors");
      }
    }
  }, [floorFromUrl, enabledFloors, showFloors, homeTab]);

  useEffect(() => {
    if (floorFromUrl === "rent" && hasRent) {
      router.replace("/rental");
    }
  }, [floorFromUrl, hasRent, router]);

  useEffect(() => {
    if (!enabledFloors.includes(floor)) {
      setFloor(enabledFloors[0] ?? "sale");
    }
  }, [enabledFloors, floor]);

  useEffect(() => {
    if (isLoading) return;
    if (tabFromUrl === "floors" && !showFloors) {
      setHomeTab("dashboard");
      if (search.get("tab") !== "dashboard") {
        const qs = new URLSearchParams(search.toString());
        qs.set("tab", "dashboard");
        router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
      }
      return;
    }
    if (tabFromUrl) {
      setHomeTab(tabFromUrl);
      return;
    }
    try {
      const seen =
        localStorage.getItem(homeSetupSeenKey(tenantId)) === "1" ||
        (!tenantId && localStorage.getItem("upos-home-setup-seen") === "1");
      if (seen) {
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
  }, [tabFromUrl, showFloors, isLoading, pathname, router, search, tenantId]);

  useEffect(() => {
    if (homeTab === "dashboard" && tenantId) {
      try {
        localStorage.setItem(homeSetupSeenKey(tenantId), "1");
      } catch {
        /* ignore */
      }
    }
  }, [homeTab, tenantId]);

  function syncTabUrl(id: HomeTab) {
    const qs = new URLSearchParams(search.toString());
    if (id === "getting-started") {
      qs.set("tab", "getting-started");
    } else if (id === "floors" && showFloors) {
      qs.set("tab", "floors");
    } else {
      qs.set("tab", "dashboard");
    }
    const next = qs.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  if (isLoading) {
    return <PageSkeleton rows={6} />;
  }

  const wantGettingStarted =
    tabFromUrl === "getting-started" || homeTab === "getting-started";

  /** New shops land on Getting Started even before commerce modes finish hydrating. */
  if (!hasAnyMode && !wantGettingStarted) {
    return (
      <EmptyState
        title="Complete shop setup"
        detail="Select the commerce modes your shop uses so the correct counters and product catalogues are available."
      />
    );
  }

  function selectTab(id: HomeTab) {
    startTransition(() => {
      setHomeTab(id);
      syncTabUrl(id);
    });
  }

  const visibleHomeTab: HomeTab = !hasAnyMode
    ? "getting-started"
    : homeTab === "floors" && !showFloors
      ? "dashboard"
      : homeTab;

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
              },
              {
                id: "dashboard" as const,
                label: "Dashboard",
              },
              ...(showFloors
                ? [
                    {
                      id: "floors" as const,
                      label: "Shop floors",
                    },
                  ]
                : []),
            ] as const
          ).map((t) => {
            const active = visibleHomeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectTab(t.id)}
                className={cn(
                  "-mb-px inline-flex items-center gap-1.5 border-b-2 px-1 pb-2.5 pt-1 text-[0.9rem] font-medium transition sm:mr-6 sm:px-0",
                  active
                    ? "border-[#1a56db] font-semibold text-[#1a56db]"
                    : "border-transparent text-[#5a6b7d] hover:text-[#0b1f33]",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {visibleHomeTab === "dashboard" ? (
        <div className="space-y-6">
          <HomeDashboard />
          {hasRent ? <RentalHomeCard /> : null}
          <OverviewDashboard embed />
        </div>
      ) : null}

      {visibleHomeTab === "getting-started" ? <HomeGettingStarted /> : null}

      {visibleHomeTab === "floors" && showFloors ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: "sale" as const, label: "Catalog & sell", show: hasSale },
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
          {floor === "service" && hasService ? <ServiceDashboard /> : null}
          {floor === "subscription" && hasSub ? (
            <SubscriptionDashboard />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
