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
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/form";
import { AuthShell } from "@/components/auth-shell";
import {
  AuthDivider,
  AuthGoogleButton,
} from "@/components/auth-google-button";
import {
  phoneSchema,
  strongPasswordSchema,
  passwordStrength,
} from "@/lib/validations";
import { authApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { applyPortalResponse } from "@/lib/auth-portal";
import { cn } from "@/lib/utils";

const signupSchema = z
  .object({
    fullName: z.string().trim().min(2, "Name is required").max(255),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Enter a valid email")
      .max(255),
    password: strongPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
    phone: phoneSchema.optional().or(z.literal("")),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine(
    (v) => {
      const local = v.email.split("@")[0]?.toLowerCase() ?? "";
      return !local || local.length < 2 || !v.password.toLowerCase().includes(local);
    },
    {
      message: "Password must not contain your email name",
      path: ["password"],
    },
  );

type SignupInput = z.infer<typeof signupSchema>;

export default function SignupClient() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    mode: "onChange",
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

  async function onSubmit(values: SignupInput) {
    try {
      const data = await authApi.signup({
        fullName: values.fullName.trim(),
        email: values.email.trim().toLowerCase(),
        password: values.password,
        ...(values.phone?.trim() ? { phone: values.phone.trim() } : {}),
      });
      applyPortalResponse(data);
      toast.success("Account created — set up your organization");
      router.replace("/organizations");
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Sign up failed",
      );
    }
  }

  async function onGoogle(idToken: string) {
    try {
      const data = await authApi.googleAuth({ idToken, mode: "register" });
      applyPortalResponse(data);
      toast.success("Signed in with Google — choose or create a shop");
      router.replace("/organizations");
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Google sign-up failed",
      );
    }
  }

  return (
    <AuthShell
      title="Start your free trial"
      subtitle="Create your account first. You’ll set up the company / store next — same flow as modern POS platforms."
    >
      <AuthGoogleButton
        mode="register"
        onCredential={onGoogle}
        disabled={isSubmitting}
      />
      <AuthDivider label="or sign up with email" />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            autoComplete="name"
            placeholder="Your name"
            {...register("fullName")}
          />
          <FieldError message={errors.fullName?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email"> email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@business.com"
            {...register("email")}
          />
          <FieldError message={errors.email?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+91 …"
            {...register("phone")}
          />
          <FieldError message={errors.phone?.message} />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <button
              type="button"
              className="text-[0.75rem] font-medium text-[#1a56db] hover:underline"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            {...register("password")}
          />
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
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            {...register("confirmPassword")}
          />
          <FieldError message={errors.confirmPassword?.message} />
        </div>

        <p className="text-[0.75rem] leading-relaxed text-[#8b9bb0]">
          By creating an account you agree to our Terms of Service and Privacy
          Policy. 15-day free trial · no card required.
        </p>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>

        <p className="text-center text-[0.8125rem] text-[#5a6b7d]">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-[#1a56db] underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
