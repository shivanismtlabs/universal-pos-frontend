"use client";

/**
 * Zoho-style signup — personal identity only.
 * Organization setup happens on /organizations after this.
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
import { filterPersonNameInput } from "@/lib/input-guards";
import { authApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { applyPortalResponse } from "@/lib/auth-portal";
import { cn } from "@/lib/utils";

const fieldErr =
  "border-[#fca5a5] focus:border-[#dc2626] focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]";

export default function SignupClient() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting, isValid },
  } = useForm<SignupIdentityInput>({
    resolver: zodResolver(signupIdentitySchema),
    mode: "onChange",
    reValidateMode: "onChange",
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
  const signupScore = [
    strength.checks.length,
    strength.checks.lower,
    strength.checks.upper,
    strength.checks.number,
    strength.checks.special,
    strength.checks.noEmailPart,
  ].filter(Boolean).length;
  const strengthPct = Math.round((signupScore / 6) * 100);
  const passwordMissing = [
    !strength.checks.length && "At least 8 characters (max 72)",
    !strength.checks.lower && "One lowercase letter (a–z)",
    !strength.checks.upper && "One uppercase letter (A–Z)",
    !strength.checks.number && "One number (0–9)",
    !strength.checks.special && "One special character (!@#$…)",
    !strength.checks.noEmailPart && "Must not contain your email name",
  ].filter(Boolean) as string[];
  const passwordOk = passwordMissing.length === 0 && password.length > 0;
  const showPasswordHints =
    password.length > 0 || Boolean(errors.password);

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
      subtitle="Start a 15-day trial. You’ll set up the company next — no card required."
    >
      <form
        onSubmit={handleSubmit(onSubmit, () =>
          toast.error("Please fix the highlighted fields"),
        )}
        className="space-y-4"
        noValidate
      >
        <div className="space-y-1.5">
          <Label
            htmlFor="fullName"
            className="text-[0.8125rem] font-semibold text-[#111827]"
          >
            Full name *
          </Label>
          <Input
            id="fullName"
            autoComplete="name"
            placeholder="Your name"
            className={cn("h-11 rounded-lg", errors.fullName && fieldErr)}
            aria-invalid={Boolean(errors.fullName)}
            {...register("fullName", {
              onChange: (e) => {
                const next = filterPersonNameInput(e.target.value);
                setValue("fullName", next, { shouldValidate: true });
              },
            })}
          />
          <FieldError message={errors.fullName?.message} />
          <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
            Letters only — no numbers or special characters
          </p>
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="email"
            className="text-[0.8125rem] font-semibold text-[#111827]"
          >
            Email *
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="name@company.com"
            className={cn("h-11 rounded-lg", errors.email && fieldErr)}
            aria-invalid={Boolean(errors.email)}
            {...register("email")}
          />
          <FieldError message={errors.email?.message} />
        </div>

        <div className="space-y-1.5">
          <PhoneCountryInput
            label="Phone *"
            required
            value={phone}
            onChange={(v) =>
              setValue("phone", v, { shouldValidate: true, shouldDirty: true })
            }
          />
          <FieldError message={errors.phone?.message} />
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="password"
            className="text-[0.8125rem] font-semibold text-[#111827]"
          >
            Password *
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              className={cn(
                "h-11 rounded-lg pr-16",
                errors.password && fieldErr,
              )}
              aria-invalid={Boolean(errors.password)}
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
          {showPasswordHints ? (
            <>
              <div className="h-1 overflow-hidden rounded-full bg-[#eef2f8]">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    passwordOk
                      ? "bg-[#16a34a]"
                      : signupScore <= 2
                        ? "bg-[#ef4444]"
                        : "bg-[#f59e0b]",
                  )}
                  style={{ width: `${strengthPct}%` }}
                />
              </div>
              {passwordOk ? (
                <p className="mt-1 text-[0.75rem] text-[#15803d]">
                  Password looks good
                </p>
              ) : (
                <ul
                  className="mt-1 space-y-0.5 text-[0.75rem] text-[#b91c1c]"
                  role="alert"
                >
                  {passwordMissing.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
          <FieldError message={errors.password?.message} />
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="confirmPassword"
            className="text-[0.8125rem] font-semibold text-[#111827]"
          >
            Confirm password *
          </Label>
          <Input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            className={cn(
              "h-11 rounded-lg",
              errors.confirmPassword && fieldErr,
            )}
            aria-invalid={Boolean(errors.confirmPassword)}
            {...register("confirmPassword")}
          />
          <FieldError message={errors.confirmPassword?.message} />
        </div>

        <p className="text-[0.75rem] leading-relaxed text-[#8b9bb0]">
          By creating an account you agree to our Terms of Service and Privacy
          Policy. 15-day free trial · no card required.
        </p>

        <Button
          type="submit"
          className="h-11 w-full rounded-lg text-[0.9375rem] font-semibold"
          disabled={isSubmitting || !isValid}
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
