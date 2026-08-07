"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/form";
import { AuthShell } from "@/components/auth-shell";
import {
  passwordStrength,
  registerUserSchema,
  type RegisterUserInput,
} from "@/lib/validations";
import { authApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";

export default function RegisterUserPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterUserInput>({
    resolver: zodResolver(registerUserSchema),
    defaultValues: {
      tenantSlug: "",
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
      phone: "",
    },
  });

  const password = useWatch({ control, name: "password" }) ?? "";
  const email = useWatch({ control, name: "email" }) ?? "";
  const slug = useWatch({ control, name: "tenantSlug" }) ?? "";
  const strength = passwordStrength(password, { email, slug });

  async function onSubmit(values: RegisterUserInput) {
    const { confirmPassword: _c, ...rest } = values;
    try {
      const data = await authApi.registerUser({
        tenantSlug: rest.tenantSlug.trim().toLowerCase(),
        fullName: rest.fullName.trim(),
        email: rest.email.trim().toLowerCase(),
        password: rest.password,
        phone: rest.phone || undefined,
      });
      setSession({
        accessToken: data.accessToken,
        stationToken: data.stationToken ?? data.accessToken,
        refreshToken: data.refreshToken,
        user: {
          id: data.user.id,
          email: data.user.email,
          fullName: data.user.fullName,
          roles: data.user.roles ?? ["staff"],
          storeId: data.user.storeId ?? data.store?.id,
          tenantId: data.user.tenantId ?? data.tenant.id,
        },
        tenantSlug: data.tenant.slug,
      });
      toast.success("Account created — opening your dashboard");
      router.replace("/dashboard");
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Registration failed",
      );
    }
  }

  return (
    <AuthShell
      title="Join as staff"
      subtitle="Use the shop slug your owner gave you, then create your login."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>

        <div>
          <Label htmlFor="tenantSlug">Shop slug</Label>
          <Input
            id="tenantSlug"
            className="mt-1.5"
            autoComplete="organization"
            spellCheck={false}
            placeholder="demo-shop"
            {...register("tenantSlug")}
          />
          <FieldError message={errors.tenantSlug?.message} />
        </div>

        <div>
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            className="mt-1.5"
            autoComplete="name"
            {...register("fullName")}
          />
          <FieldError message={errors.fullName?.message} />
        </div>

        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            className="mt-1.5"
            autoComplete="email"
            spellCheck={false}
            {...register("email")}
          />
          <FieldError message={errors.email?.message} />
        </div>

        <div>
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input
            id="phone"
            type="tel"
            className="mt-1.5"
            autoComplete="tel"
            {...register("phone")}
          />
          <FieldError message={errors.phone?.message} />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <button
              type="button"
              className="text-xs font-medium text-[#0b1f33] hover:underline"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            className="mt-1.5"
            autoComplete="new-password"
            {...register("password")}
          />
          <FieldError message={errors.password?.message} />
          <ul className="mt-2 grid grid-cols-2 gap-1 text-[0.7rem] text-[#6b7280]">
            {(
              [
                ["length", "8–72 characters"],
                ["upper", "Uppercase"],
                ["lower", "Lowercase"],
                ["number", "Number"],
                ["special", "Special char"],
                ["noEmailPart", "Not in email name"],
                ["noSlug", "Not in shop slug"],
              ] as const
            ).map(([key, label]) => (
              <li
                key={key}
                className={
                  strength.checks[key] ? "text-[#0b1f33]" : "text-[#9ca3af]"
                }
              >
                {strength.checks[key] ? "✓" : "○"} {label}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            className="mt-1.5"
            autoComplete="new-password"
            {...register("confirmPassword")}
          />
          <FieldError message={errors.confirmPassword?.message} />
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Creating…" : "Register & sign in"}
        </Button>
        <p className="text-center text-sm text-[#6b7280]">
          Already registered?{" "}
          <Link
            href="/login"
            className="font-semibold text-[#0b1f33] hover:underline"
          >
            Sign in
          </Link>
          {" · "}
          Opening a new shop?{" "}
          <Link
            href="/register"
            className="font-semibold text-[#0b1f33] hover:underline"
          >
            Create shop
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
