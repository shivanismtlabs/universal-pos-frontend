/** Commerce modes that share the unified Counter (Sell / Rent / Services / Plans tabs). */
export const COUNTER_COMMERCE_MODES = [
  "sale",
  "rental",
  "service",
  "subscription",
] as const;

export type CounterCommerceMode = (typeof COUNTER_COMMERCE_MODES)[number];

export function hasCounterMode(hasMode: (code: string) => boolean): boolean {
  return COUNTER_COMMERCE_MODES.some((mode) => hasMode(mode));
}

/** Default Counter tab deep link for enabled modes. */
export function counterHref(
  hasMode: (code: string) => boolean,
  view?: CounterCommerceMode,
): string {
  if (view && hasMode(view)) return `/counter?view=${view}`;
  if (hasMode("sale")) return "/counter?view=sale";
  if (hasMode("rental")) return "/counter?view=rental";
  if (hasMode("service")) return "/counter?view=service";
  if (hasMode("subscription")) return "/counter?view=subscription";
  return "/counter";
}
