"use client";

import { Suspense } from "react";
import { CatalogItemEditor } from "@/components/catalog-item-editor";

/** Create Item — and Edit Item via `?id=` (same page + form). */
export default function NewCatalogProductPage() {
  return (
    <Suspense
      fallback={<p className="p-8 text-sm text-[#5a6b7d]">Loading…</p>}
    >
      <CatalogItemEditor />
    </Suspense>
  );
}
