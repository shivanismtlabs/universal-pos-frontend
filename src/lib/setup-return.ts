/** Getting Started checklist — context-based return after Save */

export const GETTING_STARTED_PATH = "/dashboard?tab=getting-started";

export type SetupStepId = string;

/** Path back to Getting Started, optionally focusing a checklist step. */
export function gettingStartedPath(step?: SetupStepId | null): string {
  const id = (step ?? "").trim();
  if (!id) return GETTING_STARTED_PATH;
  return `${GETTING_STARTED_PATH}&step=${encodeURIComponent(id)}`;
}

/**
 * Append returnTo so save/cancel can bring the user back to Getting Started.
 * Only checklist links should use this — never sidebar / menu links.
 */
export function withGettingStartedReturn(
  href: string,
  step?: SetupStepId | null,
): string {
  const returnTo = gettingStartedPath(step);
  try {
    const u = new URL(href, "http://local.invalid");
    u.searchParams.set("returnTo", returnTo);
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    const join = href.includes("?") ? "&" : "?";
    return `${href}${join}returnTo=${encodeURIComponent(returnTo)}`;
  }
}

/** Safe in-app return path only (no open redirects). */
export function resolveSetupReturnTo(
  raw: string | null | undefined,
  fallback: string,
): string {
  const v = (raw ?? "").trim();
  if (!v.startsWith("/")) return fallback;
  if (v.startsWith("//")) return fallback;
  if (v.includes("://")) return fallback;
  return v;
}

export function readReturnToParam(
  search: { get: (k: string) => string | null } | null | undefined,
): string | null {
  const v = search?.get("returnTo")?.trim();
  if (!v) return null;
  const safe = resolveSetupReturnTo(v, "");
  return safe || null;
}

/** Checklist step id from Home URL (`?step=tax`). */
export function readSetupStepParam(
  search: { get: (k: string) => string | null } | null | undefined,
): string | null {
  const v = search?.get("step")?.trim();
  return v || null;
}

/**
 * Preserve returnTo when rewriting a URL (e.g. legacy `?tab=` → dedicated page).
 */
export function preserveReturnTo(
  dest: string,
  search: { get: (k: string) => string | null } | null | undefined,
): string {
  const returnTo = readReturnToParam(search);
  if (!returnTo) return dest;
  try {
    const u = new URL(dest, "http://local.invalid");
    u.searchParams.set("returnTo", returnTo);
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    const join = dest.includes("?") ? "&" : "?";
    return `${dest}${join}returnTo=${encodeURIComponent(returnTo)}`;
  }
}
