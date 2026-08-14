"use client";

/**
 * Multi-store / branches — Location CRUD (branch ≡ location).
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Plus, Pencil } from "lucide-react";
import { tenantsApi, usersApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { canManageStaff } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { useBranchStore } from "@/lib/branch-store";

type LocForm = {
  name: string;
  code: string;
  type: string;
  address: string;
  phone: string;
  email: string;
  businessHours: string;
  timezone: string;
  currencyCode: string;
  managerUserId: string;
  isActive: boolean;
};

const emptyForm = (): LocForm => ({
  name: "",
  code: "",
  type: "store",
  address: "",
  phone: "",
  email: "",
  businessHours: "",
  timezone: "Asia/Kolkata",
  currencyCode: "INR",
  managerUserId: "",
  isActive: true,
});

export default function StoresPage() {
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.user?.roles);
  const canEdit = canManageStaff(roles);
  const setCurrent = useBranchStore((s) => s.setCurrentLocationId);
  const currentId = useBranchStore((s) => s.currentLocationId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<LocForm>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof LocForm, string>>>(
    {},
  );

  const list = useQuery({
    queryKey: ["stores-branches"],
    queryFn: () => tenantsApi.listLocations(),
  });

  const staff = useQuery({
    queryKey: ["stores-staff"],
    queryFn: () => usersApi.list(),
    enabled: canEdit,
  });

  const managers = useMemo(
    () =>
      (staff.data ?? []).filter((u) =>
        (u.roles ?? []).some((r) => r === "admin" || r === "manager"),
      ),
    [staff.data],
  );

  const save = useMutation({
    mutationFn: async () => {
      const nextErr: typeof errors = {};
      if (form.name.trim().length < 2) nextErr.name = "Name is required";
      if (!editingId && form.code.trim().length < 1)
        nextErr.code = "Store code is required";
      setErrors(nextErr);
      if (Object.keys(nextErr).length) throw new Error("validation");

      const body = {
        name: form.name.trim(),
        type: form.type,
        address: form.address.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        businessHours: form.businessHours.trim() || undefined,
        timezone: form.timezone.trim() || undefined,
        currencyCode: form.currencyCode.trim() || undefined,
        managerUserId: form.managerUserId || undefined,
        ...(editingId
          ? { isActive: form.isActive }
          : { code: form.code.trim().toUpperCase() }),
      };

      if (editingId) {
        return tenantsApi.updateLocation(editingId, body);
      }
      return tenantsApi.createLocation(body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stores-branches"] });
      void qc.invalidateQueries({ queryKey: ["branch-selector-locations"] });
      void qc.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success(editingId ? "Branch updated" : "Branch created");
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
    },
    onError: (e: Error) => {
      if (e.message === "validation") return;
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    },
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setErrors({});
    setShowForm(true);
  }

  function openEdit(row: {
    id: string;
    name: string;
    code?: string | null;
    type?: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    businessHours?: string | null;
    timezone?: string | null;
    currencyCode?: string | null;
    managerUserId?: string | null;
    isActive?: boolean;
  }) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      code: row.code ?? "",
      type: row.type ?? "store",
      address: row.address ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      businessHours: row.businessHours ?? "",
      timezone: row.timezone ?? "Asia/Kolkata",
      currencyCode: row.currencyCode ?? "INR",
      managerUserId: row.managerUserId ?? "",
      isActive: row.isActive !== false,
    });
    setErrors({});
    setShowForm(true);
  }

  const rows = list.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.7rem] font-semibold tracking-[0.12em] text-[#8a9bb0] uppercase">
            Multi-store
          </p>
          <h1 className="text-xl font-semibold text-[#0b1f33]">
            Stores / Branches
          </h1>
          <p className="mt-0.5 text-sm text-[#5a6b7d]">
            One catalog for the business. Stock, pricing, and sales stay
            branch-wise.
          </p>
        </div>
        {canEdit ? (
          <Button type="button" onClick={openCreate}>
            <Plus className="mr-1 size-4" />
            Add branch
          </Button>
        ) : null}
      </div>

      {showForm ? (
        <div className="rounded-xl border border-[#d9e0ea] bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-[#0b1f33]">
            {editingId ? "Edit branch" : "New branch"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Indore Branch"
              />
              <FieldError message={errors.name} />
            </div>
            <div className="space-y-1">
              <Label>Store code</Label>
              <Input
                value={form.code}
                disabled={Boolean(editingId)}
                onChange={(e) =>
                  setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
                }
                placeholder="IND01"
              />
              <FieldError message={errors.code} />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <select
                className="h-9 w-full rounded-md border border-[#d9e0ea] bg-white px-2 text-sm"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="store">Store</option>
                <option value="branch">Branch</option>
                <option value="warehouse">Warehouse</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Manager</Label>
              <select
                className="h-9 w-full rounded-md border border-[#d9e0ea] bg-white px-2 text-sm"
                value={form.managerUserId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, managerUserId: e.target.value }))
                }
              >
                <option value="">— None —</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName} ({m.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Address</Label>
              <Input
                value={form.address}
                onChange={(e) =>
                  setForm((f) => ({ ...f, address: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Business hours</Label>
              <Input
                value={form.businessHours}
                placeholder="Mon–Sat 10:00–21:00"
                onChange={(e) =>
                  setForm((f) => ({ ...f, businessHours: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Timezone</Label>
              <Input
                value={form.timezone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, timezone: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Currency</Label>
              <Input
                value={form.currencyCode}
                maxLength={3}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    currencyCode: e.target.value.toUpperCase(),
                  }))
                }
              />
            </div>
            {editingId ? (
              <div className="flex items-center gap-2 pt-6">
                <input
                  id="branch-active"
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, isActive: e.target.checked }))
                  }
                />
                <Label htmlFor="branch-active">Active</Label>
              </div>
            ) : null}
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-[#d9e0ea] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#e8eef5] bg-[#f8fafc] text-[0.7rem] tracking-wide text-[#8a9bb0] uppercase">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Branch</th>
              <th className="px-3 py-2.5 font-semibold">Code</th>
              <th className="px-3 py-2.5 font-semibold">Type</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-10 text-center text-[#8a9bb0]"
                >
                  <Building2 className="mx-auto mb-2 size-8 opacity-40" />
                  No branches yet
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className={cn(
                    "border-b border-[#eef2f8]",
                    currentId === r.id && "bg-[#eff6ff]",
                  )}
                >
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-[#0b1f33]">{r.name}</div>
                    {r.address ? (
                      <div className="text-[0.75rem] text-[#8a9bb0]">
                        {r.address}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[0.8rem]">
                    {r.code}
                  </td>
                  <td className="px-3 py-2.5 capitalize">{r.type ?? "store"}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[0.7rem] font-semibold",
                        r.isActive !== false
                          ? "bg-[#dcfce7] text-[#15803d]"
                          : "bg-[#f3f4f6] text-[#6b7280]",
                      )}
                    >
                      {r.isActive !== false ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setCurrent(r.id);
                          toast.success(`Working in ${r.name}`);
                        }}
                      >
                        Use
                      </Button>
                      {canEdit ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(r)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
