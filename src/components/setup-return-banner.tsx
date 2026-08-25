"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  GETTING_STARTED_PATH,
  readReturnToParam,
} from "@/lib/setup-return";

/** Sticky cue when the user arrived from Getting Started checklist. */
export function SetupReturnBanner() {
  const search = useSearchParams();
  const returnTo = readReturnToParam(search) ?? null;
  if (!returnTo) return null;

  const href =
    returnTo.startsWith("/dashboard")
      ? returnTo
      : GETTING_STARTED_PATH;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2.5 text-sm text-[#1e3a5f]">
      <p className="min-w-0">
        You opened this from Getting Started. After you save, you’ll return to
        that setup step.
      </p>
      <Link
        href={href}
        className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-[#1a56db] hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Getting Started
      </Link>
    </div>
  );
}
