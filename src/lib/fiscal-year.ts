import { z } from "zod";

/** Calendar month names — fiscal year may start on any of these. */
export const FISCAL_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export type FiscalMonthName = (typeof FISCAL_MONTH_NAMES)[number];

export const fiscalMonthNameSchema = z.enum(FISCAL_MONTH_NAMES, {
  errorMap: () => ({ message: "Select when the fiscal year starts" }),
});

/** 1–12 from full month name, or null if unknown. */
export function fiscalMonthNameToNumber(name: string): number | null {
  const trimmed = name.trim();
  const idx = FISCAL_MONTH_NAMES.indexOf(trimmed as FiscalMonthName);
  return idx >= 0 ? idx + 1 : null;
}

/** e.g. April → "April – March" */
export function fiscalYearRangeLabel(startMonth: FiscalMonthName): string {
  const startIdx = FISCAL_MONTH_NAMES.indexOf(startMonth);
  const endIdx = (startIdx + 11) % 12;
  return `${startMonth} – ${FISCAL_MONTH_NAMES[endIdx]}`;
}

export const FISCAL_YEAR_OPTIONS = FISCAL_MONTH_NAMES.map((name) => ({
  id: name,
  label: fiscalYearRangeLabel(name),
}));

/** Top-level tenant settings patch — keeps reports + accounting in sync. */
export function fiscalYearSettingsPatch(monthName: string) {
  const month = fiscalMonthNameToNumber(monthName);
  if (month == null) return {};
  return {
    fiscalYearStart: monthName,
    fiscalYearStartMonth: month,
    accounting: { fiscalYearStartMonth: month },
  };
}
