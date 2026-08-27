"use client";

import type { ComponentType } from "react";
import * as FlagSvg from "country-flag-icons/react/3x2";
import { cn } from "@/lib/utils";

type FlagSvgComponent = ComponentType<{
  title?: string;
  className?: string;
  "aria-hidden"?: boolean;
}>;

export function CountryFlag({
  code,
  title,
  className,
}: {
  code?: string | null;
  title?: string;
  className?: string;
}) {
  const cc = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  const flags = FlagSvg as Record<string, FlagSvgComponent | undefined> & {
    default?: Record<string, FlagSvgComponent | undefined>;
  };
  const Flag = flags[cc] ?? flags.default?.[cc];
  if (typeof Flag !== "function") {
    return (
      <span
        aria-hidden
        className={cn(
          "inline-flex h-3.5 w-[1.15rem] shrink-0 items-center justify-center rounded-[1px] bg-[#e8eef4] text-[0.5rem] font-semibold tracking-wide text-[#5b6b7c]",
          className,
        )}
      >
        {cc}
      </span>
    );
  }
  return (
    <Flag
      title={title ?? cc}
      className={cn(
        "inline-block h-3.5 w-[1.15rem] shrink-0 rounded-[1px] object-cover shadow-[0_0_0_1px_rgba(11,31,51,0.08)]",
        className,
      )}
    />
  );
}
