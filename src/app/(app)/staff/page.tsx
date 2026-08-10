"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { tenantsApi, usersApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/lib/auth-store";
import { passwordStrength } from "@/lib/validations";
import { PageHeader } from "@/components/page-header";
import { SetPinDialog } from "@/components/set-pin-dialog";

type Form = {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  roleCode: string;
  primaryStoreId: string;
};

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
      hint: "Counter charge, customers, enroll/bill — no staff/settings/plan",
    },
    {
      value: "fitter",
      label: "Fitter",
      hint: "Appointments, customers, view orders — no counter charge",
    },
    {
      value: "inventory",
      label: "Inventory",
      hint: "Products, stock, suppliers — no charge/settings",
    },
    {
      value: "manager",
      label: "Manager",
      hint: "Day ops, reports, returns, staff (not plan / not grant admin)",
    },
    ...(isOwner
      ? [
          {
            value: "admin",
            label: "Admin (owner)",
            hint: "Full shop control — only you can grant this",
          },
        ]
      : []),
  ];

  const list = useQuery({ queryKey: ["users"], queryFn: () => usersApi.list() });
  const stores = useQuery({
    queryKey: ["stores"],
    queryFn: () => tenantsApi.listStores(),
  });

  const form = useForm<Form>({
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

  const create = useMutation({
    mutationFn: (v: Form) =>
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

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Staff accounts"
        subtitle="Manage staff accounts and roles. Invite with email and password, and set a counter PIN for shared terminals."
      />

      <SetPinDialog
        open={Boolean(pinTarget)}
        title={
          pinTarget?.id
            ? `Set PIN · ${pinTarget.name}`
            : "Change my PIN"
        }
        userId={pinTarget?.id}
        onClose={() => setPinTarget(null)}
        onSaved={() => void qc.invalidateQueries({ queryKey: ["users"] })}
      />

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.9fr]">
        <section className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
          <div className="flex items-center justify-between border-b border-[#f3f4f6] px-4 py-3">
            <p className="text-sm text-[#6b7280]">Team</p>
            {me ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  setPinTarget({ name: me.fullName })
                }
              >
                Change my PIN
              </Button>
            ) : null}
          </div>
          <ul className="divide-y divide-[#f3f4f6]">
            {(list.data ?? []).map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[#111827]">{u.fullName}</p>
                  <p className="text-sm text-[#6b7280]">{u.email}</p>
                  <p className="mt-0.5 text-xs text-[#9ca3af]">
                    {(u.roles ?? []).join(", ") || "no role"}
                    {u.isActive ? "" : " · inactive"}
                    {u.pinSet ? " · PIN set" : " · no PIN"}
                  </p>
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
        </section>

        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <h2 className="display text-xl">Add staff</h2>
          {!canManage ? (
            <p className="mt-2 text-sm text-[#6b7280]">
              Only admin/manager can invite staff.
            </p>
          ) : (
            <form
              className="mt-4 space-y-3"
              onSubmit={form.handleSubmit((v) => create.mutate(v))}
            >
              <div>
                <Label>Full name</Label>
                <Input className="mt-1.5" {...form.register("fullName", { required: true })} />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  className="mt-1.5"
                  type="email"
                  {...form.register("email", { required: true })}
                />
              </div>
              <div>
                <Label>Password</Label>
                <Input
                  className="mt-1.5"
                  type="password"
                  {...form.register("password", {
                    required: true,
                    minLength: 8,
                    validate: (v) =>
                      passwordStrength(v).ok ||
                      "Need 8–72 chars with upper, lower, number, special",
                  })}
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
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  className="mt-1.5"
                  placeholder="+91… or any country"
                  {...form.register("phone")}
                />
              </div>
              <div>
                <Label>Role</Label>
                <select className="mt-1.5 select-field" {...form.register("roleCode")}>
                  {roleOptions.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[0.7rem] text-[#6b7280]">
                  {roleOptions.find((r) => r.value === form.watch("roleCode"))
                    ?.hint ?? ""}
                </p>
              </div>
              <div>
                <Label>Store</Label>
                <select
                  className="mt-1.5 select-field"
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
              <Button type="submit" className="w-full" disabled={create.isPending}>
                {create.isPending ? "Saving…" : "Create"}
              </Button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
