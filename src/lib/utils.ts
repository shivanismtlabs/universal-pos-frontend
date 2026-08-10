import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { getApiOrigin } from "./api-base";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatInr(amount: string | number | null | undefined) {
  return formatMoney(amount, "INR", "en-IN");
}

export function formatMoney(
  amount: string | number | null | undefined,
  currencyCode = "INR",
  locale = "en-IN",
) {
  const n = typeof amount === "string" ? Number(amount) : (amount ?? 0);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode || "INR",
      maximumFractionDigits: 2,
    }).format(Number.isFinite(n) ? n : 0);
  } catch {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(Number.isFinite(n) ? n : 0);
  }
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

/** Local calendar YYYY-MM-DD (India shop floor, not UTC). */
export function todayYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toYmd(value?: string | Date | null) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return todayYmd(d);
}

export function moneyNumber(amount: string | number | null | undefined) {
  const n = typeof amount === "string" ? Number(amount) : (amount ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function newIdempotencyKey(prefix = "pos") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Resolve product image path from API (`/v1/uploads/…`) or absolute URL */
export function mediaUrl(path?: string | null) {
  if (!path) return null;
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("data:") ||
    path.startsWith("blob:")
  ) {
    return path;
  }
  const origin = getApiOrigin();
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string" || !result.startsWith("data:")) {
        reject(new Error("Could not read image"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}
