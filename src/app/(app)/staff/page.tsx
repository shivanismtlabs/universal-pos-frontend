"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Users,
  Shield,
  Clock,
  CalendarDays,
  Fingerprint,
  KeyRound,
} from "lucide-react";
import { tenantsApi, usersApi, iamApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/form";
import { useAuthStore } from "@/lib/auth-store";
import {
  inviteStaffSchema,
  passwordStrength,
  type InviteStaffInput,
} from "@/lib/validations";
import { PageHeader } from "@/components/page-header";
import { SetPinDialog } from "@/components/set-pin-dialog";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Store Manager",
  cashier: "Cashier",
  inventory: "Inventory Manager",
  accountant: "Accountant",
  fitter: "Fitter",
  staff: "Staff",
};

function roleLabel(code: string) {
  return ROLE_LABELS[code] ?? code;
}

export default function StaffPage() {
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const me = useAuthStore((s) => s.user);
  const canManage = roles.some((r) => ["admin", "manager"].includes(r));
  const isOwner = roles.includes("admin");
  const [pinTarget, setPinTarget] = useState<{
    id?: string;
    name: string;
  } | null>(null);

  const roleOptions = [
    {
      value: "cashier",
      label: "Cashier",
      hint: "Counter, customers, returns — no staff/settings",
    },
    {
      value: "inventory",
      label: "Inventory Manager",
      hint: "Items, stock, suppliers, transfers",
    },
    {
      value: "accountant",
      label: "Accountant",
      hint: "Reports, expenses, order view",
    },
    {
      value: "fitter",
      label: "Fitter",
      hint: "Appointments and customers (service/rental)",
    },
    {
      value: "manager",
      label: "Store Manager",
      hint: "Full day ops, staff, reports (not plan)",
    },
    ...(isOwner
      ? [
          {
            value: "admin",
            label: "Admin",
            hint: "Owner — full shop including plan",
          },
        ]
      : []),
  ];

  const customRoles = useQuery({
    queryKey: ["iam-roles"],
    queryFn: () => iamApi.listRoles(),
    enabled: canManage,
  });

  const allRoleOptions = [
    ...roleOptions,
    ...(customRoles.data ?? [])
      .filter((r) => !r.isSystem)
      .map((r) => ({
        value: r.code,
        label: r.name,
        hint: "Custom role (permission matrix)",
      })),
  ];

  const list = useQuery({ queryKey: ["users"], queryFn: () => usersApi.list() });
  const stores = useQuery({
    queryKey: ["stores"],
    queryFn: () => tenantsApi.listStores(),
  });
  const attendanceOpen = useQuery({
    queryKey: ["attendance-open"],
    queryFn: () => iamApi.openAttendance(),
  });

  const form = useForm<InviteStaffInput>({
    resolver: zodResolver(inviteStaffSchema),
    criteriaMode: "all",
    mode: "onBlur",
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      phone: "",
      roleCode: "cashier",
      primaryStoreId: "",
    },
  });
  const watchPassword = form.watch("password") ?? "";
  const strength = passwordStrength(watchPassword);
  const { errors } = form.formState;

  const create = useMutation({
    mutationFn: (v: InviteStaffInput) =>
      usersApi.create({
        fullName: v.fullName,
        email: v.email,
        password: v.password,
        phone: v.phone || undefined,
        roleCode: v.roleCode,
        primaryStoreId: v.primaryStoreId || undefined,
      }),
    onSuccess: () => {
      toast.success("Staff created");
      form.reset({
        fullName: "",
        email: "",
        password: "",
        phone: "",
        roleCode: "cashier",
        primaryStoreId: "",
      });
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      usersApi.update(id, { isActive }),
    onSuccess: () => {
      toast.success("Updated");
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const team = list.data ?? [];
  const roleCounts = team.reduce<Record<string, number>>((acc, u) => {
    for (const r of u.roles ?? []) {
      acc[r] = (acc[r] ?? 0) + 1;
    }
    return acc;
  }, {});

  const hubLinks = [
    {
      href: "/roles",
      title: "Roles & permissions",
      desc: "System + custom roles matrix",
      icon: Shield,
      show: canManage,
    },
    {
      href: "/attendance",
      title: "Attendance",
      desc: attendanceOpen.data
        ? "You are clocked in"
        : "Clock in / out & team log",
      icon: Clock,
      show: true,
    },
    {
      href: "/shifts",
      title: "Shift management",
      desc: "Templates and roster",
      icon: CalendarDays,
      show: canManage,
    },
    {
      href: "/settings",
      title: "PIN & biometrics",
      desc: "Counter PIN switch · register device biometrics",
      icon: Fingerprint,
      show: true,
    },
  ].filter((x) => x.show);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="User & role management"
        subtitle="Admin, Store Manager, Cashier, Inventory Manager, Accountant · custom roles · attendance · shifts · PIN · biometrics"
      />

      {/* Role coverage strip */}
      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {(
          [
            ["admin", "Admin"],
            ["manager", "Store Manager"],
            ["cashier", "Cashier"],
            ["inventory", "Inventory Mgr"],
            ["accountant", "Accountant"],
          ] as const
        ).map(([code, label]) => (
          <div
            key={code}
            className="rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5"
          >
            <p className="text-[0.65rem] font-semibold tracking-wide text-[#6b7280] uppercase">
              {label}
            </p>
            <p className="mt-0.5 text-lg font-semibold text-[#111827]">
              {roleCounts[code] ?? 0}
            </p>
          </div>
        ))}
      </section>

      {/* Hub links */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {hubLinks.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex gap-3 rounded-xl border border-[#e5e7eb] bg-white p-4 transition hover:border-[#1a56db]/35 hover:shadow-sm"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#eef2ff] text-[#1a56db]">
                <Icon className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#111827]">
                  {item.title}
                </p>
                <p className="mt-0.5 text-xs text-[#6b7280]">{item.desc}</p>
              </div>
            </Link>
          );
        })}
      </section>

      <SetPinDialog
        open={Boolean(pinTarget)}
        title={
          pinTarget?.id ? `Set PIN · ${pinTarget.name}` : "Change my PIN"
        }
        userId={pinTarget?.id}
        onClose={() => setPinTarget(null)}
        onSaved={() => void qc.invalidateQueries({ queryKey: ["users"] })}
      />

      <div className="grid gap-5 lg:grid-cols-[1.25fr_0.95fr]">
        <section className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f3f4f6] px-4 py-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[#1a56db]" />
              <p className="text-sm font-medium text-[#374151]">
                Team ({team.length})
              </p>
            </div>
            {me ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setPinTarget({ name: me.fullName })}
              >
                <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                My PIN
              </Button>
            ) : null}
          </div>
          <ul className="divide-y divide-[#f3f4f6]">
            {team.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[#111827]">{u.fullName}</p>
                  <p className="text-sm text-[#6b7280]">{u.email}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {(u.roles ?? []).map((r) => (
                      <span
                        key={r}
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[0.65rem] font-medium",
                          r === "admin"
                            ? "bg-[#1a56db]/10 text-[#1a56db]"
                            : "bg-[#f3f4f6] text-[#4b5563]",
                        )}
                      >
                        {roleLabel(r)}
                      </span>
                    ))}
                    {!u.roles?.length ? (
                      <span className="text-xs text-[#9ca3af]">no role</span>
                    ) : null}
                    <span className="text-[0.65rem] text-[#9ca3af]">
                      {u.isActive ? "" : "· inactive "}
                      {u.pinSet ? "· PIN set" : "· no PIN"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canManage && u.isActive ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setPinTarget({ id: u.id, name: u.fullName })
                      }
                    >
                      Set PIN
                    </Button>
                  ) : null}
                  {canManage ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={toggle.isPending}
                      onClick={() =>
                        toggle.mutate({ id: u.id, isActive: !u.isActive })
                      }
                    >
                      {u.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {list.isLoading ? (
            <p className="px-4 py-8 text-sm text-[#6b7280]">Loading…</p>
          ) : null}
          {!list.isLoading && !team.length ? (
            <p className="px-4 py-8 text-sm text-[#6b7280]">No staff yet</p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <h2 className="text-lg font-semibold text-[#111827]">Add staff</h2>
          <p className="mt-1 text-xs text-[#6b7280]">
            Choose a system role or a custom role from Roles & permissions.
          </p>
          {!canManage ? (
            <p className="mt-3 text-sm text-[#6b7280]">
              Only Admin / Store Manager can invite staff.
            </p>
          ) : (
            <form
              className="mt-4 space-y-3"
              onSubmit={form.handleSubmit((v) => create.mutate(v))}
              noValidate
            >
              <div>
                <Label>Full name</Label>
                <Input className="mt-1.5" {...form.register("fullName")} />
                <FieldError message={errors.fullName?.message} />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  className="mt-1.5"
                  type="email"
                  {...form.register("email")}
                />
                <FieldError message={errors.email?.message} />
              </div>
              <div>
                <Label>Password</Label>
                <Input
                  className="mt-1.5"
                  type="password"
                  {...form.register("password")}
                />
                <ul className="mt-1.5 grid grid-cols-2 gap-0.5 text-[0.65rem] text-[#6b7280]">
                  {(
                    [
                      ["length", "8–72 chars"],
                      ["upper", "Uppercase"],
                      ["lower", "Lowercase"],
                      ["number", "Number"],
                      ["special", "Special"],
                    ] as const
                  ).map(([k, label]) => (
                    <li
                      key={k}
                      className={
                        strength.checks[k] ? "text-[#0b1f33]" : "text-[#9ca3af]"
                      }
                    >
                      {strength.checks[k] ? "✓" : "○"} {label}
                    </li>
                  ))}
                </ul>
                <FieldError message={errors.password?.message} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  className="mt-1.5"
                  placeholder="+91… or any country"
                  {...form.register("phone")}
                />
                <FieldError message={errors.phone?.message} />
              </div>
              <div>
                <Label>Role</Label>
                <select
                  className="mt-1.5 select-field w-full"
                  {...form.register("roleCode")}
                >
                  {allRoleOptions.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <FieldError message={errors.roleCode?.message} />
                <p className="mt-1 text-[0.7rem] text-[#6b7280]">
                  {allRoleOptions.find(
                    (r) => r.value === form.watch("roleCode"),
                  )?.hint ?? ""}
                </p>
              </div>
              <div>
                <Label>Location / store</Label>
                <select
                  className="mt-1.5 select-field w-full"
                  {...form.register("primaryStoreId")}
                >
                  <option value="">Optional</option>
                  {(stores.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={create.isPending}
              >
                {create.isPending ? "Saving…" : "Create staff"}
              </Button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
