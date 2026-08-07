/**
 * Core OrderStatus (API) vs Rental lifecycle (mod_rental_orders).
 * Rental floor / POS should prefer lifecycle when present.
 */

/** Core order status transitions (non-rental / fallback) */
export const ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["quoted", "confirmed", "cancelled"],
  quoted: ["confirmed", "cancelled"],
  confirmed: ["in_progress", "ready", "cancelled"],
  in_progress: ["ready", "fulfilled", "cancelled"],
  ready: ["fulfilled", "cancelled"],
  fulfilled: ["closed"],
  closed: [],
  cancelled: [],
};

/** Rental module lifecycle (primary for rental shops) */
export const RENTAL_LIFECYCLE_TRANSITIONS: Record<string, string[]> = {
  quote: ["reserved", "cancelled"],
  reserved: ["fitted", "ready", "checked_out", "cancelled"],
  fitted: ["ready", "checked_out", "cancelled"],
  ready: ["checked_out", "cancelled"],
  checked_out: ["returned"],
  returned: ["inspected", "closed"],
  inspected: ["closed"],
  closed: [],
  cancelled: [],
};

/** Core statuses where line items can still be added/removed */
export const ITEMS_MUTABLE_STATUSES = new Set([
  "draft",
  "quoted",
  "confirmed",
  "in_progress",
]);

/** Lifecycles where units can still be scanned onto the ticket */
export const RENTAL_ITEMS_MUTABLE = new Set([
  "quote",
  "reserved",
  "fitted",
  "ready",
]);

export function rentalLifecycleOf(order: {
  status?: string;
  rentalExt?: { lifecycle?: string } | null;
}): string {
  return order.rentalExt?.lifecycle ?? order.status ?? "quote";
}

export function canMutateRentalItems(order: {
  status?: string;
  rentalExt?: { lifecycle?: string } | null;
}): boolean {
  if (order.rentalExt?.lifecycle) {
    return RENTAL_ITEMS_MUTABLE.has(order.rentalExt.lifecycle);
  }
  return ITEMS_MUTABLE_STATUSES.has(order.status ?? "");
}

export function lifecycleLabel(lc: string): string {
  return lc.replace(/_/g, " ");
}
