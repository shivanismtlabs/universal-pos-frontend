"use client";

import { cn } from "@/lib/utils";

export type FoodType = "veg" | "non_veg" | "egg";

export function parseFoodType(raw: unknown): FoodType | null {
  if (raw == null) return null;
  const v = String(raw).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (v === "veg" || v === "vegetarian") return "veg";
  if (v === "non_veg" || v === "nonveg" || v === "non_vegetarian")
    return "non_veg";
  if (v === "egg" || v === "eggetarian") return "egg";
  return null;
}

const FOOD_TYPE_META: Record<
  FoodType,
  { label: string; mark: string; ring: string; text: string }
> = {
  veg: {
    label: "Veg",
    mark: "bg-[#15803d]",
    ring: "border-[#15803d]",
    text: "text-[#15803d]",
  },
  non_veg: {
    label: "Non-veg",
    mark: "bg-[#b91c1c]",
    ring: "border-[#b91c1c]",
    text: "text-[#b91c1c]",
  },
  egg: {
    label: "Egg",
    mark: "bg-[#a16207]",
    ring: "border-[#a16207]",
    text: "text-[#a16207]",
  },
};

/** Compact green/red/amber diet marker (restaurant & café menus). */
export function FoodTypeBadge({
  value,
  showLabel = false,
  size = "md",
  className,
}: {
  value: unknown;
  showLabel?: boolean;
  /** sm = tiny icon; md = standard; lg = POS tile readable */
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const type = parseFoodType(value);
  if (!type) return null;
  const meta = FOOD_TYPE_META[type];
  const box =
    size === "lg" ? "h-4 w-4" : size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  const dot =
    size === "lg" ? "h-2 w-2" : size === "sm" ? "h-1 w-1" : "h-1.5 w-1.5";
  const labelText =
    size === "lg" ? "text-[0.7rem]" : "text-[0.65rem]";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        showLabel
          ? "rounded-md border border-[#e2e8f0] bg-white px-1.5 py-0.5 shadow-sm"
          : null,
        className,
      )}
      title={meta.label}
      aria-label={meta.label}
    >
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-[2px] border-2 bg-white",
          box,
          meta.ring,
        )}
      >
        <span className={cn("rounded-[1px]", dot, meta.mark)} />
      </span>
      {showLabel ? (
        <span className={cn("font-semibold leading-none", labelText, meta.text)}>
          {meta.label}
        </span>
      ) : null}
    </span>
  );
}

export const FOOD_TYPE_OPTIONS: { id: FoodType; label: string }[] = [
  { id: "veg", label: "Veg" },
  { id: "non_veg", label: "Non-veg" },
  { id: "egg", label: "Egg" },
];
