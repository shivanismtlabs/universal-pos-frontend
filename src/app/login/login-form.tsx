"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/form";
import { AuthShell } from "@/components/auth-shell";
import {
  AuthDivider,
  AuthGoogleButton,
} from "@/components/auth-google-button";
import { loginSchema, type LoginInput } from "@/lib/validations";
import { appsApi, authApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";

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
  const setSession = useAuthStore((s) => s.setSession);
  const token = useAuthStore((s) => s.accessToken);
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
    if (ready && token) router.replace("/dashboard");
  }, [ready, token, router]);

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
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: LoginInput) {
    if (Date.now() < readLock().until) {
      toast.error("Too many attempts. Wait a minute and try again.");
      return;
    }

    const payload = {
      email: values.email.trim().toLowerCase(),
      password: values.password,
    };

    try {
      const data = await authApi.login(payload);
      writeLock(0, 0);
      setLockUntil(0);
      await applySession(data);
      toast.success("Welcome back");
      router.replace("/dashboard");
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

  async function applySession(data: {
    accessToken: string;
    stationToken?: string;
    refreshToken: string;
    user: {
      id: string;
      email: string;
      fullName: string;
      roles?: string[];
      storeId?: string | null;
      tenantId: string;
      pinSet?: boolean;
    };
    tenant?: { slug?: string };
  }) {
    setSession({
      accessToken: data.accessToken,
      stationToken: data.stationToken ?? data.accessToken,
      refreshToken: data.refreshToken,
      user: {
        id: data.user.id,
        email: data.user.email,
        fullName: data.user.fullName,
        roles: data.user.roles ?? ["admin"],
        storeId: data.user.storeId,
        tenantId: data.user.tenantId,
        pinSet: data.user.pinSet,
      },
      tenantSlug: data.tenant?.slug ?? "",
    });
    try {
      const boot = await appsApi.bootstrap();
      qc.setQueryData(["tenant-bootstrap"], boot);
    } catch {
      /* AppShell will retry */
    }
  }

  async function onGoogle(idToken: string) {
    try {
      const data = await authApi.googleAuth({ idToken, mode: "login" });
      writeLock(0, 0);
      setLockUntil(0);
      await applySession(data);
      toast.success("Welcome back");
      router.replace("/dashboard");
    } catch (e) {
      toast.error(
        e instanceof ApiError
          ? e.messages.join(", ")
          : "Google sign-in failed. Create a shop first, or use email.",
      );
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to access your shop dashboard, catalog, and counter."
    >
      <AuthGoogleButton
        mode="login"
        onCredential={onGoogle}
        disabled={locked || isSubmitting}
      />
      <AuthDivider />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="you@business.com"
            {...register("email")}
          />
          <FieldError message={errors.email?.message} />
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

        <p className="text-center text-[0.8125rem] text-[#5a6b7d]">
          New here?{" "}
          <Link
            href="/register"
            className="font-semibold text-[#1a56db] underline-offset-2 hover:underline"
          >
            Create a shop
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
