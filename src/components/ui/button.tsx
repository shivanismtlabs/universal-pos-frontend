"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap",
    "rounded-lg text-[0.8125rem] font-medium tracking-[-0.01em]",
    "transition-[background-color,border-color,box-shadow,color] duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a56db]/30",
    "disabled:pointer-events-none disabled:opacity-45",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "bg-[#1a56db] text-white",
          "shadow-[0_1px_2px_rgba(26,86,219,0.2)]",
          "hover:bg-[#1548c0]",
          "active:bg-[#1341a8]",
        ].join(" "),
        secondary: [
          "border border-[#e4e9f0] bg-white text-[#0b1f33]",
          "hover:border-[#d5dde8] hover:bg-[#f8fafc]",
        ].join(" "),
        /** Alias for shadcn-style `outline` — same look as secondary. */
        outline: [
          "border border-[#e4e9f0] bg-white text-[#0b1f33]",
          "hover:border-[#d5dde8] hover:bg-[#f8fafc]",
        ].join(" "),
        soft: [
          "bg-[#e8eefb] text-[#1341a8]",
          "hover:bg-[#dce6f8]",
        ].join(" "),
        ghost: "text-[#5a6b7d] hover:bg-[#eef3fb] hover:text-[#0b1f33]",
        danger: [
          "border border-[#f0d4d4] bg-white text-[#c81e1e]",
          "hover:bg-[#fff6f6]",
        ].join(" "),
      },
      size: {
        default: "h-10 px-3.5",
        sm: "h-8 rounded-md px-2.5 text-[0.75rem]",
        lg: "h-11 px-5 text-[0.875rem]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
