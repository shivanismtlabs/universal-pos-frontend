"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { geoStates } from "@/lib/geo";
import { geoCountrySelectOptions } from "@/components/geo-country-options";

type Props = {
  countryCode: string;
  state: string;
  onCountry: (code: string) => void;
  onState: (state: string) => void;
  countryRequired?: boolean;
  stateRequired?: boolean;
  countryLabel?: string;
  stateLabel?: string;
  countryError?: string;
};

export function CountryStateFields({
  countryCode,
  state,
  onCountry,
  onState,
  countryRequired,
  stateRequired,
  countryLabel = "Country",
  stateLabel = "State / region",
  countryError,
}: Props) {
  const states = geoStates(countryCode);
  return (
    <>
      <div>
        <Label>
          {countryLabel}
          {countryRequired ? " *" : ""}
        </Label>
        <Select
          className="mt-1"
          panelMinWidth={280}
          value={countryCode}
          onChange={(e) => {
            onCountry(e.target.value);
            onState("");
          }}
          aria-invalid={Boolean(countryError)}
        >
          <option value="">Select country</option>
          {geoCountrySelectOptions()}
        </Select>
        {countryError ? (
          <p className="mt-1 text-[0.75rem] font-medium text-[#b91c1c]">
            {countryError}
          </p>
        ) : null}
      </div>
      <div>
        <Label>
          {stateLabel}
          {stateRequired ? " *" : ""}
        </Label>
        {states.length ? (
          <Select
            className="mt-1"
            value={state}
            onChange={(e) => onState(e.target.value)}
          >
            <option value="">Select state</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            className="mt-1"
            value={state}
            onChange={(e) => onState(e.target.value)}
            placeholder="State / region"
          />
        )}
      </div>
    </>
  );
}
