"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { expensesApi, tenantsApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { todayYmd } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader, EmptyState, PageSkeleton } from "@/components/page-header";

export default function ExpensesPage() {
  const { money } = useBootstrap();
  const qc = useQueryClient();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(todayYmd());
  const [amount, setAmount] = useState("");
  const [spentAt, setSpentAt] = useState(todayYmd());
  const [categoryId, setCategoryId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [petty, setPetty] = useState(false);
  const [newCat, setNewCat] = useState("");

  const categories = useQuery({
    queryKey: ["expense-categories"],
    queryFn: () => expensesApi.listCategories(),
  });
  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });
  const list = useQuery({
    queryKey: ["expenses", from, to],
    queryFn: () => expensesApi.list({ from, to }),
  });

  const seed = useMutation({
    mutationFn: () => expensesApi.seedCategories(),
    onSuccess: () => {
      toast.success("Default categories ready");
      void qc.invalidateQueries({ queryKey: ["expense-categories"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const addCat = useMutation({
    mutationFn: () => expensesApi.createCategory(newCat.trim()),
    onSuccess: () => {
      toast.success("Category added");
      setNewCat("");
      void qc.invalidateQueries({ queryKey: ["expense-categories"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const create = useMutation({
    mutationFn: () =>
      expensesApi.create({
        amount: Number(amount),
        spentAt,
        categoryId: categoryId || undefined,
        locationId: locationId || undefined,
        notes: notes.trim() || undefined,
        isPettyCash: petty,
        paymentMethod: "cash",
      }),
    onSuccess: () => {
      toast.success("Expense recorded");
      setAmount("");
      setNotes("");
      void qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => expensesApi.remove(id),
    onSuccess: () => {
      toast.success("Deleted");
      void qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  if (list.isLoading && categories.isLoading) return <PageSkeleton rows={6} />;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Expenses"
        subtitle="Daily shop costs, categories, and petty cash — multi-location ready."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="space-y-4 rounded-xl border border-[#d9e0ea] bg-white p-4">
          <h2 className="text-sm font-semibold text-[#0b1f33]">Add expense</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                className="mt-1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                className="mt-1"
                value={spentAt}
                onChange={(e) => setSpentAt(e.target.value)}
              />
            </div>
            <div>
              <Label>Category</Label>
              <Select
                className="mt-1"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">—</option>
                {(categories.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Location</Label>
              <Select
                className="mt-1"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
              >
                <option value="">All / none</option>
                {(locations.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Input
              className="mt-1"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-[#0b1f33]">
            <input
              type="checkbox"
              checked={petty}
              onChange={(e) => setPetty(e.target.checked)}
            />
            Petty cash
          </label>
          <Button
            type="button"
            disabled={create.isPending || !amount}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Saving…" : "Save expense"}
          </Button>

          <div className="border-t border-[#eef2f7] pt-4">
            <p className="text-xs font-semibold tracking-wide text-[#5a6b7d] uppercase">
              Categories
            </p>
            <div className="mt-2 flex gap-2">
              <Input
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                placeholder="New category"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={!newCat.trim() || addCat.isPending}
                onClick={() => addCat.mutate()}
              >
                Add
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              variant="soft"
              className="mt-2"
              disabled={seed.isPending}
              onClick={() => seed.mutate()}
            >
              Seed defaults
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-[#d9e0ea] bg-white p-4">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                className="mt-1 h-9"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                className="mt-1 h-9"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <p className="ml-auto text-sm font-semibold tabular-nums text-[#0b1f33]">
              Total {money(list.data?.total ?? 0)}
            </p>
          </div>

          {!list.data?.items?.length ? (
            <EmptyState
              title="No expenses in range"
              detail="Record rent, utilities, petrol, or petty cash on the left."
            />
          ) : (
            <ul className="mt-4 max-h-[28rem] divide-y divide-[#f0f3f7] overflow-y-auto text-sm">
              {list.data.items.map((e) => (
                <li
                  key={e.id}
                  className="flex items-start justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[#0b1f33]">
                      {e.category?.name ?? "Uncategorised"}
                      {e.isPettyCash ? (
                        <span className="ml-1.5 text-[0.65rem] font-semibold text-[#1a56db]">
                          PETTY
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[0.75rem] text-[#5a6b7d]">
                      {String(e.spentAt).slice(0, 10)}
                      {e.location?.name ? ` · ${e.location.name}` : ""}
                      {e.notes ? ` · ${e.notes}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold tabular-nums">
                      {money(e.amount)}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(e.id)}
                    >
                      ×
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
