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
  AuthDivider,
  AuthGoogleButton,
} from "@/components/auth-google-button";
import {
  passwordStrength,
  registerTenantSchema,
  type RegisterTenantInput,
} from "@/lib/validations";
import { authApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";

export default function RegisterPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<RegisterTenantInput>({
    resolver: zodResolver(registerTenantSchema),
    defaultValues: {
      tenantName: "",
      adminFullName: "",
      adminEmail: "",
      adminPassword: "",
      confirmPassword: "",
      adminPhone: "",
    },
  });

  const password = useWatch({ control, name: "adminPassword" }) ?? "";
  const email = useWatch({ control, name: "adminEmail" }) ?? "";
  const strength = passwordStrength(password, { email });
  const strengthPct = Math.round((strength.score / 7) * 100);

  async function onSubmit(values: RegisterTenantInput) {
    const shopName = values.tenantName.trim();
    try {
      const data = await authApi.registerTenant({
        tenantName: shopName,
        adminFullName: values.adminFullName.trim(),
        adminEmail: values.adminEmail.trim().toLowerCase(),
        adminPassword: values.adminPassword,
        ...(values.adminPhone?.trim()
          ? { adminPhone: values.adminPhone.trim() }
          : {}),
      });
      setSession({
        accessToken: data.accessToken,
        stationToken: data.stationToken ?? data.accessToken,
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
      toast.success("Shop created — opening your dashboard");
      router.replace("/dashboard");
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Registration failed",
      );
    }
  }

  async function onGoogle(idToken: string) {
    const shopName = getValues("tenantName")?.trim() ?? "";
    if (!shopName || shopName.length < 2) {
      toast.error("Enter your shop name first, then continue with Google.");
      return;
    }
    try {
      const data = await authApi.googleAuth({
        idToken,
        mode: "register",
        tenantName: shopName,
      });
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
        },
        tenantSlug: data.tenant?.slug ?? "",
      });
      toast.success("Shop created — opening your dashboard");
      router.replace("/dashboard");
    } catch (e) {
      toast.error(
        e instanceof ApiError
          ? e.messages.join(", ")
          : "Google sign-up failed",
      );
    }
  }

  return (
    <AuthShell
      title="Join Universal POS"
      subtitle="Create your shop in a minute — then sell from a clean counter."
    >
      <div className="mb-4 space-y-1.5">
        <Label htmlFor="tenantName">Shop name</Label>
        <Input
          id="tenantName"
          placeholder="e.g. City Furniture"
          autoComplete="organization"
          {...register("tenantName")}
        />
        <FieldError message={errors.tenantName?.message} />
      </div>

      <AuthGoogleButton
        mode="register"
        onCredential={onGoogle}
        disabled={isSubmitting}
      />
      <AuthDivider label="or continue with email" />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>

        <div className="space-y-1.5">
          <Label htmlFor="adminFullName">Your name</Label>
          <Input
            id="adminFullName"
            autoComplete="name"
            placeholder="Full name"
            {...register("adminFullName")}
          />
          <FieldError message={errors.adminFullName?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="adminEmail">Email</Label>
          <Input
            id="adminEmail"
            type="email"
            autoComplete="email"
            placeholder="you@shop.com"
            {...register("adminEmail")}
          />
          <FieldError message={errors.adminEmail?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="adminPhone">
            Phone <span className="font-normal text-[#8b9bb0]">(optional)</span>
          </Label>
          <Input
            id="adminPhone"
            type="tel"
            autoComplete="tel"
            placeholder="+91 …"
            {...register("adminPhone")}
          />
          <FieldError message={errors.adminPhone?.message} />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="adminPassword">Password</Label>
            <button
              type="button"
              className="text-[0.75rem] font-medium text-[#1a56db] hover:underline"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <Input
            id="adminPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            {...register("adminPassword")}
          />
          <FieldError message={errors.adminPassword?.message} />
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eef1f4]">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                strengthPct >= 100
                  ? "bg-[#166534]"
                  : strengthPct >= 60
                    ? "bg-[#1a56db]"
                    : "bg-[#b45309]",
              )}
              style={{ width: `${strengthPct}%` }}
            />
          </div>
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

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Creating shop…" : "Create shop & sign in"}
        </Button>

        <p className="pt-1 text-center text-[0.8125rem] text-[#5a6b7d]">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-[#1a56db] underline-offset-2 hover:underline"
          >
            Login here
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
