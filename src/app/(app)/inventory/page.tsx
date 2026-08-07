"use client";

import Link from "next/link";
import { RequireCommerceMode } from "@/components/require-commerce-mode";

/**
 * Legacy Gen-1 inventory UI removed — barcode units live on the Rent floor
 * (Home → Rent → stock) and sale qty on Products / Sale stock panel.
 */
export default function InventoryPage() {
  return (
    <RequireCommerceMode modes={["rental"]} label="Barcode units need rental mode">
      <div className="mx-auto max-w-lg rounded-xl border border-[#d9e0ea] bg-white p-8 text-center">
        <h1 className="text-xl font-bold text-[#0b1f33]">Barcode units moved</h1>
        <p className="mt-2 text-sm text-[#5a6b7d]">
          Manage rental units from the Rent floor on Home (stock panel). Sale qty
          products stay under Products.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center rounded-[10px] bg-[#1a56db] px-4 text-sm font-semibold text-white hover:bg-[#1341a8]"
          >
            Open Home
          </Link>
          <Link
            href="/catalog"
            className="inline-flex h-10 items-center rounded-[10px] border border-[#cfd8e6] bg-white px-4 text-sm font-semibold text-[#0b1f33]"
          >
            Products
          </Link>
        </div>
      </div>
    </RequireCommerceMode>
  );
}
