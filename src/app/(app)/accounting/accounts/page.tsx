"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { accountingApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { AccountingNav } from "../accounting-nav";

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
  subtype?: string | null;
  category?: string | null;
  isActive: boolean;
  _count?: { lines: number; children: number };
};

export default function ChartOfAccountsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const list = useQuery({
    queryKey: ["accounting", "accounts", q, type],
    queryFn: () =>
      accountingApi.listAccounts({
        q: q || undefined,
        type: type || undefined,
        limit: 100,
      }),
  });
  const items = (list.data?.items ?? []) as Account[];
  const [form, setForm] = useState({
    code: "",
    name: "",
    type: "ASSET",
    category: "",
  });

  const create = useMutation({
    mutationFn: () => accountingApi.createAccount(form),
    onSuccess: () => {
      toast.success("Account created");
      setForm({ code: "", name: "", type: "ASSET", category: "" });
      void qc.invalidateQueries({ queryKey: ["accounting", "accounts"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Create failed"),
  });

  const toggle = useMutation({
    mutationFn: (row: Account) =>
      accountingApi.updateAccount(row.id, { isActive: !row.isActive }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["accounting", "accounts"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Update failed"),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Chart of Accounts"
        subtitle="Configurable accounts for every commerce mode. Accounts used on posted journals cannot be deleted."
      />
      <AccountingNav />
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search code or name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          <option value="ASSET">Asset</option>
          <option value="LIABILITY">Liability</option>
          <option value="EQUITY">Equity</option>
          <option value="REVENUE">Revenue</option>
          <option value="EXPENSE">Expense</option>
        </Select>
      </div>
      <form
        className="grid gap-2 rounded-lg border border-[#e5e7eb] bg-white p-3 sm:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div>
          <Label>Code</Label>
          <Input
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Name</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div>
          <Label>Type</Label>
          <Select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option>ASSET</option>
            <option>LIABILITY</option>
            <option>EQUITY</option>
            <option>REVENUE</option>
            <option>EXPENSE</option>
          </Select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={create.isPending}>
            Create account
          </Button>
        </div>
      </form>
      <div className="overflow-x-auto rounded-lg border border-[#e5e7eb] bg-white">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-[#f9fafb] text-[#6b7280]">
            <tr>
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Posted lines</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className="border-t border-[#e5e7eb]">
                <td className="px-3 py-2 font-mono">{a.code}</td>
                <td className="px-3 py-2">{a.name}</td>
                <td className="px-3 py-2">{a.type}</td>
                <td className="px-3 py-2">{a.category ?? "—"}</td>
                <td className="px-3 py-2">{a.isActive ? "Active" : "Inactive"}</td>
                <td className="px-3 py-2">{a._count?.lines ?? 0}</td>
                <td className="px-3 py-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => toggle.mutate(a)}
                  >
                    {a.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
