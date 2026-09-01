"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Repeat } from "lucide-react";
import { posApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";

/**
 * Home dashboard shortcut — one card instead of embedding the full rental desk.
 */
export function RentalHomeCard() {
  const { hasMode } = useBootstrap();
  const hasSale = hasMode("sale");
  const floor = useQuery({
    queryKey: ["pos-rental-floor-home"],
    queryFn: () => posApi.rentalFloor(),
  });
  const counts = floor.data?.counts;

  return (
    <section className="rounded-2xl border border-[#d9e0ea] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eff6ff] text-[#1a56db]">
            <Repeat className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-[#0b1f33]">Rental desk</h2>
            <p className="mt-0.5 max-w-xl text-sm text-[#5a6b7d]">
              {hasSale
                ? "Outfits, sizes, and barcodes — separate from sale Items."
                : "Manage rental stock, open tickets, and returns."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/counter?view=rental">Counter → Rent</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/rental">
              Open rental desk
              <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Styles", value: counts?.products ?? 0 },
          { label: "Units", value: counts?.units ?? 0 },
          { label: "Available", value: counts?.available ?? 0 },
          { label: "Out on rent", value: counts?.checkedOut ?? 0 },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-[#eef2f6] bg-[#f8fafc] px-3 py-2.5"
          >
            <p className="text-[0.65rem] font-semibold tracking-wide text-[#8b9bb0] uppercase">
              {c.label}
            </p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-[#0b1f33]">
              {floor.isLoading ? "—" : c.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
