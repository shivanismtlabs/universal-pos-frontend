import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FieldError } from "@/components/ui/form";
import { geoStates } from "@/lib/geo";
import { geoCountrySelectOptions } from "@/components/geo-country-options";
import { cn } from "@/lib/utils";

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
  stateError?: string;
};

const fieldErr =
  "border-[#fca5a5] focus:border-[#dc2626] focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]";

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
  stateError,
}: Props) {
  const states = geoStates(countryCode);
  return (
    <>
      <div>
        <Label>
          {countryLabel}
          {countryRequired ? <span className="text-[#dc2626]"> *</span> : ""}
        </Label>
        <Select
          className={cn("mt-1", countryError && fieldErr)}
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
        <FieldError message={countryError} />
      </div>
      <div>
        <Label>
          {stateLabel}
          {stateRequired ? <span className="text-[#dc2626]"> *</span> : ""}
        </Label>
        {states.length ? (
          <Select
            className={cn("mt-1", stateError && fieldErr)}
            value={state}
            onChange={(e) => onState(e.target.value)}
            aria-invalid={Boolean(stateError)}
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
            className={cn("mt-1", stateError && fieldErr)}
            value={state}
            onChange={(e) => onState(e.target.value)}
            placeholder="State / region"
            aria-invalid={Boolean(stateError)}
          />
        )}
        <FieldError message={stateError} />
      </div>
    </>
  );
}
