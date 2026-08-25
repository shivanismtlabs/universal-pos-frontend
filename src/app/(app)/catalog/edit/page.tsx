"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Edit Item uses the same page as New Item (`/catalog/new?id=`). */
function EditRedirect() {
  const router = useRouter();
  const search = useSearchParams();
  const id = search.get("id")?.trim() || "";

  useEffect(() => {
    const qs = new URLSearchParams(search.toString());
    if (id) qs.set("id", id);
    const s = qs.toString();
    router.replace(s ? `/catalog/new?${s}` : "/catalog/new");
  }, [id, router, search]);

  return <p className="p-8 text-sm text-[#5a6b7d]">Opening item editor…</p>;
}

export default function EditCatalogProductRoute() {
  return (
    <Suspense
      fallback={<p className="p-8 text-sm text-[#5a6b7d]">Loading item…</p>}
    >
      <EditRedirect />
    </Suspense>
  );
}
