"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/form";
import { AuthShell } from "@/components/auth-shell";
import { loginSchema, type LoginInput } from "@/lib/validations";
import { authApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { Stagger, StaggerItem } from "@/components/motion";

const FAIL_KEY = "tuxedo-login-fails";
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
  const setSession = useAuthStore((s) => s.setSession);
  const token = useAuthStore((s) => s.accessToken);
  const savedSlug = useAuthStore((s) => s.tenantSlug);
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
  const lockSeconds = locked ? Math.max(0, Math.ceil((lockUntil - now) / 1000)) : 0;

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
      tenantSlug: savedSlug ?? "",
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: LoginInput) {
    if (Date.now() < readLock().until) {
      toast.error("Too many attempts. Wait a minute and try again.");
      return;
    }

    const payload: LoginInput = {
      tenantSlug: values.tenantSlug.trim().toLowerCase(),
      email: values.email.trim().toLowerCase(),
      password: values.password,
    };

    try {
      const data = await authApi.login(payload);
      writeLock(0, 0);
      setLockUntil(0);
      setSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: {
          id: data.user.id,
          email: data.user.email,
          fullName: data.user.fullName,
          roles: data.user.roles ?? ["admin"],
          storeId: data.user.storeId,
          tenantId: data.user.tenantId,
        },
        tenantSlug: payload.tenantSlug,
      });
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

  return (
    <AuthShell
      title="Sign in to your shop"
      subtitle="Staff access for Tuxedo POS — short-lived tokens, tenant isolation, and secure session handling."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <Stagger className="space-y-5" delay={0.04}>
          <StaggerItem>
            <div>
              <p className="eyebrow text-[#0f766e]">Staff access</p>
              <h2 className="display mt-2 text-2xl text-[#111827]">
                Continue to Tuxedo
              </h2>
              <p className="mt-1 text-sm text-[#6b7280]">
                Enter tenant slug and credentials
              </p>
            </div>
          </StaggerItem>

          <StaggerItem>
            <div>
              <Label htmlFor="tenantSlug">Tenant slug</Label>
              <Input
                id="tenantSlug"
                className="mt-2"
                autoComplete="organization"
                spellCheck={false}
                placeholder="your-shop"
                {...register("tenantSlug")}
              />
              <FieldError message={errors.tenantSlug?.message} />
            </div>
          </StaggerItem>

          <StaggerItem>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                className="mt-2"
                autoComplete="username"
                placeholder="you@shop.com"
                {...register("email")}
              />
              <FieldError message={errors.email?.message} />
            </div>
          </StaggerItem>

          <StaggerItem>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  className="text-xs font-medium text-[#0f766e] hover:underline"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                className="mt-2"
                autoComplete="current-password"
                {...register("password")}
              />
              <FieldError message={errors.password?.message} />
            </div>
          </StaggerItem>

          <StaggerItem>
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || locked}
            >
              {locked
                ? `Locked (${lockSeconds}s)`
                : isSubmitting
                  ? "Signing in…"
                  : "Sign in"}
            </Button>
          </StaggerItem>

          <StaggerItem>
            <p className="text-center text-sm text-[#6b7280]">
              New shop?{" "}
              <Link
                href="/register"
                className="font-semibold text-[#0f766e] hover:underline"
              >
                Register tenant
              </Link>
            </p>
          </StaggerItem>
        </Stagger>
      </form>
    </AuthShell>
  );
}
