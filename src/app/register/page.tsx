"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy /register → modern /signup (identity first). */
export default function RegisterRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/signup");
  }, [router]);
  return (
    <p className="py-20 text-center text-sm text-[#5a6b7d]">
      Redirecting to sign up…
    </p>
  );
}
