"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  GETTING_STARTED_PATH,
  readReturnToParam,
} from "@/lib/setup-return";

/** Subtle cue when the user arrived from Getting Started checklist. */
export function SetupReturnBanner() {
  const search = useSearchParams();
  const returnTo = readReturnToParam(search) ?? null;
  if (!returnTo) return null;

  const href =
    returnTo.startsWith("/dashboard")
      ? returnTo
      : GETTING_STARTED_PATH;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#e8edf3] pb-3 text-sm text-[#5a6b7d]">
      <p className="min-w-0">
        Opened from Getting Started — save to finish this setup step.
      </p>
      <Link
        href={href}
        className="shrink-0 font-medium text-[#1a56db] hover:underline"
      >
        Return to checklist
      </Link>
    </div>
  );
}
