"use client";

import { useBootstrap } from "@/lib/bootstrap";

/** Renders children only when at least one of the modes is enabled. */
export function RequireCommerceMode({
  modes,
  children,
  label,
}: {
  modes: string[];
  children: React.ReactNode;
  label?: string;
}) {
  const { isLoading, hasMode } = useBootstrap();
  if (isLoading) {
    return (
      <p className="py-16 text-center text-sm text-[#5a6b7d]">Loading…</p>
    );
  }
  const ok = modes.some((m) => hasMode(m));
  if (!ok) {
    return (
      <div className="rounded-xl border border-[#d9e0ea] bg-white p-8 text-center">
        <p className="text-sm font-semibold text-[#0b1f33]">
          {label ?? "Not enabled for this shop"}
        </p>
        <p className="mt-1.5 text-sm text-[#5a6b7d]">
          Needs mode: {modes.join(" or ")}. Enable it in shop setup / commerce
          modes.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
