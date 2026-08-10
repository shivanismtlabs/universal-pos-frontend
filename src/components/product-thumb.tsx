import { cn, mediaUrl } from "@/lib/utils";

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
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  /** Open lightbox / preview when image is clicked */
  onClick?: () => void;
  /** Extra images badge (e.g. +2) */
  count?: number;
}) {
  const dim =
    size === "sm"
      ? "h-9 w-9"
      : size === "lg"
        ? "h-14 w-14"
        : size === "xl"
          ? "h-[4.5rem] w-[4.5rem] sm:h-20 sm:w-20"
          : "h-10 w-10";
  const url = mediaUrl(src);
  const initials = (label ?? "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";

  const clickable = Boolean(onClick && url);

  return (
    <button
      type="button"
      // Never use disabled — it greys out real photos in some browsers
      onClick={(e) => {
        if (!clickable) return;
        e.stopPropagation();
        onClick?.();
      }}
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-xl border border-[#e2e8f0] bg-[#f1f5f9] text-[#64748b] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.4)]",
        dim,
        clickable && "cursor-zoom-in transition hover:ring-2 hover:ring-[#1a56db]/35",
        !clickable && "cursor-default",
        className,
      )}
      title={clickable ? "View image" : undefined}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={label ? `${label}` : ""}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className="text-[0.65rem] font-bold tracking-wide text-[#1a56db]">
          {initials.slice(0, 2)}
        </span>
      )}
      {count && count > 1 ? (
        <span className="absolute bottom-0.5 right-0.5 rounded bg-[#0b1f33]/8 px-1 text-[0.55rem] font-bold text-white">
          {count}×
        </span>
      ) : null}
    </button>
  );
}
