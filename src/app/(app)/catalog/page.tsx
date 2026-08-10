"use client";

/**
 * Items module — single list surface (no nested POS/sales tabs).
 * Counter and sales history live under Sales / Orders in the main nav.
 */
import { SaleStockPanel } from "@/app/(app)/dashboard/sale-stock-panel";
import { ModeBadge } from "@/components/mode-badge";

export default function CatalogPage() {
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-bold tracking-[0.12em] text-[#1a56db] uppercase">
            Inventory
          </p>
          <h1 className="mt-0.5 text-[1.35rem] font-semibold tracking-tight text-[#0b1f33]">
            Items
          </h1>
          <p className="mt-1 max-w-xl text-[0.85rem] text-[#5a6b7d]">
            Catalog, stock on hand, and pricing for this shop — add one item or
            import in bulk.
          </p>
        </div>
        <ModeBadge mode="sale" />
      </header>

      <SaleStockPanel />
    </div>
  );
}
