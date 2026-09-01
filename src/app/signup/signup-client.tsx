"use client";

/**
 * Zoho-style signup — personal identity only.
 * Organization setup happens on /organizations after this.
 * Validation matches Sign In: submit-time FieldError, no live borders/toasts.
 */
import { useState } from "react";
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
  signupIdentitySchema,
  passwordStrength,
  type SignupIdentityInput,
} from "@/lib/validations";
import { authApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { applyPortalResponse } from "@/lib/auth-portal";
import { cn } from "@/lib/utils";

const authLabel = "text-[0.8125rem] font-semibold text-[#111827]";

export default function SignupClient() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm<SignupIdentityInput>({
    resolver: zodResolver(signupIdentitySchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
      phone: "",
    },
  });

  const password = watch("password") ?? "";
  const email = watch("email") ?? "";
  const phone = watch("phone") ?? "";
  const strength = passwordStrength(password, { email });
  /** Signup has 6 rules (no shop slug). */
  const passwordRules = [
    {
      id: "length",
      ok: strength.checks.length,
      label: "At least 8 characters (max 72)",
    },
    {
      id: "lower",
      ok: strength.checks.lower,
      label: "One lowercase letter (a–z)",
    },
    {
      id: "upper",
      ok: strength.checks.upper,
      label: "One uppercase letter (A–Z)",
    },
    {
      id: "number",
      ok: strength.checks.number,
      label: "One number (0–9)",
    },
    {
      id: "special",
      ok: strength.checks.special,
      label: "One special character (!@#$…)",
    },
    {
      id: "noEmail",
      ok: strength.checks.noEmailPart,
      label: "Must not contain your email name",
    },
  ] as const;
  const signupScore = passwordRules.filter((r) => r.ok).length;
  const passwordOk = signupScore === passwordRules.length && password.length > 0;

  async function onSubmit(values: SignupIdentityInput) {
    try {
      const data = await authApi.signup({
        fullName: values.fullName.trim(),
        email: values.email.trim().toLowerCase(),
        password: values.password,
        phone: values.phone.trim(),
      });
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
            Full name
          </Label>
          <Input
            id="fullName"
            autoComplete="name"
            placeholder="Your name"
            className="h-11 rounded-lg"
            {...register("fullName")}
          />
          <FieldError message={errors.fullName?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className={authLabel}>
            Email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="name@company.com"
            className="h-11 rounded-lg"
            {...register("email")}
          />
          <FieldError message={errors.email?.message} />
        </div>

        <div className="space-y-1.5">
          <PhoneCountryInput
            label="Phone"
            labelClassName={authLabel}
            liveValidate={false}
            value={phone}
            error={errors.phone?.message}
            onChange={(v) =>
              setValue("phone", v, {
                shouldDirty: true,
                shouldValidate: isSubmitted,
              })
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className={authLabel}>
            Password
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              className="h-11 rounded-lg pr-16"
              {...register("password")}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-3 text-[0.7rem] font-semibold tracking-wide text-[#9ca3af] uppercase hover:text-[#4b5563]"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <FieldError message={errors.password?.message} />
          {password.length > 0 ? (
            <>
              <p className="mt-1.5 text-[0.7rem] font-medium text-[#64748b]">
                Password must include:
              </p>
              <ul className="mt-1 space-y-0.5 text-[0.75rem]" aria-live="polite">
                {passwordRules.map((rule) => (
                  <li
                    key={rule.id}
                    className={cn(
                      rule.ok
                        ? "text-[#15803d]"
                        : errors.password
                          ? "text-[#b91c1c]"
                          : "text-[#64748b]",
                    )}
                  >
                    <span aria-hidden="true" className="mr-1.5">
                      {rule.ok ? "✓" : "•"}
                    </span>
                    {rule.label}
                  </li>
                ))}
              </ul>
              {passwordOk ? (
                <p className="mt-1 text-[0.75rem] text-[#15803d]">
                  Password looks good
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword" className={authLabel}>
            Confirm password
          </Label>
          <Input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            className="h-11 rounded-lg"
            {...register("confirmPassword")}
          />
          <FieldError message={errors.confirmPassword?.message} />
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
