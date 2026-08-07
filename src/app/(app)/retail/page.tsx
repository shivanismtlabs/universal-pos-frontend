"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy qty SKU page — redirect to Sale products on dashboard. */
export default function RetailPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);
  return (
    <p className="p-8 text-center text-sm text-[#5a6b7d]">
      Redirecting to Products…
    </p>
  );
}
