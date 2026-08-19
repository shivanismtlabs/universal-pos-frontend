"use client";

import { cn, mediaUrl } from "@/lib/utils";

/** Always-available offline SVG cover (no external CDN). */
function svgCover(label?: string) {
  const text =
    (label ?? "IT")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 3) || "IT";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#e8eefb"/><text x="60" y="68" text-anchor="middle" font-family="Arial,sans-serif" font-size="36" font-weight="700" fill="#1a56db">${text}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Product thumbnail — sm/md for dense rows; lg/xl for counter catalog. */
export function ProductThumb({
  src,
  label,
  size = "md",
  className,
  onClick,
  count,
}: {
  src?: string | null;
  label?: string;
  size?: "sm" | "md" | "lg" | "xl" | "fill";
  className?: string;
  onClick?: () => void;
  count?: number;
}) {
  const dim =
    size === "sm"
      ? "h-11 w-11"
      : size === "lg"
        ? "h-16 w-16"
        : size === "xl"
          ? "h-20 w-20 sm:h-24 sm:w-24"
          : size === "fill"
            ? "h-full w-full"
            : "h-12 w-12";

  const resolved = mediaUrl(src);
  const fallback = svgCover(label);
  const url = resolved || fallback;
  const clickable = Boolean(onClick && resolved);

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={clickable ? "View image" : undefined}
      onClick={(e) => {
        if (!clickable) return;
        e.stopPropagation();
        onClick?.();
      }}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              e.stopPropagation();
              onClick?.();
            }
          : undefined
      }
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-xl border border-[#e2e8f0] bg-[#e8eefb] text-[#64748b] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.4)]",
        dim,
        clickable &&
          "cursor-zoom-in transition hover:ring-2 hover:ring-[#1a56db]/35",
        !clickable && "cursor-default",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={label ? `${label}` : ""}
        className="h-full w-full object-cover"
        loading="lazy"
        onError={(e) => {
          const img = e.currentTarget;
          if (img.src !== fallback) img.src = fallback;
        }}
      />
      {count && count > 1 ? (
        <span className="absolute bottom-0.5 right-0.5 rounded bg-[#0b1f33]/8 px-1 text-[0.55rem] font-bold text-white">
          {count}×
        </span>
      ) : null}
    </div>
  );
}
