"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy path — products live under /catalog. */
export default function InventoryRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/catalog");
  }, [router]);
  return (
    <p className="py-16 text-center text-body text-[var(--muted)]">
      Redirecting to Products…
    </p>
  );
}
