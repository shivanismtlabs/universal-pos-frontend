import geo from "@/data/countries.json";

export type GeoCountry = {
  code: string;
  name: string;
  dial: string;
  states?: string[];
};

export const GEO_COUNTRIES: GeoCountry[] = geo.countries;

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

/** Split stored phone into dial code + national number. */
export function splitE164(
  phone?: string | null,
  fallbackCountry = "IN",
): { countryCode: string; dial: string; local: string } {
  const raw = (phone ?? "").trim();
  const digits = raw.replace(/[^\d+]/g, "");
  const sorted = [...GEO_COUNTRIES].sort(
    (a, b) => b.dial.length - a.dial.length,
  );
  if (digits.startsWith("+")) {
    const hit = sorted.find((c) => digits.startsWith(c.dial));
    if (hit) {
      return {
        countryCode: hit.code,
        dial: hit.dial,
        local: digits.slice(hit.dial.length),
      };
    }
  }
  const fb = geoCountry(fallbackCountry) ?? GEO_COUNTRIES[0]!;
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
