"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared overlay: X to close, click dimmed area to close, Escape to close.
 */
export function ModalFrame({
  onClose,
  title,
  subtitle,
  children,
  footer,
  className,
  zClass = "z-[90]",
  closeOnOutside = true,
  labelledBy,
}: {
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  zClass?: string;
  closeOnOutside?: boolean;
  labelledBy?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={cn(
        "fixed inset-0 flex items-center justify-center p-4",
        zClass,
      )}
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#0b1f33]/45"
        aria-label="Close"
        onClick={() => {
          if (closeOnOutside) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          "relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[#d9e0ea] bg-white shadow-xl",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#eef1f4] px-5 py-3.5">
          <div className="min-w-0">
            {title ? (
              <h2
                id={labelledBy}
                className="text-base font-semibold text-[#0b1f33]"
              >
                {title}
              </h2>
            ) : null}
            {subtitle ? (
              <p className="mt-0.5 text-sm text-[#5a6b7d]">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#5a6b7d] hover:bg-[#f1f5f9] hover:text-[#0b1f33]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer ? (
          <div className="border-t border-[#eef1f4] px-5 py-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
