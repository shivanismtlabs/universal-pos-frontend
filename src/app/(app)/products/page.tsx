"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy path — Products UI lives at /catalog */
export default function ProductsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/catalog");
  }, [router]);
  return (
    <p className="p-8 text-center text-sm text-[#5a6b7d]">
      Redirecting to Products…
    </p>
  );
}
