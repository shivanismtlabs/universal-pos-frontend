import {
  isValidPhoneNumber,
  parsePhoneNumberFromString,
} from "libphonenumber-js";
import type { CountryCode } from "libphonenumber-js";
import { countryFromDial, splitE164 } from "@/lib/geo";

function asCountry(code?: string | null): CountryCode {
  const c = (code ?? "IN").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(c)) return c as CountryCode;
  return "IN";
}

/** Resolve ISO country from dial code (+91 → IN). */
export function countryCodeFromDial(
  dial: string,
  prefer?: string | null,
): CountryCode {
  const d = dial.startsWith("+") ? dial : `+${dial.replace(/\D/g, "")}`;
  const hit = countryFromDial(d, prefer);
  if (hit) return asCountry(hit.code);
  return asCountry(prefer);
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

export function phoneValidationMessage(_countryCode?: string): string {
  return "Enter a valid phone number for the selected country";
}

/** @deprecated Use DEFAULT_PHONE_PLACEHOLDER in phone-country-input — kept for imports. */
export function phonePlaceholder(
  _countryCode?: string,
  _dial?: string,
): string {
  return "Enter phone number";
}

/** True when the stored value has national digits (not empty / dial-only). */
export function phoneHasLocalDigits(
  value: string,
  fallbackCountry: string = "IN",
): boolean {
  return Boolean(
    splitE164(value, fallbackCountry).local.replace(/\D/g, "").length,
  );
}

/** Validate dial + local parts from PhoneCountryInput. */
export function validatePhoneParts(
  dial: string,
  local: string,
  fallbackCountry: string = "IN",
): { ok: boolean; message?: string } {
  const cc = countryCodeFromDial(
    dial || splitE164("", fallbackCountry).dial,
    fallbackCountry,
  );
  const national = local.replace(/\D/g, "");
  if (!national) {
    return { ok: false, message: "Please enter your phone number" };
  }
  const full = `${dial.startsWith("+") ? dial : `+${dial.replace(/\D/g, "")}`}${national}`;
  if (!validatePhoneForCountry(full, cc)) {
    return { ok: false, message: phoneValidationMessage(cc) };
  }
  return { ok: true };
}
