"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { GEO_COUNTRIES, geoDial, joinE164, splitE164 } from "@/lib/geo";
import { filterMobileDigits } from "@/lib/input-guards";
import {
  phonePlaceholder,
  phoneValidationMessage,
  validatePhoneParts,
} from "@/lib/phone";

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
  const countryCode = parts.countryCode || fallbackCountry;
  const hint = phoneValidationMessage(countryCode);
  const placeholder = phonePlaceholder(countryCode, dial);

  function emit(nextDial: string, nextLocal: string) {
    onChange(joinE164(nextDial, filterMobileDigits(nextLocal)));
  }

  const inlineCheck = value.trim()
    ? validatePhoneParts(dial, parts.local, fallbackCountry)
    : { ok: !required, message: required ? "Phone is required" : undefined };
  const inlineError = error || (!inlineCheck.ok ? inlineCheck.message : undefined);

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
          onChange={(e) => emit(e.target.value, parts.local)}
          aria-label="Country code"
          aria-invalid={Boolean(inlineError)}
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
          onChange={(e) => emit(dial, e.target.value)}
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
          placeholder={placeholder}
          aria-invalid={Boolean(inlineError)}
        />
      </div>
      {inlineError ? (
        <p className="mt-1 text-[0.75rem] font-medium text-[#b91c1c]">
          {inlineError}
        </p>
      ) : (
        <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">{hint}</p>
      )}
    </div>
  );
}
