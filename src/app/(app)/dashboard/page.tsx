"use client";

import { useEffect, useState } from "react";
import { useBootstrap } from "@/lib/bootstrap";
import { EmptyState, PageSkeleton } from "@/components/page-header";
import { HomeDashboard } from "@/components/home-dashboard";
import { HomeGettingStarted } from "@/components/home-getting-started";
import { OverviewDashboard } from "./overview-dashboard";
import { SaleDashboard } from "./sale-dashboard";
import { RentalDashboard } from "./rental-dashboard";
import { SubscriptionDashboard } from "./subscription-dashboard";
import { ServiceDashboard } from "./service-dashboard";
import { cn } from "@/lib/utils";

type HomeTab = "dashboard" | "getting-started" | "floors";
type FloorView = "sale" | "rent" | "service" | "subscription";

/**
 * Home after login — Zoho-style Dashboard / Getting Started, plus mode floors.
 */
export default function DashboardPage() {
  const { isLoading, hasMode } = useBootstrap();
  const [homeTab, setHomeTab] = useState<HomeTab>("getting-started");
  const [floor, setFloor] = useState<FloorView>("sale");

  const hasSale = hasMode("sale");
  const hasRent = hasMode("rental");
  const hasService = hasMode("service");
  const hasSub = hasMode("subscription");
  const hasAnyMode = hasSale || hasRent || hasService || hasSub;

  useEffect(() => {
    try {
      const seen = localStorage.getItem("upos-home-setup-seen");
      if (seen === "1") setHomeTab("dashboard");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (homeTab !== "getting-started") {
      try {
        localStorage.setItem("upos-home-setup-seen", "1");
      } catch {
        /* ignore */
      }
    }
  }, [homeTab]);

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
              { id: "dashboard" as const, label: "Dashboard" },
              { id: "getting-started" as const, label: "Getting Started" },
              ...(showFloors
                ? [{ id: "floors" as const, label: "Shop floors" }]
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
                onClick={() => setHomeTab(t.id)}
                className={cn(
                  "-mb-px border-b-2 px-1 pb-2.5 pt-1 text-[0.9rem] font-medium transition sm:mr-6 sm:px-0",
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

      {homeTab === "dashboard" ? (
        <div className="space-y-6">
          <HomeDashboard />
          {/* Detailed KPIs under Zoho-style invoice summary */}
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
                  onClick={() => setFloor(t.id)}
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
