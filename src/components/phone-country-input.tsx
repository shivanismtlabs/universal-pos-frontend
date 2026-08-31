"use client";

import { useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { geoCountrySelectOptions } from "@/components/geo-country-options";
import { geoCountry, geoDial, joinE164, splitE164 } from "@/lib/geo";
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
  const [pickedCountry, setPickedCountry] = useState<string | null>(null);
  const lastEmit = useRef(value);
  useEffect(() => {
    if (value === lastEmit.current) return;
    lastEmit.current = value;
    setPickedCountry(null);
  }, [value]);
  const picked = pickedCountry ? geoCountry(pickedCountry) : undefined;
  const countryCode =
    picked && (!parts.dial || picked.dial === parts.dial)
      ? picked.code
      : parts.countryCode || fallbackCountry;
  const selected = geoCountry(countryCode);
  const dial = selected?.dial || parts.dial || geoDial(fallbackCountry);
  const hint = phoneValidationMessage(countryCode);
  const placeholder = phonePlaceholder(countryCode, dial);
  const labelText = label.replace(/\s*\*+\s*$/, "").trim() || "Phone";

  function emit(nextDial: string, nextLocal: string) {
    const next = joinE164(nextDial, filterMobileDigits(nextLocal));
    lastEmit.current = next;
    onChange(next);
  }

  // Empty required: wait for parent `error` (submit). Avoid a second live line.
  const filledCheck = value.trim()
    ? validatePhoneParts(dial, parts.local, countryCode)
    : { ok: true as const };
  const inlineError =
    error ||
    (value.trim() && !filledCheck.ok ? filledCheck.message : undefined);

  return (
    <div>
      <Label>
        {labelText}
        {required ? " *" : ""}
      </Label>
      <div className="mt-1.5 flex gap-2">
        <Select
          wrapperClassName="w-[8.75rem] shrink-0"
          className="h-9 px-2 text-[0.8125rem]"
          panelMinWidth={300}
          value={countryCode}
          onChange={(e) => {
            const next = geoCountry(e.target.value);
            setPickedCountry(e.target.value);
            emit(next?.dial ?? geoDial(e.target.value), parts.local);
          }}
          aria-label="Country code"
          aria-invalid={Boolean(inlineError)}
        >
          {geoCountrySelectOptions({
            formatLabel: (c) => `${c.dial} ${c.name}`,
            shortLabel: (c) => c.dial,
          })}
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
