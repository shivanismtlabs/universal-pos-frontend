"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

/**
 * Native select matched to Input — clean white field, subtle chevron.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <div className="relative w-full">
      <select
        ref={ref}
        className={cn(
          [
            "flex h-10 w-full appearance-none rounded-lg",
            "border border-[#d9e0ea] bg-white",
            "px-3 pr-9 text-[0.875rem] text-[#0b1f33]",
            "outline-none transition-[border-color,box-shadow] duration-150",
            "hover:border-[#c5d0e0]",
            "focus:border-[#1a56db]",
            "focus:shadow-[0_0_0_3px_rgba(26,86,219,0.12)]",
            "disabled:cursor-not-allowed disabled:bg-[#f4f6fa] disabled:opacity-60",
          ].join(" "),
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[#8b9bb0]"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  ),
);
Select.displayName = "Select";
