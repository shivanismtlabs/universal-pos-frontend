/** Mirrors backend STATUS_TRANSITIONS in orders.service.ts */
export const ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  quote: ["reserved", "cancelled"],
  reserved: ["fitted", "ready", "cancelled"],
  fitted: ["ready", "cancelled"],
  ready: ["checked_out", "cancelled"],
  checked_out: ["returned"],
  returned: ["inspected"],
  inspected: ["closed"],
  closed: [],
  cancelled: [],
};

export const ITEMS_MUTABLE_STATUSES = new Set(["quote", "reserved"]);
