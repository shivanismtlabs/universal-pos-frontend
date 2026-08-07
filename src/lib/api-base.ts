/**
 * API base URL — local ↔ production.
 *
 * Single file: frontend/.env
 *   NEXT_PUBLIC_API_TARGET=local|production
 *   NEXT_PUBLIC_API_URL_LOCAL=...
 *   NEXT_PUBLIC_API_URL_PRODUCTION=...
 *
 * Login UI switch stores override in localStorage (`upos_api_target`).
 */

export type ApiTarget = "local" | "production";

export const API_TARGET_STORAGE_KEY = "upos_api_target";
export const API_TARGET_CHANGE_EVENT = "upos-api-target-change";

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

/** Default target from env (local if unset). */
export function getDefaultApiTarget(): ApiTarget {
  const t = (process.env.NEXT_PUBLIC_API_TARGET || "local").toLowerCase();
  return t === "production" ? "production" : "local";
}

export function getApiUrlForTarget(target: ApiTarget): string {
  return target === "production" ? envProductionUrl() : envLocalUrl();
}

/** Active target: localStorage override → env default. */
export function getApiTarget(): ApiTarget {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem(API_TARGET_STORAGE_KEY);
      if (saved === "local" || saved === "production") return saved;
    } catch {
      /* ignore */
    }
  }
  return getDefaultApiTarget();
}

export function setApiTarget(target: ApiTarget) {
  if (typeof window === "undefined") return;
  localStorage.setItem(API_TARGET_STORAGE_KEY, target);
  window.dispatchEvent(
    new CustomEvent(API_TARGET_CHANGE_EVENT, { detail: target }),
  );
}

/**
 * Resolve API base for fetch calls.
 * - Hard override: NEXT_PUBLIC_API_URL when NEXT_PUBLIC_API_TARGET is empty
 *   and no localStorage override (backward compatible)
 * - Otherwise local / production URLs from env + target switch
 */
export function getApiBaseUrl(): string {
  const target = getApiTarget();
  const fromTarget = getApiUrlForTarget(target);

  // Legacy single-URL mode when TARGET not configured and no storage override
  const legacyOnly =
    !process.env.NEXT_PUBLIC_API_TARGET &&
    process.env.NEXT_PUBLIC_API_URL &&
    typeof window !== "undefined" &&
    !localStorage.getItem(API_TARGET_STORAGE_KEY);

  if (legacyOnly) {
    return stripSlash(process.env.NEXT_PUBLIC_API_URL!);
  }

  if (typeof window === "undefined") {
    return fromTarget;
  }

  // LAN / phone on same Wi‑Fi: when browsing via LAN IP and target is local,
  // hit API on that host:port (unless local URL is already a remote host).
  const host = window.location.hostname;
  if (
    target === "local" &&
    host &&
    host !== "localhost" &&
    host !== "127.0.0.1" &&
    fromTarget.includes("127.0.0.1")
  ) {
    const port = process.env.NEXT_PUBLIC_API_PORT || "3001";
    return `http://${host}:${port}/v1`;
  }

  return fromTarget;
}

export function getApiOrigin(): string {
  return getApiBaseUrl().replace(/\/v1$/i, "");
}
