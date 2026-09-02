"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RentalDashboard } from "../dashboard/rental-dashboard";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { useBootstrap } from "@/lib/bootstrap";

type RentalTab =
  | "overview"
  | "products"
  | "units"
  | "reservations"
  | "calendar"
  | "active"
  | "overdue"
  | "returns"
  | "exchange"
  /** @deprecated deep-link aliases */
  | "rent"
  | "stock"
  | "recent";

function parseRentalTab(raw: string | null): RentalTab | undefined {
  if (!raw) return undefined;
  const aliases: Record<string, RentalTab> = {
    rent: "overview",
    stock: "products",
    recent: "active",
    overview: "overview",
    products: "products",
    units: "units",
    reservations: "reservations",
    calendar: "calendar",
    active: "active",
    overdue: "overdue",
    returns: "returns",
    exchange: "exchange",
  };
  return aliases[raw];
}

function RentalHubInner() {
  const { hasMode } = useBootstrap();
  const hasSale = hasMode("sale");
  const hasRent = hasMode("rental");
  const search = useSearchParams();
  const initialTab = parseRentalTab(search.get("tab"));

  if (!hasRent) {
    return (
      <PageHeader
        title="Rental Desk"
        subtitle="Enable rental mode in shop setup to manage rental products and units here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rental Desk"
        subtitle={
          hasSale
            ? "Rental products, physical units, reservations, and active hire — separate from Items you sell."
            : "Products, units, reservations, pickups, returns, and overdue rentals."
        }
      />

      {hasSale ? (
        <p className="text-sm text-[#5a6b7d]">
          Sale catalog stays under{" "}
          <Link href="/catalog" className="font-medium text-[#1a56db] hover:underline">
            Items
          </Link>
          . Start a rental ticket on{" "}
          <Link
            href="/counter?view=rental"
            className="font-medium text-[#1a56db] hover:underline"
          >
            Counter → Rent
          </Link>
          .
        </p>
      ) : (
        <p className="text-sm text-[#5a6b7d]">
          Checkout on{" "}
          <Link
            href="/counter?view=rental"
            className="font-medium text-[#1a56db] hover:underline"
          >
            Counter → Rent
          </Link>
          .
        </p>
      )}

      <RentalDashboard embed initialTab={initialTab} />
    </div>
  );
}

export default function RentalHubPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={8} />}>
      <RentalHubInner />
    </Suspense>
  );
}
