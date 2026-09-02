"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import { usersApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { filterPersonNameInput, filterMobileDigits } from "@/lib/input-guards";
import { personNameSchema, optionalPhoneSchema } from "@/lib/validations";
import { z } from "zod";

const editStaffSchema = z.object({
  fullName: personNameSchema,
  phone: optionalPhoneSchema,
  roleCode: z.string().min(1, "Select a role"),
  primaryStoreId: z.string().optional().or(z.literal("")),
});
type EditStaffInput = z.infer<typeof editStaffSchema>;

type StoreOption = { id: string; name: string };
type RoleOption = { value: string; label: string; hint?: string };

type EditStaffDialogProps = {
  open: boolean;
  user: {
    id: string;
    email: string;
    fullName: string;
    phone?: string | null;
    primaryStoreId?: string | null;
    roles: string[];
  } | null;
  roleOptions: RoleOption[];
  stores: StoreOption[];
  onClose: () => void;
  onSaved: () => void;
};

export function EditStaffDialog({
  open,
  user,
  roleOptions,
  stores,
  onClose,
  onSaved,
}: EditStaffDialogProps) {
  const form = useForm<EditStaffInput>({
    resolver: zodResolver(editStaffSchema),
    mode: "onBlur",
    defaultValues: {
      fullName: "",
      phone: "",
      roleCode: "cashier",
      primaryStoreId: "",
    },
  });
  const { errors } = form.formState;

  useEffect(() => {
    if (!open || !user) return;
    form.reset({
      fullName: user.fullName,
      phone: user.phone ?? "",
      roleCode: user.roles[0] ?? "cashier",
      primaryStoreId: user.primaryStoreId ?? "",
    });
  }, [open, user, form]);

  const save = useMutation({
    mutationFn: async (v: EditStaffInput) => {
      if (!user) return;
      await usersApi.update(user.id, {
        fullName: v.fullName,
        phone: v.phone || undefined,
        primaryStoreId: v.primaryStoreId || undefined,
        roleCode: v.roleCode,
      });
    },
    onSuccess: () => {
      toast.success("Staff updated");
      onSaved();
      onClose();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  if (!open || !user) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 backdrop-blur-[2px]">
      <button
        type="button"
        className="absolute inset-0 bg-[#0b1f33]/65"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[#d9e0ea] bg-white shadow-[0_24px_64px_rgba(11,31,51,0.28)]">
        <div className="flex items-center justify-between border-b border-[#e8eef5] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[#0b1f33]">Edit staff</h2>
            <p className="text-xs text-[#5a6b7d]">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5a6b7d] hover:bg-[#eef3fb]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          className="space-y-3 p-5"
          onSubmit={form.handleSubmit((v) => save.mutate(v))}
          noValidate
        >
          <div>
            <Label>Full name</Label>
            <Input
              className="mt-1.5"
              value={form.watch("fullName")}
              onChange={(e) =>
                form.setValue(
                  "fullName",
                  filterPersonNameInput(e.target.value),
                  { shouldValidate: true },
                )
              }
            />
            <FieldError message={errors.fullName?.message} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              className="mt-1.5"
              inputMode="numeric"
              value={form.watch("phone")}
              onChange={(e) =>
                form.setValue("phone", filterMobileDigits(e.target.value), {
                  shouldValidate: true,
                })
              }
            />
            <FieldError message={errors.phone?.message} />
          </div>
          <div>
            <Label>Role</Label>
            <Select
              className="mt-1.5 select-field w-full"
              {...form.register("roleCode")}
            >
              {roleOptions.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
            <FieldError message={errors.roleCode?.message} />
          </div>
          <div>
            <Label>Location / store</Label>
            <Select
              className="mt-1.5 select-field w-full"
              {...form.register("primaryStoreId")}
            >
              <option value="">Optional</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
