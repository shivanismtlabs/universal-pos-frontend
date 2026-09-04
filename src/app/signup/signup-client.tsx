"use client";

/**
 * Zoho-style signup — personal identity only.
 * Organization setup happens on /organizations after this.
 * Validation matches Sign In: submit-time FieldError, no live borders/toasts.
 */
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/form";
import { AuthShell } from "@/components/auth-shell";
import { PhoneCountryInput } from "@/components/phone-country-input";
import {
  AUTH_FORM_OPTIONS,
  SIGNUP_PASSWORD_RULES,
  authFieldError,
} from "@/lib/auth-form";
import {
  signupIdentitySchema,
  passwordStrength,
  type SignupIdentityInput,
} from "@/lib/validations";
import { phoneHasLocalDigits } from "@/lib/phone";
import { authApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { applyPortalResponse } from "@/lib/auth-portal";
import { cn } from "@/lib/utils";

import { preventSpaceKeyDown, stripSpaces, preventLeadingOrDoubleSpaceKeyDown, filterPersonNameInput } from "@/lib/input-guards";

const authLabel = "text-[0.8125rem] font-semibold text-[#111827]";
const SIGNUP_DRAFT_KEY = "up_signup_draft";

function clearSignupDraft() {
  try {
    localStorage.removeItem(SIGNUP_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export default function SignupClient() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    clearErrors,
    getValues,
    formState,
  } = useForm<SignupIdentityInput>({
    ...AUTH_FORM_OPTIONS,
    resolver: zodResolver(signupIdentitySchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
      phone: "",
    },
  });

  const { errors, isSubmitting, isSubmitted, touchedFields } = formState;
  const password = watch("password") ?? "";
  const email = watch("email") ?? "";
  const phone = watch("phone") ?? "";
  const fullName = watch("fullName") ?? "";
  const strength = passwordStrength(password, { email });
  const passwordOk =
    SIGNUP_PASSWORD_RULES.every((r) => strength.checks[r.key]) &&
    password.length > 0;
  const showPasswordHints = isSubmitted || touchedFields.password;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIGNUP_DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          if (parsed.fullName) setValue("fullName", parsed.fullName, { shouldValidate: false });
          if (parsed.email) setValue("email", parsed.email, { shouldValidate: false });
          if (parsed.phone) setValue("phone", parsed.phone, { shouldValidate: false });
        }
      }
    } catch {
      /* ignore storage read error */
    }
  }, [setValue]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (fullName.trim() || email.trim() || phone.trim()) {
          const payload = { fullName, email, phone };
          localStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify(payload));
        }
      } catch {
        /* ignore storage write error */
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [fullName, email, phone]);

  async function onSubmit(values: SignupIdentityInput) {
    try {
      const data = await authApi.signup({
        fullName: values.fullName.trim(),
        email: values.email.trim().toLowerCase(),
        password: values.password,
        phone: values.phone.trim(),
      });
      clearSignupDraft();
      const dest = applyPortalResponse(data);
      if (dest === "orgs") {
        toast.success("Account created — set up your organization");
        router.replace("/organizations");
        return;
      }
      toast.success("Account created — complete your organization profile");
      router.replace("/organizations?setup=1");
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Sign up failed",
      );
    }
  }

  return (
    <AuthShell
      wide
      title="Create your workspace"
      subtitle="Create your account, then set up your company and store."
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-5"
        noValidate
      >
        <div className="space-y-1.5">
          <Label htmlFor="fullName" className={authLabel}>
            Full name <span className="text-[#dc2626]">*</span>
          </Label>
          <Input
            id="fullName"
            autoComplete="name"
            className="h-11 rounded-lg"
            aria-invalid={Boolean(authFieldError(formState, "fullName"))}
            onKeyDown={preventLeadingOrDoubleSpaceKeyDown}
            {...register("fullName", {
              onChange: (e) => {
                const sanitized = filterPersonNameInput(e.target.value);
                if (sanitized !== e.target.value) {
                  e.target.value = sanitized;
                  setValue("fullName", sanitized, {
                    shouldValidate: formState.isSubmitted,
                  });
                }
              },
            })}
          />
          <FieldError message={authFieldError(formState, "fullName")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className={authLabel}>
            Email <span className="text-[#dc2626]">*</span>
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="name@company.com"
            className="h-11 rounded-lg"
            aria-invalid={Boolean(authFieldError(formState, "email"))}
            onKeyDown={preventSpaceKeyDown}
            {...register("email", {
              onChange: (e) => {
                const sanitized = stripSpaces(e.target.value);
                if (sanitized !== e.target.value) {
                  e.target.value = sanitized;
                  setValue("email", sanitized, {
                    shouldValidate: formState.isSubmitted,
                  });
                }
              },
            })}
          />
          <FieldError message={authFieldError(formState, "email")} />
        </div>

        <div className="space-y-1.5">
          <PhoneCountryInput
            label="Phone"
            required
            labelClassName={authLabel}
            liveValidate={false}
            autoComplete="off"
            value={phone}
            error={authFieldError(formState, "phone")}
            onBlur={() => {
              setValue("phone", getValues("phone"), {
                shouldTouch: true,
                shouldValidate: isSubmitted,
              });
            }}
            onChange={(v) => {
              const hasLocal = phoneHasLocalDigits(v);
              setValue("phone", v, {
                shouldDirty: true,
                shouldTouch: hasLocal || isSubmitted,
                shouldValidate:
                  isSubmitted ||
                  (hasLocal && Boolean(touchedFields.phone)),
              });
              if (!hasLocal && !isSubmitted) {
                clearErrors("phone");
              }
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className={authLabel}>
            Password <span className="text-[#dc2626]">*</span>
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              className="h-11 rounded-lg pr-16"
              aria-invalid={Boolean(authFieldError(formState, "password"))}
              onKeyDown={preventSpaceKeyDown}
              {...register("password", {
                onChange: (e) => {
                  const sanitized = stripSpaces(e.target.value);
                  if (sanitized !== e.target.value) {
                    e.target.value = sanitized;
                    setValue("password", sanitized, {
                      shouldValidate: formState.isSubmitted,
                    });
                  }
                },
              })}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-3 text-[0.7rem] font-semibold tracking-wide text-[#9ca3af] uppercase hover:text-[#4b5563]"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <FieldError message={authFieldError(formState, "password")} />
          <p className="mt-1.5 text-[0.7rem] font-medium text-[#64748b]">
            Password must include:
          </p>
          <ul className="mt-1 space-y-0.5 text-[0.75rem]" aria-live="polite">
            {SIGNUP_PASSWORD_RULES.map((rule) => {
              const ok = strength.checks[rule.key];
              return (
                <li
                  key={rule.id}
                  className={cn(
                    ok
                      ? "text-[#15803d]"
                      : showPasswordHints && errors.password
                        ? "text-[#b91c1c]"
                        : "text-[#64748b]",
                  )}
                >
                  <span aria-hidden="true" className="mr-1.5">
                    {ok ? "✓" : "•"}
                  </span>
                  {rule.label}
                </li>
              );
            })}
          </ul>
          {passwordOk ? (
            <p className="mt-1 text-[0.75rem] text-[#15803d]">
              Password looks good
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword" className={authLabel}>
            Confirm password <span className="text-[#dc2626]">*</span>
          </Label>
          <Input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            className="h-11 rounded-lg"
            aria-invalid={Boolean(authFieldError(formState, "confirmPassword"))}
            onKeyDown={preventSpaceKeyDown}
            {...register("confirmPassword", {
              onChange: (e) => {
                const sanitized = stripSpaces(e.target.value);
                if (sanitized !== e.target.value) {
                  e.target.value = sanitized;
                  setValue("confirmPassword", sanitized, {
                    shouldValidate: formState.isSubmitted,
                  });
                }
              },
            })}
          />
          <FieldError message={authFieldError(formState, "confirmPassword")} />
        </div>

        <p className="text-[0.75rem] leading-relaxed text-[#8b9bb0]">
          By creating an account you agree to our Terms of Service and Privacy
          Policy.
        </p>

        <Button
          type="submit"
          className="h-11 w-full rounded-lg text-[0.9375rem] font-semibold"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating account…" : "Create workspace"}
        </Button>

        <p className="pt-1 text-center text-[0.875rem] text-[#6b7280]">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-[#1a56db] hover:underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
