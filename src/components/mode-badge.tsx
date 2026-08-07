"use client";

import { getModeColor, modeLabel } from "@/lib/mode-colors";
import { cn } from "@/lib/utils";

/** Small mode chip — color from getModeColor(mode), never hardcoded --sale/--rental. */
export function ModeBadge({
  mode,
  className,
}: {
  mode: string | null | undefined;
  className?: string;
}) {
  const c = getModeColor(mode);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase",
        className,
      )}
      style={{
        color: c.ink,
        backgroundColor: c.soft,
      }}
    >
      {modeLabel(mode)}
    </span>
  );
}
