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
import { ApiTargetSwitch } from "@/components/api-target-switch";
import {
  passwordStrength,
  registerTenantSchema,
  type RegisterTenantInput,
} from "@/lib/validations";
import { authApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";

function SectionLabel({
  step,
  label,
}: {
  step: string;
  label: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="grid h-6 w-6 place-items-center rounded-md bg-[#e8eefb] text-[0.7rem] font-bold text-[#1a56db]">
        {step}
      </span>
      <p className="text-[0.8125rem] font-semibold text-[#0b1f33]">{label}</p>
    </div>
  );
}

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
  const email = useWatch({ control, name: "adminEmail" }) ?? "";
  const slug = useWatch({ control, name: "tenantSlug" }) ?? "";
  const strength = passwordStrength(password, { email, slug });
  const strengthPct = Math.round((strength.score / 7) * 100);

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
      toast.success("Shop created — opening your dashboard");
      router.replace("/dashboard");
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Registration failed",
      );
    }
  }

  return (
    <AuthShell
      layout="stacked"
      title="Create your shop"
      subtitle="Set up your counter in a minute — products, checkout, and sales in one place."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-7" noValidate>
        <section>
          <SectionLabel step="1" label="Shop details" />
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="tenantName">Shop name</Label>
              <Input
                id="tenantName"
                placeholder="e.g. City Grocery"
                autoComplete="organization"
                {...register("tenantName")}
              />
              <FieldError message={errors.tenantName?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tenantSlug">Shop slug</Label>
              <div className="flex overflow-hidden rounded-[10px] border border-[#cfd8e6] bg-white shadow-[inset_0_1px_2px_rgba(11,31,51,0.04)] focus-within:border-[#1a56db] focus-within:shadow-[0_0_0_3px_rgba(26,86,219,0.12)]">
                <span className="grid shrink-0 place-items-center bg-[#f7f9fc] px-3 text-[0.75rem] font-medium text-[#8b9bb0]">
                  /
                </span>
                <Input
                  id="tenantSlug"
                  className="h-11 rounded-none border-0 shadow-none hover:border-0 focus:border-0 focus:shadow-none"
                  placeholder="city-grocery"
                  spellCheck={false}
                  autoComplete="off"
                  {...register("tenantSlug")}
                />
              </div>
              <p className="text-[0.7rem] text-[#8b9bb0]">
                Used every time you sign in. Letters, numbers, hyphens.
              </p>
              <FieldError message={errors.tenantSlug?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="storeName">First store name</Label>
              <Input
                id="storeName"
                placeholder="Main Store"
                {...register("storeName")}
              />
              <FieldError message={errors.storeName?.message} />
            </div>
          </div>
        </section>

        <div className="h-px bg-[#eef1f4]" />

        <section>
          <SectionLabel step="2" label="Owner account" />
          <div className="space-y-3.5">
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
                Phone{" "}
                <span className="font-normal text-[#8b9bb0]">(optional)</span>
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
          </div>
        </section>

        <div className="h-px bg-[#eef1f4]" />

        <section>
          <SectionLabel step="3" label="Password" />
          <div className="space-y-3.5">
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

              <div className="mt-2.5 space-y-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-[#eef1f4]">
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
                <ul className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["length", "8+ chars"],
                      ["upper", "A–Z"],
                      ["lower", "a–z"],
                      ["number", "0–9"],
                      ["special", "Symbol"],
                      ["noEmailPart", "Not email"],
                      ["noSlug", "Not slug"],
                    ] as const
                  ).map(([key, label]) => {
                    const ok = strength.checks[key];
                    return (
                      <li
                        key={key}
                        className={cn(
                          "rounded-md px-2 py-0.5 text-[0.65rem] font-medium",
                          ok
                            ? "bg-[#e8eefb] text-[#1341a8]"
                            : "bg-[#f4f6fa] text-[#8b9bb0]",
                        )}
                      >
                        {ok ? "✓ " : ""}
                        {label}
                      </li>
                    );
                  })}
                </ul>
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
          </div>
        </section>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Creating shop…" : "Create shop & sign in"}
        </Button>

        <p className="text-center text-[0.8125rem] text-[#5a6b7d]">
          Already have a shop?{" "}
          <Link
            href="/login"
            className="font-semibold text-[#1a56db] hover:underline"
          >
            Sign in
          </Link>
          {" · "}
          Joining a team?{" "}
          <Link
            href="/register-user"
            className="font-semibold text-[#1a56db] hover:underline"
          >
            Register as staff
          </Link>
        </p>

        <ApiTargetSwitch />
      </form>
    </AuthShell>
  );
}
