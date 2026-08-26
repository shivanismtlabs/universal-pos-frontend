"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { GEO_COUNTRIES, geoDial, joinE164, splitE164 } from "@/lib/geo";
import { filterMobileDigits } from "@/lib/input-guards";

type Props = {
  value: string;
  onChange: (fullPhone: string) => void;
  fallbackCountry?: string;
  label?: string;
  required?: boolean;
  error?: string;
};

export function PhoneCountryInput({
  value,
  onChange,
  fallbackCountry = "IN",
  label = "Phone",
  required,
  error,
}: Props) {
  const parts = splitE164(value, fallbackCountry);
  const dial = parts.dial || geoDial(fallbackCountry);

  return (
    <div>
      <Label>
        {label}
        {required ? " *" : ""}
      </Label>
      <div className="mt-1.5 flex gap-2">
        <Select
          wrapperClassName="w-[7.25rem] shrink-0"
          className="h-9 px-2 text-[0.8125rem]"
          value={dial}
          onChange={(e) =>
            onChange(joinE164(e.target.value, filterMobileDigits(parts.local)))
          }
          aria-label="Country code"
          aria-invalid={Boolean(error)}
        >
          {GEO_COUNTRIES.map((c) => (
            <option key={c.code} value={c.dial}>
              {c.dial} {c.code}
            </option>
          ))}
        </Select>
        <Input
          className="flex-1"
          inputMode="numeric"
          autoComplete="tel-national"
          pattern="[0-9]*"
          value={filterMobileDigits(parts.local)}
          onChange={(e) =>
            onChange(joinE164(dial, filterMobileDigits(e.target.value)))
          }
          onKeyDown={(e) => {
            if (
              e.key === " " ||
              e.key === "-" ||
              e.key === "(" ||
              e.key === ")" ||
              e.key === "." ||
              e.key === "+"
            ) {
              e.preventDefault();
            }
          }}
          placeholder="9876543210"
          aria-invalid={Boolean(error)}
        />
      </div>
      {error ? (
        <p className="mt-1 text-[0.75rem] font-medium text-[#b91c1c]">{error}</p>
      ) : (
        <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
          Digits only — no spaces or special characters
        </p>
      )}
    </div>
  );
}
