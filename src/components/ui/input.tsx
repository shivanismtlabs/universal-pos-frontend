"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, onWheel, ...props }, ref) => {
  const innerRef = React.useRef<HTMLInputElement | null>(null);

  const setRefs = React.useCallback(
    (node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  // Number inputs change value on mouse-wheel while focused — block that so
  // scrolling the New Item form (or any page) cannot bump Rate / qty / tax %.
  React.useEffect(() => {
    const el = innerRef.current;
    if (!el || type !== "number") return;
    const blockWheel = (e: WheelEvent) => {
      e.preventDefault();
    };
    el.addEventListener("wheel", blockWheel, { passive: false });
    return () => el.removeEventListener("wheel", blockWheel);
  }, [type]);

  return (
    <input
      type={type}
      className={cn(
        [
          "flex h-10 w-full rounded-lg",
          "border border-[#d9e0ea] bg-white",
          "px-3 text-[0.875rem] text-[#0b1f33]",
          "placeholder:text-[#94a3b8]",
          "outline-none transition-[border-color,box-shadow] duration-150",
          "hover:border-[#c5d0e0]",
          "focus:border-[#1a56db]",
          "focus:shadow-[0_0_0_3px_rgba(26,86,219,0.12)]",
          "disabled:cursor-not-allowed disabled:bg-[#f4f6fa] disabled:text-[#94a3b8]",
          "file:mr-2 file:rounded-md file:border-0 file:bg-[#e8eefb] file:px-2 file:py-1",
          "file:text-xs file:font-medium file:text-[#1a56db]",
        ].join(" "),
        className,
      )}
      ref={setRefs}
      onWheel={onWheel}
      {...props}
    />
  );
});
Input.displayName = "Input";
