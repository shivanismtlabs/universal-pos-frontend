"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RentalDashboard } from "../dashboard/rental-dashboard";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { useBootstrap } from "@/lib/bootstrap";

type RentalTab = "rent" | "stock" | "returns" | "exchange" | "recent";

function parseRentalTab(raw: string | null): RentalTab | undefined {
  if (
    raw === "rent" ||
    raw === "stock" ||
    raw === "returns" ||
    raw === "exchange" ||
    raw === "recent"
  ) {
    return raw;
  }
  return undefined;
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
        title="Rental"
        subtitle="Enable rental mode in shop setup to manage outfits and units here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rental"
        subtitle={
          hasSale
            ? "Everything you rent lives here — sizes, barcodes, returns. Items is for things you sell."
            : "Stock, rent out, receive returns, and track units on hire."
        }
      />

      {hasSale ? (
        <div className="rounded-xl border border-[#dbeafe] bg-[#eff6ff] px-4 py-3 text-sm text-[#1e40af]">
          <strong className="font-semibold">Two counters:</strong>{" "}
          <Link href="/catalog" className="font-medium underline underline-offset-2">
            Items
          </Link>{" "}
          + Counter · Sell = retail ·{" "}
          <span className="font-medium">this desk</span> + Counter · Rent =
          outfits (one barcode per size).
        </div>
      ) : null}

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
