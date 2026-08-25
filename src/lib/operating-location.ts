type Loc = { id: string; code?: string | null; isActive?: boolean };

/**
 * Prefer the shell’s current branch, else MAIN, else first active location.
 * Keeps opening stock on New Item aligned with Stock on Hand on Items list.
 *
 * Shell branch wins even if the locations list is stale/incomplete (e.g. bootstrap
 * not yet refreshed after adding a store) — otherwise SOH stays stuck on MAIN.
 */
export function resolveOperatingLocationId(opts: {
  currentLocationId?: string | null;
  locations?: Loc[] | null;
  authStoreId?: string | null;
}): string | undefined {
  const active = (opts.locations ?? []).filter((l) => l.isActive !== false);
  if (opts.currentLocationId) {
    // Shell branch wins even if locations list is stale/incomplete after adding a store.
    return opts.currentLocationId;
  }
  if (opts.authStoreId && active.some((l) => l.id === opts.authStoreId)) {
    return opts.authStoreId;
  }
  return (
    active.find((l) => (l.code ?? "").toUpperCase() === "MAIN")?.id ??
    active[0]?.id ??
    undefined
  );
}
