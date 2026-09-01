"use client";

import { useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { geoCountrySelectOptions } from "@/components/geo-country-options";
import { geoCountry, geoDial, joinE164, splitE164 } from "@/lib/geo";
import { filterMobileDigits } from "@/lib/input-guards";
import {
  validatePhoneParts,
} from "@/lib/phone";
import { FieldError } from "@/components/ui/form";

/** Registration + auth: never show sample digits — dial code is shown separately. */
const DEFAULT_PHONE_PLACEHOLDER = "Enter phone number";

type Props = {
  value: string;
  onChange: (fullPhone: string) => void;
  fallbackCountry?: string;
  label?: string;
  required?: boolean;
  error?: string;
  /** When false, only the parent `error` is shown (submit-time, like Sign In). */
  liveValidate?: boolean;
  labelClassName?: string;
  placeholder?: string;
  autoComplete?: string;
  onBlur?: () => void;
};

export function PhoneCountryInput({
  value,
  onChange,
  fallbackCountry = "IN",
  label = "Phone",
  required,
  error,
  liveValidate = true,
  labelClassName,
  placeholder = DEFAULT_PHONE_PLACEHOLDER,
  autoComplete = "tel-national",
  onBlur,
}: Props) {
  const parts = splitE164(value, fallbackCountry);
  /** User-chosen ISO country — kept even when the number field is still empty. */
  const [pickedCountry, setPickedCountry] = useState<string | null>(null);
  const lastEmit = useRef(value);

  useEffect(() => {
    if (value === lastEmit.current) return;
    lastEmit.current = value;
    // Parent hydrated a real E.164 — derive country from the value.
    // Keep picked country when value is cleared so dial selection sticks.
    if (value.trim()) {
      setPickedCountry(null);
    }
  }, [value]);

  const countryCode = pickedCountry || parts.countryCode || fallbackCountry;
  const selected = geoCountry(countryCode);
  const dial = selected?.dial || parts.dial || geoDial(fallbackCountry);
  const localDigits = filterMobileDigits(parts.local);
  // Parents sometimes pass "Phone *" while also setting required — keep a single marker.
  const labelText =
    String(label)
      .replace(/[\s*＊∗✱✳]+$/gu, "")
      .trim() || "Phone";

  function emit(nextDial: string, nextLocal: string) {
    const next = joinE164(nextDial, filterMobileDigits(nextLocal));
    lastEmit.current = next;
    onChange(next);
  }

  // Dial-only / empty number: never show inline "required" (parent submit owns that).
  const filledCheck = localDigits
    ? validatePhoneParts(dial, localDigits, countryCode)
    : { ok: true as const };
  const inlineError =
    error ||
    (liveValidate && localDigits && !filledCheck.ok
      ? filledCheck.message
      : undefined);

  return (
    <div>
      <Label className={labelClassName}>
        {labelText}
        {required ? (
          <span aria-hidden="true"> *</span>
        ) : null}
      </Label>
      <div className="mt-1.5 flex gap-2">
        <Select
          wrapperClassName="w-[8.75rem] shrink-0"
          className="h-9 px-2 text-[0.8125rem]"
          panelMinWidth={300}
          value={countryCode}
          onChange={(e) => {
            const code = e.target.value;
            const next = geoCountry(code);
            setPickedCountry(code);
            // Keep local digits; empty local → onChange("") without forcing a country snap-back.
            emit(next?.dial ?? geoDial(code), localDigits);
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
          autoComplete={autoComplete}
          pattern="[0-9]*"
          value={localDigits}
          onChange={(e) => emit(dial, e.target.value)}
          onBlur={onBlur}
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
      <FieldError message={inlineError} />
    </div>
  );
}
