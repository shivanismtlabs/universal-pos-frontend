"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useBootstrap } from "@/lib/bootstrap";
import PosWorkstation from "./pos-workstation";
import RetailPosWorkstation from "./retail-pos-workstation";

/**
 * Counter: pick workstation from enabled commerce modes.
 * URL ?view=rent only works when rental is enabled (no force-open).
 */
function PosGate() {
  const { isLoading, hasMode, commerceModes } = useBootstrap();
  const params = useSearchParams();
  const view = params.get("view");
  const wantRent = view === "rent" || view === "rental";
  const wantService = view === "service";

  if (isLoading) {
    return <p className="text-sm text-[#6b7280]">Opening terminal…</p>;
  }

  if (!commerceModes.length) {
    return (
      <p className="rounded-xl border border-[#d9e0ea] bg-white p-6 text-sm text-[#5a6b7d]">
        Shop capabilities are not set yet. Complete setup from the home screen.
      </p>
    );
  }

  if (wantRent) {
    if (!hasMode("rental")) {
      return (
        <div className="rounded-xl border border-[#d9e0ea] bg-white p-6 text-sm text-[#5a6b7d]">
          <p className="font-medium text-[#0b1f33]">Rent counter not enabled</p>
          <p className="mt-1">
            This shop does not have rental mode.{" "}
            <Link href="/pos" className="font-semibold text-[#1a56db]">
              Open default counter
            </Link>
          </p>
        </div>
      );
    }
    return <PosWorkstation />;
  }

  if (wantService && !hasMode("service")) {
    return (
      <div className="rounded-xl border border-[#d9e0ea] bg-white p-6 text-sm text-[#5a6b7d]">
        Service mode is not enabled for this shop.
      </div>
    );
  }

  // Rental-only shops → rental workstation by default
  if (!hasMode("sale") && hasMode("rental")) {
    return <PosWorkstation />;
  }

  if (hasMode("sale")) {
    return <RetailPosWorkstation />;
  }

  if (hasMode("subscription") || hasMode("service") || wantService) {
    return (
      <div className="rounded-xl border border-[#d9e0ea] bg-white p-6 text-sm text-[#5a6b7d]">
        <p className="font-semibold text-[#0b1f33]">
          Use Dashboard for Plans &amp; Services
        </p>
        <p className="mt-1">
          Enroll members, renew plans, and charge services from{" "}
          <Link href="/dashboard" className="font-semibold text-[#1a56db]">
            Dashboard
          </Link>
          {hasMode("service") ? (
            <>
              {" "}
              or schedule on{" "}
              <Link
                href="/appointments"
                className="font-semibold text-[#1a56db]"
              >
                Appointments
              </Link>
            </>
          ) : null}
          .
        </p>
      </div>
    );
  }

  return (
    <p className="rounded-xl border border-[#d9e0ea] bg-white p-6 text-sm text-[#5a6b7d]">
      No counter available for modes: {commerceModes.join(", ")}.
    </p>
  );
}

export default function PosPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-[#6b7280]">Opening terminal…</p>}
    >
      <PosGate />
    </Suspense>
  );
}
