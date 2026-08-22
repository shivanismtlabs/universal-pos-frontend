/** Mirror of backend sellingMenuCategoryFilter — POS/QR selling lists. */
export type SellingMenu = {
  id: string;
  name: string;
  categoryIds: string[];
  locationId: string | null;
  channel: "pos" | "qr" | "all";
  isActive: boolean;
  days: number[];
  startTime: string | null;
  endTime: string | null;
};

export function sellingMenuCategoryFilter(opts: {
  menus: SellingMenu[];
  channel: "pos" | "qr";
  locationId?: string | null;
  now?: Date;
}): { restrict: false } | { restrict: true; categoryIds: string[] } {
  const defined = opts.menus.filter(
    (m) =>
      (m.channel === "all" || m.channel === opts.channel) &&
      (!m.locationId || m.locationId === opts.locationId),
  );
  if (!defined.length) return { restrict: false };
  const now = opts.now ?? new Date();
  const live = defined.filter((m) => {
    if (!m.isActive) return false;
    if (m.days.length && !m.days.includes(now.getDay())) return false;
    if (m.startTime && m.endTime) {
      const t = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      if (t < m.startTime.slice(0, 5) || t > m.endTime.slice(0, 5)) return false;
    }
    return true;
  });
  if (!live.length) return { restrict: true, categoryIds: [] };
  if (live.some((m) => m.categoryIds.length === 0)) return { restrict: false };
  return {
    restrict: true,
    categoryIds: [...new Set(live.flatMap((m) => m.categoryIds))],
  };
}
