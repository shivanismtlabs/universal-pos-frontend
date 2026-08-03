/** Decode JWT `exp` (ms). Returns null if invalid. */
export function getAccessTokenExpiry(token: string | null | undefined): number | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(
      atob(part.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: number };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isAccessTokenExpired(
  token: string | null | undefined,
  skewMs = 15_000,
): boolean {
  const exp = getAccessTokenExpiry(token);
  if (exp == null) return !token;
  return Date.now() >= exp - skewMs;
}
