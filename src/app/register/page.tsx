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
  registerTenantSchema,
  type RegisterTenantInput,
} from "@/lib/validations";
import { authApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";

export default function RegisterPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterTenantInput>({
    resolver: zodResolver(registerTenantSchema),
    defaultValues: {
      tenantName: "",
      tenantSlug: "",
      storeName: "Main Store",
      adminFullName: "",
      adminEmail: "",
      adminPassword: "",
      confirmPassword: "",
      adminPhone: "",
    },
  });

  const password = useWatch({ control, name: "adminPassword" }) ?? "";
  const strength = passwordStrength(password);

  async function onSubmit(values: RegisterTenantInput) {
    const { confirmPassword: _c, ...rest } = values;
    try {
      const data = await authApi.registerTenant({
        ...rest,
        tenantSlug: rest.tenantSlug.trim().toLowerCase(),
        adminEmail: rest.adminEmail.trim().toLowerCase(),
        adminPhone: rest.adminPhone || undefined,
      });
      setSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: {
          id: data.user.id,
          email: data.user.email,
          fullName: data.user.fullName,
          roles: data.user.roles ?? ["admin"],
          storeId: data.store?.id,
          tenantId: data.user.tenantId ?? data.tenant.id,
        },
        tenantSlug: data.tenant.slug,
      });
      toast.success("Shop created");
      router.replace("/dashboard");
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Registration failed",
      );
    }
  }

  return (
    <AuthShell
      title="Register your shop"
      subtitle="Creates an isolated tenant, main store, and admin account with strong password rules."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <p className="eyebrow text-[#0f766e]">New tenant</p>
          <h2 className="display mt-2 text-2xl text-[#111827]">
            Create shop access
          </h2>
          <p className="mt-1 text-sm text-[#6b7280]">
            Strong passwords and unique slugs keep shops isolated
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["tenantName", "Shop name", "text"],
              ["tenantSlug", "Slug", "text"],
              ["storeName", "Store name", "text"],
              ["adminFullName", "Admin name", "text"],
              ["adminEmail", "Admin email", "email"],
              ["adminPhone", "Admin phone", "tel"],
            ] as const
          ).map(([name, label, type]) => (
            <div key={name}>
              <Label htmlFor={name}>{label}</Label>
              <Input
                id={name}
                type={type}
                className="mt-1.5"
                autoComplete={
                  name === "adminEmail"
                    ? "email"
                    : name === "adminPhone"
                      ? "tel"
                      : "off"
                }
                spellCheck={false}
                {...register(name)}
              />
              <FieldError
                message={errors[name]?.message as string | undefined}
              />
            </div>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="adminPassword">Admin password</Label>
            <button
              type="button"
              className="text-xs font-medium text-[#0f766e] hover:underline"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <Input
            id="adminPassword"
            type={showPassword ? "text" : "password"}
            className="mt-1.5"
            autoComplete="new-password"
            {...register("adminPassword")}
          />
          <FieldError message={errors.adminPassword?.message} />
          <ul className="mt-2 grid grid-cols-2 gap-1 text-[0.7rem] text-[#6b7280]">
            {(
              [
                ["length", "8–72 characters"],
                ["upper", "Uppercase"],
                ["lower", "Lowercase"],
                ["number", "Number"],
                ["special", "Special char"],
              ] as const
            ).map(([key, label]) => (
              <li
                key={key}
                className={
                  strength.checks[key] ? "text-[#0f766e]" : "text-[#9ca3af]"
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
          {isSubmitting ? "Creating…" : "Create shop"}
        </Button>
        <p className="text-center text-sm text-[#6b7280]">
          Already registered?{" "}
          <Link
            href="/login"
            className="font-semibold text-[#0f766e] hover:underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
