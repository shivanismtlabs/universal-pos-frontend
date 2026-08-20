"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { GEO_COUNTRIES, geoStates } from "@/lib/geo";

type Props = {
  countryCode: string;
  state: string;
  onCountry: (code: string) => void;
  onState: (state: string) => void;
  countryRequired?: boolean;
  stateRequired?: boolean;
  countryLabel?: string;
  stateLabel?: string;
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
          value={countryCode}
          onChange={(e) => {
            onCountry(e.target.value);
            onState("");
          }}
        >
          <option value="">Select country</option>
          {GEO_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </Select>
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
