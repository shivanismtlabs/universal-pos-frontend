"use client";

import { Suspense } from "react";
import { CatalogItemEditor } from "@/components/catalog-item-editor";

/**
 * Edit Item — same form as New Item (`CatalogItemEditor` + `?id=`).
 * Prefer linking to `/catalog/new?id=` elsewhere; this route stays for bookmarks.
 */
export default function EditCatalogProductRoute() {
  return (
    <Suspense
      fallback={<p className="p-8 text-sm text-[#5a6b7d]">Loading item…</p>}
    >
      <CatalogItemEditor />
    </Suspense>
  );
}
