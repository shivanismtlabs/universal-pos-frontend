/**
 * Input guards for person names & mobile numbers.
 * Blocks whitespace-only values, special characters where not allowed.
 */

/** Collapse runs of spaces; trim ends. Rejects empty / spaces-only via trim. */
export function normalizeRealText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** True when the field has no real content (empty or only spaces). */
export function isBlankOrSpaces(value: string): boolean {
  return value.trim().length === 0;
}

/**
 * Person / customer name while typing:
 * letters (Latin + Devanagari) and spaces only — no digits or symbols.
 * Collapses multiple spaces; does not allow leading space.
 */
export function filterPersonNameInput(raw: string): string {
  return raw
    .replace(/[^A-Za-z\u0900-\u097F\s]/g, "")
    .replace(/^\s+/, "")
    .replace(/\s{2,}/g, " ");
}

/** Mobile / national number: digits only (no spaces, dashes, or symbols). */
export function filterMobileDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}
