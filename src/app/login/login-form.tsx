"use client";

import { applyPortalResponse } from "@/lib/auth-portal";
import {
  biometricLogin,
  canUseBiometrics,
  biometricBlockReason,
  readRememberedBioEmail,
  rememberBioEmail,
} from "@/lib/webauthn";
import { appsApi, authApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { loginSchema, type LoginInput } from "@/lib/validations";
// Google sign-in UI — keep imports/handlers, hide the buttons for now.
// import {
//   AuthDivider,
//   AuthGoogleButton,
// } from "@/components/auth-google-button";
import AuthShell from "@/components/auth-shell";
import { TotpChallengeForm, is2faChallenge } from "@/components/totp-challenge-form";
import { FieldError } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const FAIL_KEY = "universal-pos-login-fails";
const LOCK_MS = 60_000;
const MAX_FAILS = 5;

function readLock(): { fails: number; until: number } {
  if (typeof window === "undefined") return { fails: 0, until: 0 };
  try {
    const raw = sessionStorage.getItem(FAIL_KEY);
    if (!raw) return { fails: 0, until: 0 };
    return JSON.parse(raw) as { fails: number; until: number };
  } catch {
    return { fails: 0, until: 0 };
  }
}

function writeLock(fails: number, until = 0) {
  sessionStorage.setItem(FAIL_KEY, JSON.stringify({ fails, until }));
}

export default function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const qc = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const identityToken = useAuthStore((s) => s.identityToken);
  const [ready, setReady] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [lockUntil, setLockUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (search.get("reason") === "session_expired") {
      toast.message("Session expired", {
        description: "Please sign in again to continue.",
      });
    }
  }, [search]);

  useEffect(() => {
    const lock = readLock();
    if (lock.until > Date.now()) setLockUntil(lock.until);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (accessToken) router.replace("/dashboard");
    else if (identityToken) router.replace("/organizations");
  }, [ready, accessToken, identityToken, router]);

  const locked = lockUntil > now;
  const lockSeconds = locked
    ? Math.max(0, Math.ceil((lockUntil - now) / 1000))
    : 0;

  useEffect(() => {
    if (lockUntil <= Date.now()) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= lockUntil) {
        setLockUntil(0);
        writeLock(0, 0);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [lockUntil]);

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    const remembered = readRememberedBioEmail();
    if (remembered) setValue("email", remembered);
  }, [setValue]);

  const [bioBusy, setBioBusy] = useState(false);
  const [bioSupported, setBioSupported] = useState(false);
  const [bioBlockReason, setBioBlockReason] = useState<string | null>(null);
  const [totpToken, setTotpToken] = useState<string | null>(null);
  useEffect(() => {
    setBioSupported(canUseBiometrics());
    setBioBlockReason(biometricBlockReason());
  }, []);

  async function finishAuth(
    data: Awaited<ReturnType<typeof authApi.login>>,
  ) {
    const dest = applyPortalResponse(data);
    writeLock(0, 0);
    setLockUntil(0);
    if (dest === "orgs") {
      toast.success("Signed in — select your organization");
      router.replace("/organizations");
      return;
    }
    try {
      const boot = await appsApi.bootstrap();
      qc.setQueryData(["tenant-bootstrap"], boot);
    } catch {
      /* AppShell retries */
    }
    toast.success("Welcome back");
    router.replace("/dashboard");
  }

  async function onSubmit(values: LoginInput) {
    if (Date.now() < readLock().until) {
      toast.error("Too many attempts. Wait a minute and try again.");
      return;
    }

    try {
      const data = await authApi.login({
        email: values.email.trim().toLowerCase(),
        password: values.password,
      });
      rememberBioEmail(values.email);
      if (is2faChallenge(data)) {
        setTotpToken(data.totpToken);
        return;
      }
      await finishAuth(data);
    } catch (e) {
      const lock = readLock();
      const fails = lock.fails + 1;
      if (fails >= MAX_FAILS) {
        const until = Date.now() + LOCK_MS;
        writeLock(fails, until);
        setLockUntil(until);
        toast.error("Too many failed attempts. Locked for 1 minute.");
      } else {
        writeLock(fails, 0);
        toast.error(
          e instanceof ApiError ? e.messages.join(", ") : "Login failed",
        );
      }
    }
  }

  // Restore with AuthGoogleButton when Google sign-in design is enabled again.
  // async function onGoogle(idToken: string) {
  //   try {
  //     const data = await authApi.googleAuth({ idToken, mode: "login" });
  //     await finishAuth(data);
  //   } catch (e) {
  //     toast.error(
  //       e instanceof ApiError
  //         ? e.messages.join(", ")
  //         : "Google sign-in failed",
  //     );
  //   }
  // }

  async function onBiometric() {
    const email = getValues("email")?.trim().toLowerCase();
    if (!email) {
      toast.error("Enter your email first");
      return;
    }
    if (!canUseBiometrics()) {
      toast.error(
        biometricBlockReason() ||
          "Biometrics need HTTPS (or localhost) and a supported browser",
      );
      return;
    }
    setBioBusy(true);
    try {
      const data = await biometricLogin(email);
      rememberBioEmail(email);
      await finishAuth(data as Awaited<ReturnType<typeof authApi.login>>);
    } catch (e) {
      toast.error(
        e instanceof ApiError
          ? e.messages.join(", ")
          : e instanceof Error
            ? e.message
            : "Biometric sign-in failed or cancelled",
      );
    } finally {
      setBioBusy(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Access your Universal POS account. You’ll choose or create an organization next."
    >
      {/* Google sign-in — design hidden for now, do not delete.
      <AuthGoogleButton
        mode="login"
        onCredential={onGoogle}
        disabled={locked || isSubmitting || Boolean(totpToken)}
      />
      <AuthDivider />
      */}

      {totpToken ? (
        <TotpChallengeForm
          totpToken={totpToken}
          onVerified={finishAuth}
          onCancel={() => setTotpToken(null)}
        />
      ) : (
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username webauthn"
            placeholder="you@business.com"
            {...register("email")}
          />
          <FieldError message={errors.email?.message} />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="password">Password</Label>
            <div className="flex items-center gap-3">
              <Link
                href="/forgot-password"
                className="text-[0.75rem] font-medium text-[#1a56db] hover:underline"
              >
                Forgot password?
              </Link>
              <button
                type="button"
                className="text-[0.75rem] font-medium text-[#5a6b7d] hover:underline"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            {...register("password")}
          />
          <FieldError message={errors.password?.message} />
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={isSubmitting || locked}
        >
          {locked
            ? `Try again in ${lockSeconds}s`
            : isSubmitting
              ? "Signing in…"
              : "Sign in"}
        </Button>

        {bioSupported ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={locked || bioBusy || isSubmitting}
            onClick={() => void onBiometric()}
          >
            {bioBusy
              ? "Waiting for fingerprint / Windows Hello…"
              : "Sign in with fingerprint / biometrics"}
          </Button>
        ) : (
          <p className="text-center text-[0.72rem] leading-snug text-[#8b9bb0]">
            {bioBlockReason ||
              "Biometric login available on HTTPS (or localhost) with Windows Hello / Touch ID"}
          </p>
        )}

        <p className="text-center text-[0.8125rem] text-[#5a6b7d]">
          New here?{" "}
          <Link
            href="/signup"
            className="font-semibold text-[#1a56db] underline-offset-2 hover:underline"
          >
            Create an account
          </Link>
        </p>
      </form>
      )}
    </AuthShell>
  );
}
