import {
  getExampleNumber,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
} from "libphonenumber-js";
import type { CountryCode } from "libphonenumber-js";
import examples from "libphonenumber-js/mobile/examples";
import { GEO_COUNTRIES, splitE164 } from "@/lib/geo";

function asCountry(code?: string | null): CountryCode {
  const c = (code ?? "IN").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(c)) return c as CountryCode;
  return "IN";
}

/** Resolve ISO country from dial code (+91 → IN). */
export function countryCodeFromDial(dial: string): CountryCode {
  const d = dial.startsWith("+") ? dial : `+${dial.replace(/\D/g, "")}`;
  const hit = [...GEO_COUNTRIES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => d.startsWith(c.dial));
  return asCountry(hit?.code);
}

/** Validate E.164 or national number (uses country when no + prefix). */
export function validatePhoneE164(
  value: string,
  fallbackCountry: string = "IN",
): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    if (trimmed.startsWith("+")) {
      return isValidPhoneNumber(trimmed);
    }
    return isValidPhoneNumber(trimmed, asCountry(fallbackCountry));
  } catch {
    return false;
  }
}

/** E.164 must be valid and match the selected country (org signup, settings). */
export function validatePhoneForCountry(
  e164: string,
  countryCode: string,
): boolean {
  const trimmed = e164.trim();
  if (!trimmed) return false;
  const cc = asCountry(countryCode);
  try {
    const parsed = trimmed.startsWith("+")
      ? parsePhoneNumberFromString(trimmed)
      : parsePhoneNumberFromString(trimmed, cc);
    if (!parsed?.isValid()) return false;
    return parsed.country === cc;
  } catch {
    return false;
  }
}

/** Canonical E.164 for API storage (+919876543210). */
export function canonicalPhoneE164(
  value: string,
  fallbackCountry: string = "IN",
): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = trimmed.startsWith("+")
      ? parsePhoneNumberFromString(trimmed)
      : parsePhoneNumberFromString(trimmed, asCountry(fallbackCountry));
    if (parsed?.isValid()) return parsed.format("E.164");
  } catch {
    /* fall through */
  }
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed;
  return trimmed.startsWith("+") ? trimmed : `+${digits}`;
}

export function phoneValidationMessage(countryCode: string): string {
  const cc = asCountry(countryCode);
  try {
    const ex = getExampleNumber(cc, examples);
    if (ex) {
      const national = ex.formatNational().replace(/\D/g, "");
      return `Example: ${national} (${cc})`;
    }
  } catch {
    /* ignore */
  }
  return "Enter a valid mobile number for the selected country";
}

export function phonePlaceholder(
  countryCode: string,
  dial?: string,
): string {
  const cc = dial ? countryCodeFromDial(dial) : asCountry(countryCode);
  try {
    const ex = getExampleNumber(cc, examples);
    if (ex) return ex.formatNational().replace(/\D/g, "");
  } catch {
    /* ignore */
  }
  if (cc === "IN") return "9876543210";
  if (cc === "US" || cc === "CA") return "5551234567";
  return "Mobile number";
}

/** Validate dial + local parts from PhoneCountryInput. */
export function validatePhoneParts(
  dial: string,
  local: string,
  fallbackCountry: string = "IN",
): { ok: boolean; message?: string } {
  const cc = countryCodeFromDial(dial || splitE164("", fallbackCountry).dial);
  const national = local.replace(/\D/g, "");
  if (!national) {
    return { ok: false, message: "Phone is required" };
  }
  const full = `${dial.startsWith("+") ? dial : `+${dial.replace(/\D/g, "")}`}${national}`;
  if (!validatePhoneForCountry(full, cc)) {
    return { ok: false, message: phoneValidationMessage(cc) };
  }
  return { ok: true };
}
