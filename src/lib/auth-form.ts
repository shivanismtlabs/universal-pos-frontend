import type { FieldValues, FormState } from "react-hook-form";
import { clearRememberedBioEmail } from "@/lib/webauthn";

/** Shared react-hook-form options for Sign In / Sign Up. */
export const AUTH_FORM_OPTIONS = {
  mode: "onSubmit" as const,
  reValidateMode: "onChange" as const,
};

/** Drop remembered login email + any other auth form persistence after sign-out. */
export function clearLoginFormPersistence() {
  clearRememberedBioEmail();
}

/** Show a field error only after blur/touch or a submit attempt — never on first paint. */
export function authFieldError<T extends FieldValues>(
  formState: Pick<FormState<T>, "errors" | "isSubmitted" | "touchedFields">,
  name: keyof T & string,
): string | undefined {
  const message = formState.errors[name]?.message;
  if (!message) return undefined;
  const touched = Boolean(
    formState.touchedFields[name as keyof typeof formState.touchedFields],
  );
  if (formState.isSubmitted || touched) {
    return String(message);
  }
  return undefined;
}

export const SIGNUP_PASSWORD_RULES = [
  { id: "length", key: "length" as const, label: "At least 8 characters (max 72)" },
  { id: "lower", key: "lower" as const, label: "One lowercase letter (a–z)" },
  { id: "upper", key: "upper" as const, label: "One uppercase letter (A–Z)" },
  { id: "number", key: "number" as const, label: "One number (0–9)" },
  { id: "special", key: "special" as const, label: "One special character (!@#$…)" },
  {
    id: "noEmail",
    key: "noEmailPart" as const,
    label: "Must not contain your email name",
  },
] as const;
