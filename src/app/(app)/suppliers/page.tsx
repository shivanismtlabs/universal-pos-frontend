"use client";

import Link from "next/link";
import { SupplierMasterPanel } from "./supplier-master-panel";

/**
 * Supplier directory — contacts, tax, payment terms, status.
 * Purchase orders live on /suppliers/orders; GRN/AP on /purchases.
 */
export default function SuppliersPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <p className="eyebrow">Purchases</p>
        <h1 className="display mt-1 text-[1.75rem] sm:text-3xl text-[#0b1f33]">
          Supplier directory
        </h1>
        <p className="mt-1 text-sm text-[#475569]">
          Master list for vendors — profile, contacts, tax IDs, and payment
          terms.{" "}
          <Link
            href="/suppliers/new"
            className="font-semibold text-[#1a56db] hover:underline"
          >
            New supplier
          </Link>
          {" · "}
          <Link
            href="/suppliers/orders"
            className="font-semibold text-[#1a56db] hover:underline"
          >
            Purchase orders
          </Link>
          {" · "}
          <Link
            href="/purchases"
            className="font-semibold text-[#1a56db] hover:underline"
          >
            GRN &amp; payables
          </Link>
        </p>
      </header>

      <SupplierMasterPanel />
    </div>
  );
}
