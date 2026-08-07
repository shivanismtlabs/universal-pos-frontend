"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { customersApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import {
  addPartyMemberSchema,
  createPartySchema,
  type AddPartyMemberInput,
  type CreatePartyInput,
} from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/form";
import { formatDate } from "@/lib/utils";
import { RequireCommerceMode } from "@/components/require-commerce-mode";

type PartyMember = {
  customerId: string;
  roleLabel?: string | null;
  customer?: { id: string; fullName: string; phone: string } | null;
};

type PartyRow = {
  id: string;
  name: string;
  eventDate?: string | null;
  primaryCustomer?: { id: string; fullName: string; phone: string } | null;
  members?: PartyMember[] | null;
};

function normalizeParties(rows: PartyRow[] | null | undefined): PartyRow[] {
  return (rows ?? []).map((p) => ({
    ...p,
    members: Array.isArray(p.members) ? p.members : [],
  }));
}

function PartiesDesk() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const parties = useQuery({
    queryKey: ["parties"],
    queryFn: async () => normalizeParties(await customersApi.listParties()),
  });
  const customers = useQuery({
    queryKey: ["customers", "pick"],
    queryFn: () => customersApi.list({ limit: 100 }),
  });

  const partyList = parties.data ?? [];
  const selected = useMemo(
    () => partyList.find((p) => p.id === selectedId) ?? null,
    [partyList, selectedId],
  );
  const selectedMembers = selected?.members ?? [];

  const form = useForm<CreatePartyInput>({
    resolver: zodResolver(createPartySchema),
    defaultValues: { name: "", eventDate: "", primaryCustomerId: "" },
  });

  const memberForm = useForm<AddPartyMemberInput>({
    resolver: zodResolver(addPartyMemberSchema),
    defaultValues: { customerId: "", roleLabel: "" },
  });

  const create = useMutation({
    mutationFn: (v: CreatePartyInput) =>
      customersApi.createParty({
        name: v.name,
        eventDate: v.eventDate || undefined,
        primaryCustomerId: v.primaryCustomerId || undefined,
      }),
    onSuccess: (row) => {
      toast.success("Group created");
      form.reset();
      setSelectedId(row.id);
      void qc.invalidateQueries({ queryKey: ["parties"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const addMember = useMutation({
    mutationFn: (v: AddPartyMemberInput) => {
      if (!selectedId) throw new Error("Select a group");
      return customersApi.addPartyMember(selectedId, {
        customerId: v.customerId,
        roleLabel: v.roleLabel || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Member added");
      memberForm.reset();
      void qc.invalidateQueries({ queryKey: ["parties"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const removeMember = useMutation({
    mutationFn: (customerId: string) => {
      if (!selectedId) throw new Error("Select a group");
      return customersApi.removePartyMember(selectedId, customerId);
    },
    onSuccess: () => {
      toast.success("Member removed");
      void qc.invalidateQueries({ queryKey: ["parties"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  return (
    <div className="space-y-6 sm:space-y-8">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-[#0b1f33]">
          Groups
        </p>
        <h1 className="display mt-2 text-2xl sm:text-4xl">Customer groups</h1>
        <p className="mt-1 text-sm text-[#6b7280]">
          Optional groups for shared rentals — wedding parties, event crews,
          corporate bookings, tour groups, etc.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="panel overflow-x-auto p-4 sm:p-5">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-[#6b7280]">
              <tr>
                <th className="pb-3">Name</th>
                <th className="pb-3">Event</th>
                <th className="pb-3">Primary</th>
                <th className="pb-3">Members</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e7eb]">
              {partyList.map((p) => (
                <tr
                  key={p.id}
                  className={`cursor-pointer ${selectedId === p.id ? "bg-[#e8eefb]" : "hover:bg-[#f9fafb]"}`}
                  onClick={() => setSelectedId(p.id)}
                >
                  <td className="py-3 font-medium">{p.name}</td>
                  <td className="py-3">{formatDate(p.eventDate)}</td>
                  <td className="py-3 text-[#374151]">
                    {p.primaryCustomer?.fullName ?? "—"}
                  </td>
                  <td className="py-3">{p.members?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {parties.isError ? (
            <p className="py-6 text-sm text-[#b91c1c]">
              {parties.error instanceof ApiError
                ? parties.error.messages.join(", ")
                : "Could not load groups — check API on port 3001"}
            </p>
          ) : null}
          {!partyList.length && !parties.isLoading && !parties.isError ? (
            <p className="py-6 text-[#6b7280]">No groups yet</p>
          ) : null}
        </section>

        <div className="space-y-6">
          <form
            className="panel space-y-4 p-5"
            onSubmit={form.handleSubmit((v) => create.mutate(v))}
            noValidate
          >
            <h2 className="display text-2xl">New group</h2>
            <div>
              <Label>Name</Label>
              <Input
                className="mt-2"
                placeholder="e.g. Sharma wedding, Fleet crew A"
                {...form.register("name")}
              />
              <FieldError message={form.formState.errors.name?.message} />
            </div>
            <div>
              <Label>Event date</Label>
              <Input
                className="mt-2"
                type="date"
                {...form.register("eventDate")}
              />
            </div>
            <div>
              <Label>Primary customer</Label>
              <select
                className="mt-2 select-field"
                {...form.register("primaryCustomerId")}
              >
                <option value="">Optional</option>
                {(customers.data?.items ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} ({c.phone})
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" className="w-full" disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Create group"}
            </Button>
          </form>

          {selected ? (
            <section className="panel space-y-4 p-5">
              <h2 className="display text-2xl">{selected.name}</h2>
              <ul className="space-y-2 text-sm">
                {selectedMembers.map((m) => (
                  <li
                    key={m.customerId}
                    className="flex items-center justify-between gap-2 rounded-lg bg-[#f6f7f9] px-3 py-2"
                  >
                    <span>
                      {m.customer?.fullName ?? "Customer"}
                      {m.roleLabel ? (
                        <span className="text-[#6b7280]"> · {m.roleLabel}</span>
                      ) : null}
                    </span>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={removeMember.isPending}
                      onClick={() =>
                        removeMember.mutate(
                          m.customerId ?? m.customer?.id ?? "",
                        )
                      }
                    >
                      Remove
                    </Button>
                  </li>
                ))}
                {!selectedMembers.length ? (
                  <li className="py-2 text-[#6b7280]">No members yet</li>
                ) : null}
              </ul>
              <form
                className="space-y-3 border-t border-[#e5e7eb] pt-4"
                onSubmit={memberForm.handleSubmit((v) => addMember.mutate(v))}
                noValidate
              >
                <Label>Add member</Label>
                <select
                  className="select-field"
                  {...memberForm.register("customerId")}
                >
                  <option value="">Select customer</option>
                  {(customers.data?.items ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </select>
                <FieldError
                  message={memberForm.formState.errors.customerId?.message}
                />
                <Input
                  placeholder="Role (optional)"
                  {...memberForm.register("roleLabel")}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={addMember.isPending}
                >
                  Add member
                </Button>
              </form>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function PartiesPage() {
  return (
    <RequireCommerceMode modes={["rental"]} label="Customer groups need rental mode">
      <PartiesDesk />
    </RequireCommerceMode>
  );
}
