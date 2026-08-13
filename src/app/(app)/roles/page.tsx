"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { iamApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { FieldError } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import {
  createRoleNameSchema,
  zodFieldErrors,
  zodMessages,
} from "@/lib/validations";

export default function RolesPage() {
  const qc = useQueryClient();
  const rolesQ = useQuery({
    queryKey: ["iam-roles"],
    queryFn: () => iamApi.listRoles(),
  });
  const permsQ = useQuery({
    queryKey: ["iam-permissions"],
    queryFn: () => iamApi.listPermissions(),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const selected = useMemo(
    () => (rolesQ.data ?? []).find((r) => r.id === selectedId) ?? null,
    [rolesQ.data, selectedId],
  );

  function selectRole(id: string) {
    const r = (rolesQ.data ?? []).find((x) => x.id === id);
    setSelectedId(id);
    setFieldErrors({});
    if (r) {
      setName(r.name);
      setCode(r.code);
      setPicked([...r.permissions]);
    }
  }

  const create = useMutation({
    mutationFn: () => {
      const parsed = createRoleNameSchema.safeParse({ name });
      if (!parsed.success) {
        setFieldErrors(zodFieldErrors(parsed.error));
        toast.error(zodMessages(parsed.error)[0] ?? "Check the form");
        throw new Error(zodMessages(parsed.error)[0] ?? "Invalid role");
      }
      setFieldErrors({});
      return iamApi.createRole({
        name: parsed.data.name,
        code: code || undefined,
        permissions: picked,
      });
    },
    onSuccess: () => {
      toast.success("Role created");
      void qc.invalidateQueries({ queryKey: ["iam-roles"] });
      setName("");
      setCode("");
      setPicked([]);
      setSelectedId(null);
      setFieldErrors({});
    },
    onError: (e) => {
      if (e instanceof ApiError) toast.error(e.messages.join(", "));
    },
  });

  const save = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error("none");
      const parsed = createRoleNameSchema.safeParse({ name });
      if (!parsed.success) {
        setFieldErrors(zodFieldErrors(parsed.error));
        toast.error(zodMessages(parsed.error)[0] ?? "Check the form");
        throw new Error(zodMessages(parsed.error)[0] ?? "Invalid role");
      }
      setFieldErrors({});
      return iamApi.updateRole(selectedId, {
        name: parsed.data.name,
        permissions: picked,
      });
    },
    onSuccess: () => {
      toast.success("Role updated");
      void qc.invalidateQueries({ queryKey: ["iam-roles"] });
    },
    onError: (e) => {
      if (e instanceof ApiError) toast.error(e.messages.join(", "));
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => iamApi.deleteRole(id),
    onSuccess: () => {
      toast.success("Role deleted");
      setSelectedId(null);
      void qc.invalidateQueries({ queryKey: ["iam-roles"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  function togglePerm(code: string) {
    setPicked((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  const locked = selected?.isSystem && selected.code === "admin";

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Roles & permissions"
        subtitle="System roles (Admin, Store Manager, Cashier, Inventory Manager, Accountant) plus custom roles with a permission matrix."
      />

      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.3fr]">
        <section className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">
          <div className="border-b border-[#f3f4f6] px-4 py-3 text-sm font-medium text-[#374151]">
            Roles
          </div>
          <ul className="divide-y divide-[#f3f4f6]">
            {(rolesQ.data ?? []).map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => selectRole(r.id)}
                  className={cn(
                    "flex w-full items-center justify-between px-4 py-3 text-left text-sm transition hover:bg-[#f9fafb]",
                    selectedId === r.id && "bg-[#eef2ff]",
                  )}
                >
                  <span>
                    <span className="font-semibold text-[#111827]">{r.name}</span>
                    <span className="mt-0.5 block text-xs text-[#9ca3af]">
                      {r.code}
                      {r.isSystem ? " · system" : " · custom"} · {r.userCount}{" "}
                      staff
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-[#f3f4f6] p-4">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => {
                setSelectedId(null);
                setName("");
                setCode("");
                setPicked([]);
                setFieldErrors({});
              }}
            >
              + New custom role
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-[#e5e7eb] bg-white p-5">
          <h2 className="text-lg font-semibold text-[#111827]">
            {selectedId ? "Edit role" : "Create custom role"}
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input
                className="mt-1.5"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setFieldErrors((f) => ({ ...f, name: "" }));
                }}
                placeholder="Floor supervisor"
              />
              <FieldError message={fieldErrors.name} />
            </div>
            <div>
              <Label>Code</Label>
              <Input
                className="mt-1.5"
                value={code}
                disabled={Boolean(selectedId)}
                onChange={(e) => setCode(e.target.value)}
                placeholder="floor_supervisor"
              />
            </div>
          </div>

          <p className="mt-4 text-xs font-semibold tracking-wide text-[#6b7280] uppercase">
            Permissions
          </p>
          <div className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-[#e5e7eb] p-2">
            {(permsQ.data ?? []).map((p) => (
              <label
                key={p.code}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[#f9fafb]",
                  locked && "opacity-60",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  disabled={locked}
                  checked={picked.includes(p.code)}
                  onChange={() => togglePerm(p.code)}
                />
                <span>
                  <span className="font-medium text-[#111827]">{p.code}</span>
                  {p.description ? (
                    <span className="block text-xs text-[#6b7280]">
                      {p.description}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {selectedId ? (
              <>
                <Button
                  type="button"
                  disabled={save.isPending || locked}
                  onClick={() => save.mutate()}
                >
                  {save.isPending ? "Saving…" : "Save changes"}
                </Button>
                {!selected?.isSystem ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (confirm("Delete this custom role?")) {
                        remove.mutate(selectedId);
                      }
                    }}
                  >
                    Delete
                  </Button>
                ) : null}
              </>
            ) : (
              <Button
                type="button"
                disabled={create.isPending}
                onClick={() => create.mutate()}
              >
                {create.isPending ? "Creating…" : "Create role"}
              </Button>
            )}
          </div>
          {locked ? (
            <p className="mt-2 text-xs text-[#6b7280]">
              Admin always has full access — the matrix cannot be reduced.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
