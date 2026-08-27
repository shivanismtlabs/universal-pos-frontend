import {
  GEO_FREQUENT_COUNTRIES,
  GEO_OTHER_COUNTRIES,
  type GeoCountry,
} from "@/lib/geo";

type Options = {
  formatLabel?: (country: GeoCountry) => string;
  shortLabel?: (country: GeoCountry) => string;
};

/**
 * Returns `<option>` / `<optgroup>` nodes for a `<Select>`.
 * Must be invoked as `{geoCountrySelectOptions()}` so the Select parser
 * sees real `<option>` elements (not a wrapper component).
 */
export function geoCountrySelectOptions({
  formatLabel = (c) => c.name,
  shortLabel,
}: Options = {}) {
  const nodes = (list: GeoCountry[]) =>
    list.map((c) => (
      <option
        key={c.code}
        value={c.code}
        data-flag={c.code}
        {...(shortLabel ? { "data-short-label": shortLabel(c) } : {})}
      >
        {formatLabel(c)}
      </option>
    ));

  return (
    <>
      {nodes(GEO_FREQUENT_COUNTRIES)}
      <optgroup label="All countries">{nodes(GEO_OTHER_COUNTRIES)}</optgroup>
    </>
  );
}
