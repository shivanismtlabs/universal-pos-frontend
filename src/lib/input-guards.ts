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

/** Prevent space key on keydown (real-time space block for email & password). */
export function preventSpaceKeyDown(e: { key: string; code?: string; preventDefault: () => void }): void {
  if (e.key === " " || e.code === "Space") {
    e.preventDefault();
  }
}

/** Strip all whitespace from value (real-time space block for email, password, codes). */
export function stripSpaces(raw: string): string {
  return raw.replace(/\s+/g, "");
}

/**
 * Prevent leading space (at start of input) or consecutive double spaces on keydown.
 * Used for name, address, and text fields where single spaces between words are allowed.
 */
export function preventLeadingOrDoubleSpaceKeyDown(e: {
  key: string;
  code?: string;
  preventDefault: () => void;
  currentTarget: { value: string; selectionStart?: number | null };
}): void {
  if (e.key === " " || e.code === "Space") {
    const val = e.currentTarget.value || "";
    const selStart = e.currentTarget.selectionStart ?? val.length;
    if (selStart === 0 || val.length === 0) {
      e.preventDefault();
      return;
    }
    if (selStart > 0 && val[selStart - 1] === " ") {
      e.preventDefault();
      return;
    }
  }
}

/** Filter text input in real time: remove leading spaces and collapse consecutive spaces into a single space. */
export function filterRealTextInput(raw: string): string {
  return raw.replace(/^\s+/, "").replace(/\s{2,}/g, " ");
}
