"use client";

/**
 * Items module — Zoho Inventory–style product list (Name · SKU · Rate · Stock on Hand).
 * Commerce stays universal (sale mode), not per-industry.
 */
import { SaleStockPanel } from "@/app/(app)/dashboard/sale-stock-panel";
import { ModeBadge } from "@/components/mode-badge";

export default function CatalogPage() {
  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#eef1f4] pb-3">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-bold tracking-[0.12em] text-[#1a56db] uppercase">
            Inventory
          </p>
          <h1 className="mt-0.5 text-[1.4rem] font-semibold tracking-tight text-[#0b1f33]">
            Items
          </h1>
          <p className="mt-0.5 text-[0.8rem] text-[#5a6b7d]">
            All items · sort by name · filter status and category
          </p>
        </div>
        <ModeBadge mode="sale" />
      </header>

      <SaleStockPanel />
    </div>
  );
}
