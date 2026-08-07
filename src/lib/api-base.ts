/**
 * API base URL.
 *
 * .env:
 *   NEXT_PUBLIC_API_URL_LOCAL=http://127.0.0.1:3001/v1
 *   NEXT_PUBLIC_API_URL_PRODUCTION=http://13.126.105.138:3001/v1
 *
 * On a remote host (e.g. 13.x.x.x), never call localhost — that hits the
 * user's PC, not the server.
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

function isLoopbackUrl(url: string) {
  return (
    url.includes("://127.0.0.1") ||
    url.includes("://localhost") ||
    url.includes("://[::1]")
  );
}

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (isLocalHost(host)) {
      return envLocalUrl();
    }

    const fromEnv = envProductionUrl();
    // Baked .env accidentally pointing at 127.0.0.1 → use same host :3001
    if (isLoopbackUrl(fromEnv)) {
      const port = process.env.NEXT_PUBLIC_API_PORT || "3001";
      return `${window.location.protocol}//${host}:${port}/v1`;
    }
    return fromEnv;
  }

  const target = (process.env.NEXT_PUBLIC_API_TARGET || "").toLowerCase();
  return target === "production" ? envProductionUrl() : envLocalUrl();
}

export function getApiOrigin(): string {
  return getApiBaseUrl().replace(/\/v1$/i, "");
}
