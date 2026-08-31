"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FieldErrors } from "@/components/ui/form";
import { authApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import {
  forgotPasswordEmailSchema,
  resetPasswordSchema,
  zodFieldErrors,
  zodMessages,
} from "@/lib/validations";
import { ZodError } from "zod";

type Step = "email" | "otp";

export default function ForgotPasswordForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [passwordMessages, setPasswordMessages] = useState<string[]>([]);

  function clearErrors() {
    setFieldErrors({});
    setPasswordMessages([]);
  }

  async function sendOtp() {
    clearErrors();
    const parsed = forgotPasswordEmailSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }
    const trimmed = parsed.data.email;
    setBusy(true);
    try {
      const res = await authApi.forgotPassword(trimmed);
      setEmail(trimmed);
      setDevCode(res.devCode ?? null);
      setStep("otp");
      toast.success(res.message);
      if (res.devCode) {
        toast.message("Dev OTP", { description: res.devCode });
      }
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.messages.join(", ") : "Could not send OTP",
      );
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    clearErrors();
    const parsed = resetPasswordSchema.safeParse({
      otp,
      password,
      confirm,
    });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      const pwIssues = parsed.error.issues.filter(
        (i) => i.path[0] === "password",
      );
      setPasswordMessages(
        pwIssues.length ? zodMessages(new ZodError(pwIssues)) : [],
      );
      return;
    }
    setBusy(true);
    try {
      const res = await authApi.resetPassword({
        email,
        otp: parsed.data.otp,
        newPassword: parsed.data.password,
      });
      toast.success(res.message);
      router.replace("/login");
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.messages.join(", ")
          : "Could not reset password",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Forgot password"
      subtitle={
        step === "email"
          ? "Enter your email address to receive an OTP."
          : "Enter the OTP from your email, then choose a new password."
      }
    >
      {step === "email" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendOtp();
          }}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="fp-email">Email address</Label>
            <Input
              id="fp-email"
              type="email"
              autoComplete="username"
              placeholder="you@business.com"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
            />
            <FieldError message={fieldErrors.email} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Sending…" : "Send OTP"}
          </Button>
          <p className="text-center text-[0.8125rem] text-[#5a6b7d]">
            <Link
              href="/login"
              className="font-semibold text-[#1a56db] hover:underline"
            >
              Back to sign in
            </Link>
          </p>
        </form>
      ) : (
        <form onSubmit={resetPassword} className="space-y-4" noValidate>
          <p className="text-sm text-[#5a6b7d]">
            Code sent for <span className="font-medium text-[#0b1f33]">{email}</span>
            {devCode ? (
              <span className="mt-2 block rounded-md border border-[#c5d4f5] bg-[#eef3fc] px-3 py-2 text-sm text-[#0b1f33]">
                On-screen OTP (demo / local mailboxes cannot receive email):{" "}
                <span className="font-semibold tracking-widest text-[#1a56db]">
                  {devCode}
                </span>
              </span>
            ) : (
              <span className="mt-1 block text-xs">
                Check your inbox (and spam). Seed emails like{" "}
                <span className="font-medium">@*.demo</span> never receive real
                mail — use a real address or the on-screen code when shown.
              </span>
            )}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="fp-otp">6-digit OTP</Label>
            <Input
              id="fp-otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="482915"
              value={otp}
              onChange={(ev) => setOtp(ev.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <FieldError message={fieldErrors.otp} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fp-password">New password</Label>
            <Input
              id="fp-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
            />
            <p className="text-[0.7rem] text-[#8b9bb0]">
              8+ chars, upper, lower, number, special character
            </p>
            <FieldErrors messages={passwordMessages} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fp-confirm">Confirm password</Label>
            <Input
              id="fp-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(ev) => setConfirm(ev.target.value)}
            />
            <FieldError message={fieldErrors.confirm} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Updating…" : "Reset password"}
          </Button>
          <div className="flex flex-col items-center gap-2 text-[0.8125rem] text-[#5a6b7d]">
            <button
              type="button"
              className="font-medium text-[#1a56db] hover:underline"
              disabled={busy}
              onClick={() => void sendOtp()}
            >
              Resend OTP
            </button>
            <Link href="/login" className="hover:underline">
              Back to sign in
            </Link>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
