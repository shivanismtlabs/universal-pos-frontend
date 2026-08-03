"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "flex h-11 w-full rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2 text-sm text-[#111827] placeholder:text-[#9ca3af] outline-none transition focus:border-[#0f766e] focus:ring-4 focus:ring-[#0f766e]/12 disabled:opacity-50",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = "Input";
