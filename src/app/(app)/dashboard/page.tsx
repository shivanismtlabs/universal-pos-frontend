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
 * Dashboard — Overview first, then mode floors. Single page header + tabs.
 */
export default function DashboardPage() {
  const { isLoading, hasMode, productName } = useBootstrap();
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
        title="Complete shop setup"
        detail="Select the commerce modes your shop uses so the correct counters and catalogs are available."
      />
    );
  }

  const tabs: Array<{ id: View; label: string; show: boolean }> = [
    { id: "overview", label: "Overview", show: true },
    { id: "sale", label: "Catalog & sell", show: hasSale },
    { id: "rent", label: "Rental floor", show: hasRent },
    { id: "service", label: "Services", show: hasService },
    { id: "subscription", label: "Memberships", show: hasSub },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">{productName || "Dashboard"}</h1>
          <p className="page-subtitle mt-1">
            Sales performance, inventory status, and quick actions for your shop.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Dashboard views"
          className="inline-flex w-full max-w-full flex-wrap gap-0.5 rounded-xl border border-[#d9e0ea] bg-[#eef2f7] p-1 sm:w-auto"
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
                  "min-h-10 flex-1 rounded-lg px-3 py-2 text-[0.8125rem] font-semibold whitespace-nowrap transition sm:flex-none",
                  view === t.id
                    ? "bg-white text-[#1a56db] shadow-sm"
                    : "text-[#5a6b7d] hover:text-[#0b1f33]",
                )}
              >
                {t.label}
              </button>
            ))}
        </div>
      </div>

      <div className="min-w-0">
        {view === "overview" ? <OverviewDashboard embed /> : null}
        {view === "sale" ? <SaleDashboard embed /> : null}
        {view === "rent" ? <RentalDashboard /> : null}
        {view === "service" ? <ServiceDashboard /> : null}
        {view === "subscription" ? <SubscriptionDashboard /> : null}
      </div>
    </div>
  );
}
