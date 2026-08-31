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
import { forgotPasswordEmailSchema } from "@/lib/validations";
import { cn } from "@/lib/utils";

type Step = "email" | "otp";

const invalidInput =
  "border-[#fca5a5] hover:border-[#f87171] focus:border-[#dc2626] focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]";

function emailErrorFor(value: string): string {
  const parsed = forgotPasswordEmailSchema.safeParse({ email: value });
  if (parsed.success) return "";
  return parsed.error.issues[0]?.message ?? "Enter a valid email";
}

function otpErrorFor(value: string): string {
  if (/^\d{6}$/.test(value)) return "";
  return "Enter the OTP";
}

function passwordMessagesFor(value: string): string[] {
  const messages: string[] = [];
  if (value.length < 8) messages.push("Password must be at least 8 characters");
  if (value.length > 72) messages.push("Password must be at most 72 characters");
  if (!/[a-z]/.test(value)) messages.push("Include a lowercase letter");
  if (!/[A-Z]/.test(value)) messages.push("Include an uppercase letter");
  if (!/\d/.test(value)) messages.push("Include a number");
  if (!/[^A-Za-z0-9]/.test(value)) messages.push("Include a special character");
  return messages;
}

function confirmErrorFor(password: string, confirm: string): string {
  if (!confirm) return "Confirm your password";
  if (password !== confirm) return "Passwords do not match";
  return "";
}

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

  function syncResetErrors(
    next: { otp: string; password: string; confirm: string },
    requireAll: boolean,
  ) {
    const errors: Record<string, string> = {};
    let pwMessages: string[] = [];

    if (next.otp || requireAll) {
      const otpErr = otpErrorFor(next.otp);
      if (otpErr) errors.otp = otpErr;
    }
    if (next.password || requireAll) {
      pwMessages = passwordMessagesFor(next.password);
    }
    if (requireAll || next.confirm) {
      const confirmErr = confirmErrorFor(next.password, next.confirm);
      if (confirmErr) errors.confirm = confirmErr;
    }

    setFieldErrors(errors);
    setPasswordMessages(pwMessages);
  }

  async function sendOtp() {
    const emailErr = emailErrorFor(email);
    if (emailErr) {
      setFieldErrors({ email: emailErr });
      return;
    }
    const trimmed = email.trim().toLowerCase();
    setBusy(true);
    try {
      const res = await authApi.forgotPassword(trimmed);
      setEmail(trimmed);
      setDevCode(res.devCode ?? null);
      setStep("otp");
      setFieldErrors({});
      setPasswordMessages([]);
      toast.success(res.message, {
        style: {
          background: "#ecfdf5",
          border: "1px solid #6ee7b7",
          color: "#065f46",
        },
      });
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
    const otpErr = otpErrorFor(otp);
    const pwMessages = passwordMessagesFor(password);
    const confirmErr = confirmErrorFor(password, confirm);
    if (otpErr || pwMessages.length || confirmErr) {
      syncResetErrors({ otp, password, confirm }, true);
      return;
    }
    setBusy(true);
    try {
      const res = await authApi.resetPassword({
        email,
        otp,
        newPassword: password,
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
              aria-invalid={Boolean(fieldErrors.email)}
              className={cn(fieldErrors.email && invalidInput)}
              onChange={(ev) => {
                const value = ev.target.value;
                setEmail(value);
                setFieldErrors({
                  email: value.trim() ? emailErrorFor(value) : "",
                });
              }}
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
              aria-invalid={Boolean(fieldErrors.otp)}
              className={cn(fieldErrors.otp && invalidInput)}
              onChange={(ev) => {
                const value = ev.target.value.replace(/\D/g, "").slice(0, 6);
                setOtp(value);
                syncResetErrors({ otp: value, password, confirm }, false);
              }}
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
              aria-invalid={passwordMessages.length > 0}
              className={cn(passwordMessages.length > 0 && invalidInput)}
              onChange={(ev) => {
                const value = ev.target.value;
                setPassword(value);
                syncResetErrors({ otp, password: value, confirm }, false);
              }}
            />
            <FieldErrors messages={passwordMessages} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fp-confirm">Confirm password</Label>
            <Input
              id="fp-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              aria-invalid={Boolean(fieldErrors.confirm)}
              className={cn(fieldErrors.confirm && invalidInput)}
              onChange={(ev) => {
                const value = ev.target.value;
                setConfirm(value);
                syncResetErrors({ otp, password, confirm: value }, false);
              }}
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
