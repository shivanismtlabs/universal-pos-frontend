"use client";

/**
 * Locations / branches — Organization → Location hierarchy (Zoho-style).
 */
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Plus, Pencil, X } from "lucide-react";
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
  parentLocationId: string;
  isActive: boolean;
};

type StoreRow = {
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
  parentLocationId?: string | null;
  isActive?: boolean;
};

function descendantIds(id: string, rows: StoreRow[]): string[] {
  const kids = rows.filter((r) => r.parentLocationId === id);
  return kids.flatMap((k) => [k.id, ...descendantIds(k.id, rows)]);
}

function flattenLocationTree(rows: StoreRow[]) {
  const ids = new Set(rows.map((r) => r.id));
  const byParent = new Map<string | null, StoreRow[]>();
  for (const r of rows) {
    const raw = r.parentLocationId || null;
    const key = raw && ids.has(raw) ? raw : null;
    const list = byParent.get(key) ?? [];
    list.push(r);
    byParent.set(key, list);
  }
  const out: Array<{ row: StoreRow; depth: number }> = [];
  const walk = (parentId: string | null, depth: number) => {
    const kids = [...(byParent.get(parentId) ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const k of kids) {
      out.push({ row: k, depth });
      walk(k.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

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
  parentLocationId: "",
  isActive: true,
});

export default function StoresPage() {
  const qc = useQueryClient();
  const pathname = usePathname();
  const inSettings = pathname.startsWith("/settings/locations");
  const roles = useAuthStore((s) => s.user?.roles);
  const canEdit = canManageStaff(roles);
  const setCurrent = useBranchStore((s) => s.setCurrentLocationId);
  const currentId = useBranchStore((s) => s.currentLocationId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [statusTab, setStatusTab] = useState<"all" | "active">("all");
  const [form, setForm] = useState<LocForm>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof LocForm, string>>>(
    {},
  );
  const [mgrOpen, setMgrOpen] = useState(false);
  const [mgrName, setMgrName] = useState("");
  const [mgrEmail, setMgrEmail] = useState("");
  const [mgrPassword, setMgrPassword] = useState("");
  const [mgrPhone, setMgrPhone] = useState("");

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

      if (editingId) {
        return tenantsApi.updateLocation(editingId, {
          name: form.name.trim(),
          type: form.type,
          address: form.address.trim() || undefined,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          businessHours: form.businessHours.trim() || undefined,
          timezone: form.timezone.trim() || undefined,
          currencyCode: form.currencyCode.trim() || undefined,
          managerUserId: form.managerUserId || undefined,
          parentLocationId: form.parentLocationId || null,
          isActive: form.isActive,
        });
      }
      return tenantsApi.createLocation({
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        type: form.type,
        address: form.address.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        businessHours: form.businessHours.trim() || undefined,
        timezone: form.timezone.trim() || undefined,
        currencyCode: form.currencyCode.trim() || undefined,
        managerUserId: form.managerUserId || undefined,
        ...(form.parentLocationId
          ? { parentLocationId: form.parentLocationId }
          : {}),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stores-branches"] });
      void qc.invalidateQueries({ queryKey: ["branch-selector-locations"] });
      void qc.invalidateQueries({ queryKey: ["locations"] });
      void qc.invalidateQueries({ queryKey: ["bootstrap"] });
      void qc.invalidateQueries({ queryKey: ["tenant-locations"] });
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

  const addManager = useMutation({
    mutationFn: () =>
      usersApi.create({
        fullName: mgrName.trim(),
        email: mgrEmail.trim(),
        password: mgrPassword,
        phone: mgrPhone.trim() || undefined,
        roleCode: "manager",
        primaryStoreId: editingId || undefined,
      }),
    onSuccess: (row) => {
      const created = row as { id?: string };
      toast.success("Manager added. You can assign them to this location.");
      if (created.id) {
        setForm((f) => ({ ...f, managerUserId: created.id! }));
      }
      setMgrOpen(false);
      setMgrName("");
      setMgrEmail("");
      setMgrPassword("");
      setMgrPhone("");
      void qc.invalidateQueries({ queryKey: ["stores-staff"] });
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Could not add manager"),
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setErrors({});
    setShowForm(true);
  }

  function openEdit(row: StoreRow) {
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
      parentLocationId: row.parentLocationId ?? "",
      isActive: row.isActive !== false,
    });
    setErrors({});
    setShowForm(true);
  }

  const allRows = (list.data ?? []) as StoreRow[];
  const rows = allRows.filter((r) =>
    statusTab === "active" ? r.isActive !== false : true,
  );
  const tree = flattenLocationTree(rows);
  const blockedParentIds = editingId
    ? new Set([editingId, ...descendantIds(editingId, allRows)])
    : new Set<string>();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.7rem] font-semibold tracking-[0.12em] text-[#8a9bb0] uppercase">
            Business
          </p>
          <h1 className="text-xl font-semibold text-[#0b1f33]">
            {inSettings ? "Locations" : "Stores"}
          </h1>
          <p className="mt-0.5 text-sm text-[#5a6b7d]">
            These are your shops / warehouses. Stock and bills use the location
            you pick at the top. Open Add location to create one — the list
            stays on this page when you are not editing.
          </p>
        </div>
        {canEdit ? (
          <Button type="button" onClick={openCreate}>
            <Plus className="mr-1 size-4" />
            Add location
          </Button>
        ) : null}
      </div>

      <div
        role="tablist"
        className="inline-flex gap-0.5 rounded-md border border-[#e2e8f0] bg-[#f1f5f9] p-0.5"
      >
        {(["all", "active"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={statusTab === id}
            onClick={() => setStatusTab(id)}
            className={
              statusTab === id
                ? "rounded-[5px] bg-white px-2.5 py-1.5 text-[0.75rem] font-semibold text-[#0b1f33] shadow-sm"
                : "rounded-[5px] px-2.5 py-1.5 text-[0.75rem] font-medium text-[#5a6b7d]"
            }
          >
            {id === "all" ? "All" : "Active"}
          </button>
        ))}
      </div>

      {showForm ? (
        <div className="rounded-xl border border-[#d9e0ea] bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-[#0b1f33]">
            {editingId ? "Edit location" : "New location"}
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
              <Label>Parent location</Label>
              <select
                className="h-9 w-full rounded-md border border-[#d9e0ea] bg-white px-2 text-sm"
                value={form.parentLocationId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, parentLocationId: e.target.value }))
                }
              >
                <option value="">— Organization (top level) —</option>
                {allRows
                  .filter((r) => !blockedParentIds.has(r.id))
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.code ? ` (${r.code})` : ""}
                    </option>
                  ))}
              </select>
              <p className="text-[0.7rem] text-[#8a9bb0]">
                Optional: this shop sits under another location (like HO). You
                cannot pick a child as its own parent.
              </p>
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
              {canEdit ? (
                <button
                  type="button"
                  className="text-[0.75rem] font-semibold text-[#1a56db]"
                  onClick={() => setMgrOpen(true)}
                >
                  + Add manager
                </button>
              ) : null}
              <p className="text-[0.7rem] text-[#8a9bb0]">
                A manager can run this branch. Add them here, or in Team.
              </p>
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

      {mgrOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-[#0b1f33]/45"
            aria-label="Close"
            onClick={() => setMgrOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-[#d9e0ea] bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-[#0b1f33]">
                  Add manager
                </h3>
                <p className="mt-0.5 text-sm text-[#5a6b7d]">
                  Creates a Store Manager login. Then assign them to a
                  location.
                </p>
              </div>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5a6b7d] hover:bg-[#f1f5f9]"
                aria-label="Close"
                onClick={() => setMgrOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Full name</Label>
                <Input
                  className="mt-1"
                  value={mgrName}
                  onChange={(e) => setMgrName(e.target.value)}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  className="mt-1"
                  type="email"
                  value={mgrEmail}
                  onChange={(e) => setMgrEmail(e.target.value)}
                />
              </div>
              <div>
                <Label>Password</Label>
                <Input
                  className="mt-1"
                  type="password"
                  value={mgrPassword}
                  onChange={(e) => setMgrPassword(e.target.value)}
                />
              </div>
              <div>
                <Label>Phone (optional)</Label>
                <Input
                  className="mt-1"
                  value={mgrPhone}
                  onChange={(e) => setMgrPhone(e.target.value)}
                />
              </div>
              <Button
                type="button"
                disabled={
                  addManager.isPending ||
                  !mgrName.trim() ||
                  !mgrEmail.trim() ||
                  mgrPassword.length < 8
                }
                onClick={() => addManager.mutate()}
              >
                {addManager.isPending ? "Saving…" : "Save manager"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {!showForm ? (
      <div className="overflow-hidden rounded-xl border border-[#d9e0ea] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#e8eef5] bg-[#f8fafc] text-[0.7rem] tracking-wide text-[#8a9bb0] uppercase">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Location</th>
              <th className="px-3 py-2.5 font-semibold">Code</th>
              <th className="px-3 py-2.5 font-semibold">Type</th>
              <th className="px-3 py-2.5 font-semibold">Parent</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tree.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-10 text-center text-[#8a9bb0]"
                >
                  <Building2 className="mx-auto mb-2 size-8 opacity-40" />
                  No locations yet
                </td>
              </tr>
            ) : (
              tree.map(({ row: r, depth }) => {
                const parentName = r.parentLocationId
                  ? allRows.find((x) => x.id === r.parentLocationId)?.name
                  : null;
                return (
                <tr
                  key={r.id}
                  className={cn(
                    "border-b border-[#eef2f8]",
                    currentId === r.id && "bg-[#eff6ff]",
                  )}
                >
                  <td className="px-3 py-2.5">
                    <div
                      className="font-medium text-[#0b1f33]"
                      style={{ paddingLeft: depth * 16 }}
                    >
                      {depth > 0 ? (
                        <span className="mr-1 text-[#8a9bb0]">↳</span>
                      ) : null}
                      {r.name}
                    </div>
                    {r.address ? (
                      <div
                        className="text-[0.75rem] text-[#8a9bb0]"
                        style={{ paddingLeft: depth * 16 }}
                      >
                        {r.address}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[0.8rem]">
                    {r.code}
                  </td>
                  <td className="px-3 py-2.5 capitalize">{r.type ?? "store"}</td>
                  <td className="px-3 py-2.5 text-[0.8rem] text-[#5a6b7d]">
                    {parentName ?? "—"}
                  </td>
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
              );
              })
            )}
          </tbody>
        </table>
      </div>
      ) : (
        <p className="text-sm text-[#5a6b7d]">
          Save or cancel the form to see the location list again.
        </p>
      )}
    </div>
  );
}
