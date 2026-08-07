/**
 * API base URL.
 *
 * .env:
 *   NEXT_PUBLIC_API_URL_LOCAL=http://127.0.0.1:3001/v1
 *   NEXT_PUBLIC_API_URL_PRODUCTION=http://13.126.105.138:3001/v1
 *
 * Auto: localhost → local API; any other host → production API.
 */

const DEFAULT_LOCAL = "http://127.0.0.1:3001/v1";
const DEFAULT_PRODUCTION = "http://13.126.105.138:3001/v1";

function stripSlash(url: string) {
  return url.replace(/\/$/, "");
}

function envLocalUrl() {
  return stripSlash(
    process.env.NEXT_PUBLIC_API_URL_LOCAL ||
      process.env.NEXT_PUBLIC_API_URL ||
      DEFAULT_LOCAL,
  );
}

function envProductionUrl() {
  return stripSlash(
    process.env.NEXT_PUBLIC_API_URL_PRODUCTION || DEFAULT_PRODUCTION,
  );
}

function isLocalHost(host: string) {
  return (
    !host ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".local")
  );
}

export function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    // SSR: prefer production URL when target is production
    const target = (process.env.NEXT_PUBLIC_API_TARGET || "").toLowerCase();
    return target === "production" ? envProductionUrl() : envLocalUrl();
  }

  const host = window.location.hostname;
  if (isLocalHost(host)) {
    return envLocalUrl();
  }
  return envProductionUrl();
}

export function getApiOrigin(): string {
  return getApiBaseUrl().replace(/\/v1$/i, "");
}
