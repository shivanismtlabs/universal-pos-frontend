"use client";

import { useState } from "react";
import { useBootstrap } from "@/lib/bootstrap";
import { cn } from "@/lib/utils";
import { EmptyState, PageSkeleton } from "@/components/page-header";
import { OverviewDashboard } from "./overview-dashboard";
import { SaleDashboard } from "./sale-dashboard";
import { RentalDashboard } from "./rental-dashboard";
import { SubscriptionDashboard } from "./subscription-dashboard";
import { ServiceDashboard } from "./service-dashboard";

type View = "overview" | "sale" | "rent" | "service" | "subscription";

/**
 * Dashboard — Overview + live mode floors (sale / rent / service / plans).
 */
export default function DashboardPage() {
  const { isLoading, hasMode } = useBootstrap();
  const [view, setView] = useState<View>("overview");

  if (isLoading) {
    return <PageSkeleton rows={6} />;
  }

  const hasSale = hasMode("sale");
  const hasRent = hasMode("rental");
  const hasService = hasMode("service");
  const hasSub = hasMode("subscription");
  const hasAnyMode = hasSale || hasRent || hasService || hasSub;

  if (!hasAnyMode) {
    return (
      <EmptyState
        title="Finish shop setup"
        detail="Choose what your business does so we can show the right counters and products."
      />
    );
  }

  const tabs: Array<{ id: View; label: string; show: boolean }> = [
    { id: "overview", label: "Overview", show: true },
    { id: "sale", label: "Sell floor", show: hasSale },
    { id: "rent", label: "Rent floor", show: hasRent },
    { id: "service", label: "Services", show: hasService },
    { id: "subscription", label: "Plans", show: hasSub },
  ];

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Dashboard views"
        className="inline-flex flex-wrap rounded-lg border border-[#d9e0ea] bg-[#eef2f7] p-0.5"
      >
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={view === t.id}
              onClick={() => setView(t.id)}
              className={cn(
                "rounded-md px-3.5 py-2 text-[0.8125rem] font-semibold transition",
                view === t.id
                  ? "bg-white text-[#1a56db] shadow-sm"
                  : "text-[#5a6b7d] hover:text-[#0b1f33]",
              )}
            >
              {t.label}
            </button>
          ))}
      </div>

      {view === "overview" ? <OverviewDashboard /> : null}
      {view === "sale" ? <SaleDashboard /> : null}
      {view === "rent" ? <RentalDashboard /> : null}
      {view === "service" ? <ServiceDashboard /> : null}
      {view === "subscription" ? <SubscriptionDashboard /> : null}
    </div>
  );
}
