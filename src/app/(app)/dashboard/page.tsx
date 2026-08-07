"use client";

import { useState } from "react";
import Link from "next/link";
import { useBootstrap } from "@/lib/bootstrap";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState, PageSkeleton } from "@/components/page-header";
import { ModeBadge } from "@/components/mode-badge";
import { SaleDashboard } from "./sale-dashboard";
import { RentalDashboard } from "./rental-dashboard";

type Floor = "sale" | "rent" | "service" | "subscription";

const FLOOR_META: Array<{
  id: Floor;
  mode: string;
  label: string;
}> = [
  { id: "sale", mode: "sale", label: "Sale" },
  { id: "rent", mode: "rental", label: "Rent" },
  { id: "service", mode: "service", label: "Services" },
  { id: "subscription", mode: "subscription", label: "Plans" },
];

/**
 * Start here — today's snapshot per enabled mode.
 */
export default function DashboardPage() {
  const { isLoading, hasMode, commerceModes } = useBootstrap();
  const [floor, setFloor] = useState<Floor>("sale");

  if (isLoading) {
    return <PageSkeleton rows={5} />;
  }

  const available = FLOOR_META.filter((f) => hasMode(f.mode));
  const active =
    available.find((f) => f.id === floor) ?? available[0] ?? null;

  if (!available.length) {
    return (
      <EmptyState
        title="Finish shop setup"
        detail="Choose what your business does so we can show the right counters and products."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Start here"
        subtitle="Today’s snapshot for each enabled mode. Open the counter when you’re ready to check out."
        action={
          <Button asChild>
            <Link href="/pos">Open counter</Link>
          </Button>
        }
      />

      {available.length > 1 ? (
        <div
          role="tablist"
          aria-label="Commerce floors"
          className="inline-flex flex-wrap rounded-lg border border-[var(--line)] bg-[#eef2f7] p-0.5"
        >
          {available.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={active?.id === f.id}
              onClick={() => setFloor(f.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-4 py-2 text-[0.8125rem] font-medium transition",
                active?.id === f.id
                  ? "bg-white text-[#1a56db] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--ink)]",
              )}
            >
              <ModeBadge mode={f.mode} />
              <span className="sr-only sm:not-sr-only sm:inline">
                {f.label}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-caption text-[var(--muted)]">
          <span>Active mode</span>
          <ModeBadge mode={available[0].mode} />
        </div>
      )}

      {active?.id === "sale" ? <SaleDashboard /> : null}
      {active?.id === "rent" ? <RentalDashboard /> : null}
      {active?.id === "service" || active?.id === "subscription" ? (
        <EmptyState
          title={`${active.label} floor is on`}
          detail={`Mode ${active.mode} is enabled (${commerceModes.join(", ")}). Add catalog items under Products, then check out from the counter when the flow ships.`}
          action={
            <Button asChild variant="secondary">
              <Link href="/catalog">Go to products</Link>
            </Button>
          }
        />
      ) : null}
    </div>
  );
}
