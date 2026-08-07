import { cn, mediaUrl } from "@/lib/utils";

/** Compact product thumbnail — keeps POS grids readable (not hero-sized). */
export function ProductThumb({
  src,
  label,
  size = "md",
  className,
}: {
  src?: string | null;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dim =
    size === "sm" ? "h-9 w-9" : size === "lg" ? "h-12 w-12" : "h-10 w-10";
  const url = mediaUrl(src);
  const initials = (label ?? "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";

  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] text-[#64748b]",
        dim,
        className,
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-[0.6rem] font-bold tracking-wide text-[#1a56db]">
          {initials.slice(0, 2)}
        </span>
      )}
    </div>
  );
}
