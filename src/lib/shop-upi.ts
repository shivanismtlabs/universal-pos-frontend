/** Resolve shop UPI VPA for Counter QR — settings VPA or phone-based PSP handle. */

const PSP_SUFFIXES = [
  { id: "@ybl", label: "PhonePe (@ybl)" },
  { id: "@paytm", label: "Paytm (@paytm)" },
  { id: "@oksbi", label: "SBI (@oksbi)" },
  { id: "@okaxis", label: "Axis (@okaxis)" },
  { id: "@okhdfcbank", label: "HDFC (@okhdfcbank)" },
  { id: "@upi", label: "Generic (@upi)" },
] as const;

export type UpiPspSuffix = (typeof PSP_SUFFIXES)[number]["id"];

export const UPI_PSP_OPTIONS = PSP_SUFFIXES;

/** Digits only; strip +91 / 91 / leading 0 for IN mobiles. */
export function normalizeInMobile(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("91") && d.length >= 12) d = d.slice(-10);
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  if (d.length === 10 && /^[6-9]/.test(d)) return d;
  return null;
}

export function isValidUpiVpa(vpa: string): boolean {
  return /^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9.-]{2,}$/.test(vpa.trim());
}

export function vpaFromMobile(
  mobile10: string,
  suffix: UpiPspSuffix = "@ybl",
): string {
  return `${mobile10}${suffix}`;
}

/** Phone from Business Profile / org settings on tenant bootstrap. */
export function shopPhoneFromTenantSettings(
  settings: Record<string, unknown> | null | undefined,
): string | null {
  if (!settings || typeof settings !== "object") return null;
  const org =
    settings.organizationProfile &&
    typeof settings.organizationProfile === "object"
      ? (settings.organizationProfile as Record<string, unknown>)
      : null;
  if (org) {
    const phone = typeof org.phone === "string" ? org.phone : "";
    const cc =
      typeof org.phoneCountryCode === "string" ? org.phoneCountryCode : "";
    const combined = [cc, phone].filter(Boolean).join(" ").trim() || phone;
    const n = normalizeInMobile(combined);
    if (n) return n;
  }
  if (typeof settings.phone === "string") {
    return normalizeInMobile(settings.phone);
  }
  return null;
}

export function shopUpiFromPosSettings(
  settings: Record<string, unknown> | null | undefined,
): { vpa: string; payeeName: string } | null {
  if (!settings || typeof settings !== "object") return null;
  const pos =
    settings.pos && typeof settings.pos === "object"
      ? (settings.pos as Record<string, unknown>)
      : {};
  const vpa = typeof pos.upiVpa === "string" ? pos.upiVpa.trim() : "";
  if (!vpa || !isValidUpiVpa(vpa)) return null;
  const payeeName =
    (typeof pos.upiPayeeName === "string" && pos.upiPayeeName.trim()) || "";
  return { vpa, payeeName };
}

export function buildUpiPayUri(opts: {
  vpa: string;
  payeeName: string;
  amount: number;
  note?: string;
}): string {
  const am = Math.max(0, opts.amount).toFixed(2);
  return `upi://pay?pa=${encodeURIComponent(opts.vpa.trim())}&pn=${encodeURIComponent(opts.payeeName.trim() || "Shop")}&am=${am}&cu=INR&tn=${encodeURIComponent(opts.note || "POS")}`;
}
