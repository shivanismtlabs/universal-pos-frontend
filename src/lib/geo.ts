import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from "libphonenumber-js";
import geo from "@/data/countries.json";

export type GeoCountry = {
  code: string;
  name: string;
  dial: string;
  states?: string[];
};

const STATE_BY_CODE: Record<string, string[]> = Object.fromEntries(
  geo.countries.map((c) => [c.code, c.states ?? []]),
);

/** Original market list — shown first in country pickers. */
export const GEO_FREQUENT_CODES: string[] = geo.countries.map((c) => c.code);

function regionName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return geo.countries.find((c) => c.code === code)?.name ?? code;
  }
}

function buildCountries(): GeoCountry[] {
  const frequent = new Set(GEO_FREQUENT_CODES);
  const list = getCountries().map((code) => {
    const states = STATE_BY_CODE[code]?.filter(Boolean);
    return {
      code,
      name: regionName(code),
      dial: `+${getCountryCallingCode(code)}`,
      ...(states?.length ? { states } : {}),
    };
  });
  list.sort((a, b) => {
    const fa = frequent.has(a.code);
    const fb = frequent.has(b.code);
    if (fa !== fb) return fa ? -1 : 1;
    if (fa) {
      return GEO_FREQUENT_CODES.indexOf(a.code) - GEO_FREQUENT_CODES.indexOf(b.code);
    }
    return a.name.localeCompare(b.name, "en");
  });
  return list;
}

export const GEO_COUNTRIES: GeoCountry[] = buildCountries();

export const GEO_FREQUENT_COUNTRIES: GeoCountry[] = GEO_FREQUENT_CODES.map(
  (code) => GEO_COUNTRIES.find((c) => c.code === code),
).filter((c): c is GeoCountry => Boolean(c));

export const GEO_OTHER_COUNTRIES: GeoCountry[] = GEO_COUNTRIES.filter(
  (c) => !GEO_FREQUENT_CODES.includes(c.code),
);

export function geoCountry(code?: string | null): GeoCountry | undefined {
  const c = (code ?? "").trim().toUpperCase();
  return GEO_COUNTRIES.find((x) => x.code === c);
}

export function geoStates(code?: string | null): string[] {
  return geoCountry(code)?.states?.filter(Boolean) ?? [];
}

export function geoDial(code?: string | null): string {
  return geoCountry(code)?.dial ?? "+91";
}

export function isKnownGeoState(countryCode: string, state: string): boolean {
  const list = geoStates(countryCode);
  if (!list.length) return Boolean(state.trim());
  return list.includes(state);
}

function countriesForDial(dial: string): GeoCountry[] {
  const d = dial.startsWith("+") ? dial : `+${dial.replace(/\D/g, "")}`;
  return GEO_COUNTRIES.filter((c) => c.dial === d);
}

/** Resolve ISO country from dial (+1 → US unless `prefer` matches that calling code). */
export function countryFromDial(
  dial: string,
  prefer?: string | null,
): GeoCountry | undefined {
  const matches = countriesForDial(dial);
  if (!matches.length) return undefined;
  const preferred = (prefer ?? "").trim().toUpperCase();
  if (preferred) {
    const hit = matches.find((c) => c.code === preferred);
    if (hit) return hit;
  }
  return matches[0];
}

/** Split stored phone into dial code + national number. */
export function splitE164(
  phone?: string | null,
  fallbackCountry = "IN",
): { countryCode: string; dial: string; local: string } {
  const raw = (phone ?? "").trim();
  const fb = geoCountry(fallbackCountry) ?? GEO_COUNTRIES[0]!;
  const digits = raw.replace(/[^\d+]/g, "");

  if (digits.startsWith("+")) {
    const parsed = parsePhoneNumberFromString(digits);
    if (parsed?.countryCallingCode) {
      const dial = `+${parsed.countryCallingCode}`;
      const local = String(parsed.nationalNumber ?? digits.slice(dial.length));
      const fromParsed = parsed.country ? geoCountry(parsed.country) : undefined;
      const preferred =
        fromParsed ??
        countryFromDial(dial, fallbackCountry) ??
        countryFromDial(dial);
      return {
        countryCode: preferred?.code ?? fb.code,
        dial: preferred?.dial ?? dial,
        local,
      };
    }
    const sorted = [...GEO_COUNTRIES].sort(
      (a, b) => b.dial.length - a.dial.length,
    );
    const hit = sorted.find((c) => digits.startsWith(c.dial));
    if (hit) {
      const preferred = countryFromDial(hit.dial, fallbackCountry) ?? hit;
      return {
        countryCode: preferred.code,
        dial: preferred.dial,
        local: digits.slice(hit.dial.length),
      };
    }
  }

  return {
    countryCode: fb.code,
    dial: fb.dial,
    local: raw.replace(/^\+/, "").replace(/\D/g, ""),
  };
}

export function joinE164(dial: string, local: string): string {
  const n = local.replace(/\D/g, "");
  const d = dial.startsWith("+") ? dial : `+${dial.replace(/\D/g, "")}`;
  return n ? `${d}${n}` : "";
}
