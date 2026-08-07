"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Retired — barcode units live on Start here → Rent stock. */
export default function InventoryRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);
  return (
    <p className="py-16 text-center text-body text-[var(--muted)]">
      Redirecting to Start here…
    </p>
  );
}
