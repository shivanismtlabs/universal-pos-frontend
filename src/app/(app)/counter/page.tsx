"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useBootstrap } from "@/lib/bootstrap";
import PosWorkstation from "./pos-workstation";
import RetailPosWorkstation from "./retail-pos-workstation";
import { ServiceDashboard } from "@/app/(app)/dashboard/service-dashboard";
import { SubscriptionDashboard } from "@/app/(app)/dashboard/subscription-dashboard";

type CounterView = "sale" | "rental" | "service" | "subscription";

/**
 * Unified Transaction Desk — capability-driven, not industry-specific.
 *
 * All enabled commerce modes are available as tabs from one page.
 * No business is forced to navigate to a separate Dashboard just to charge
 * a service or enrol a subscription. Tabs only appear when the mode is enabled.
 */
function PosGate() {
  const { isLoading, hasMode, commerceModes } = useBootstrap();
  const params = useSearchParams();

  const hasSale = hasMode("sale");
  const hasRent = hasMode("rental");
  const hasSvc = hasMode("service");
  const hasSub = hasMode("subscription");

  // Determine initial tab from ?view= param or smart default
  const viewParam = params.get("view");
  function defaultView(): CounterView {
    if (viewParam === "rental" || viewParam === "rent")
      return hasRent ? "rental" : defaultFallback();
    if (viewParam === "service") return hasSvc ? "service" : defaultFallback();
    if (viewParam === "subscription") return hasSub ? "subscription" : defaultFallback();
    return defaultFallback();
  }
  function defaultFallback(): CounterView {
    if (hasSale) return "sale";
    if (hasRent) return "rental";
    if (hasSvc) return "service";
    if (hasSub) return "subscription";
    return "sale";
  }

  const [view, setView] = useState<CounterView>(defaultView);

  if (isLoading) {
    return <p className="text-sm text-[#6b7280]">Opening counter…</p>;
  }

  if (!commerceModes.length) {
    return (
      <p className="rounded-xl border border-[#d9e0ea] bg-white p-6 text-sm text-[#5a6b7d]">
        Commerce modes are not configured yet. Complete setup from the{" "}
        <Link href="/dashboard" className="font-semibold text-[#1a56db]">
          dashboard
        </Link>
        .
      </p>
    );
  }

  const tabs = [
    { id: "sale" as const, label: "Sell", show: hasSale },
    { id: "rental" as const, label: "Rent", show: hasRent },
    { id: "service" as const, label: "Services", show: hasSvc },
    { id: "subscription" as const, label: "Plans / Memberships", show: hasSub },
  ].filter((t) => t.show);

  // Ensure active view is valid for current modes
  const activeView =
    tabs.some((t) => t.id === view) ? view : (tabs[0]?.id ?? "sale");

  const showTabs = tabs.length > 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {showTabs ? (
        <div className="z-10 shrink-0 border-b border-[#d9e0ea] bg-white">
          <div
            role="tablist"
            aria-label="Counter mode"
            className="flex flex-wrap gap-0 px-4"
          >
            {tabs.map((t) => {
              const active = activeView === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setView(t.id)}
                  className={cn(
                    "-mb-px inline-flex items-center border-b-2 px-4 py-3 text-sm font-medium transition",
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
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeView === "sale" && hasSale ? <RetailPosWorkstation /> : null}
        {activeView === "rental" && hasRent ? <PosWorkstation /> : null}
        {activeView === "service" && hasSvc ? (
          <div className="h-full overflow-y-auto p-4">
            <ServiceDashboard embed />
          </div>
        ) : null}
        {activeView === "subscription" && hasSub ? (
          <div className="h-full overflow-y-auto p-4">
            <SubscriptionDashboard />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function PosPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-[#6b7280]">Opening counter…</p>}
    >
      <PosGate />
    </Suspense>
  );
}
