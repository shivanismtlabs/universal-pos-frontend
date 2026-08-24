"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { GEO_COUNTRIES, geoDial, joinE164, splitE164 } from "@/lib/geo";

type Props = {
  value: string;
  onChange: (fullPhone: string) => void;
  fallbackCountry?: string;
  label?: string;
  required?: boolean;
};

export function PhoneCountryInput({
  value,
  onChange,
  fallbackCountry = "IN",
  label = "Phone",
  required,
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
          onChange={(e) => onChange(joinE164(e.target.value, parts.local))}
          aria-label="Country code"
        >
          {GEO_COUNTRIES.map((c) => (
            <option key={c.code} value={c.dial}>
              {c.dial} {c.code}
            </option>
          ))}
        </Select>
        <Input
          className="flex-1"
          inputMode="tel"
          value={parts.local}
          onChange={(e) => onChange(joinE164(dial, e.target.value))}
          placeholder="9876543210"
        />
      </div>
    </div>
  );
}
