"use client";

import { useState } from "react";
import { useBootstrap } from "@/lib/bootstrap";
import { cn } from "@/lib/utils";
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
 * Home floors for each enabled commerce mode.
 * Mode list comes from tenant bootstrap — never hardcoded shop type.
 */
export default function DashboardPage() {
  const { isLoading, hasMode, commerceModes } = useBootstrap();
  const [floor, setFloor] = useState<Floor>("sale");

  if (isLoading) {
    return (
      <p className="py-16 text-center text-sm text-[#5a6b7d]">Loading…</p>
    );
  }

  const available = FLOOR_META.filter((f) => hasMode(f.mode));
  const active =
    available.find((f) => f.id === floor) ?? available[0] ?? null;

  if (!available.length) {
    return (
      <p className="rounded-xl border border-[#d9e0ea] bg-white p-8 text-center text-sm text-[#5a6b7d]">
        No commerce modes enabled yet. Complete shop setup to continue.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {available.length > 1 ? (
        <div
          role="tablist"
          aria-label="Commerce floors"
          className="inline-flex flex-wrap rounded-lg border border-[#d9e0ea] bg-[#eef2f7] p-0.5"
        >
          {available.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={active?.id === f.id}
              onClick={() => setFloor(f.id)}
              className={cn(
                "rounded-md px-4 py-2 text-[0.8125rem] font-semibold transition",
                active?.id === f.id
                  ? "bg-white text-[#1a56db] shadow-sm"
                  : "text-[#5a6b7d] hover:text-[#0b1f33]",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}

      {active?.id === "sale" ? <SaleDashboard /> : null}
      {active?.id === "rent" ? <RentalDashboard /> : null}
      {active?.id === "service" || active?.id === "subscription" ? (
        <div className="rounded-xl border border-[#d9e0ea] bg-white p-8">
          <h1 className="text-xl font-bold text-[#0b1f33]">
            {active.label}
          </h1>
          <p className="mt-2 text-sm text-[#5a6b7d]">
            Mode <code className="text-[#1a56db]">{active.mode}</code> is enabled
            for this shop ({commerceModes.join(", ")}). Dedicated KPI panel and
            counter for this mode ship next — catalog create already accepts
            these field schemas.
          </p>
        </div>
      ) : null}
    </div>
  );
}
