"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { expensesApi, tenantsApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { useAuthStore } from "@/lib/auth-store";
import { canFinance } from "@/lib/roles";
import { todayYmd, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader, EmptyState, PageSkeleton } from "@/components/page-header";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:3001";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function ExpensesPage() {
  const { money } = useBootstrap();
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const allowApprove = canFinance(roles);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(todayYmd());
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "approved"
  >("all");
  const [pettyOnly, setPettyOnly] = useState(false);
  const [amount, setAmount] = useState("");
  const [spentAt, setSpentAt] = useState(todayYmd());
  const [categoryId, setCategoryId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [petty, setPetty] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
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
    queryKey: ["expenses", from, to, statusFilter, pettyOnly],
    queryFn: () =>
      expensesApi.list({
        from,
        to,
        status: statusFilter === "all" ? undefined : statusFilter,
        pettyCash: pettyOnly || undefined,
      }),
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
    mutationFn: async () => {
      const receiptBase64 = receiptFile
        ? await fileToBase64(receiptFile)
        : undefined;
      return expensesApi.create({
        amount: Number(amount),
        spentAt,
        categoryId: categoryId || undefined,
        locationId: locationId || undefined,
        notes: notes.trim() || undefined,
        isPettyCash: petty,
        paymentMethod,
        receiptBase64,
      });
    },
    onSuccess: () => {
      toast.success(
        allowApprove ? "Expense recorded" : "Expense submitted for approval",
      );
      setAmount("");
      setNotes("");
      setReceiptFile(null);
      void qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const attach = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const imageBase64 = await fileToBase64(file);
      return expensesApi.uploadReceipt(id, imageBase64);
    },
    onSuccess: () => {
      toast.success("Receipt attached");
      void qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const approve = useMutation({
    mutationFn: (id: string) => expensesApi.approve(id),
    onSuccess: () => {
      toast.success("Approved");
      void qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const reject = useMutation({
    mutationFn: (id: string) => expensesApi.reject(id),
    onSuccess: () => {
      toast.success("Rejected");
      void qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const voidExp = useMutation({
    mutationFn: (id: string) => expensesApi.void(id),
    onSuccess: () => {
      toast.success("Voided");
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

  const receiptHref = (url: string | null | undefined) => {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
  };

  const statusChips = useMemo(
    () =>
      [
        ["all", "All"],
        ["pending", "Pending"],
        ["approved", "Approved"],
      ] as const,
    [],
  );

  if (list.isLoading && categories.isLoading) return <PageSkeleton rows={6} />;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Expenses"
        subtitle="Daily shop costs with receipts, payment method, and approval."
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
            <div>
              <Label>Payment method</Label>
              <Select
                className="mt-1"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="bank_transfer">Bank transfer</option>
              </Select>
            </div>
            <div>
              <Label>Receipt</Label>
              <Input
                type="file"
                accept="image/*"
                capture="environment"
                className="mt-1"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
              />
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
                disabled={!newCat.trim() || addCat.isPending || !allowApprove}
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
              disabled={seed.isPending || !allowApprove}
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
            <label className="flex items-center gap-2 pb-1 text-xs text-[#0b1f33]">
              <input
                type="checkbox"
                checked={pettyOnly}
                onChange={(e) => setPettyOnly(e.target.checked)}
              />
              Petty only
            </label>
            <p className="ml-auto text-sm font-semibold tabular-nums text-[#0b1f33]">
              Approved total {money(list.data?.total ?? 0)}
            </p>
          </div>

          <div className="mt-3 flex gap-1 rounded-[10px] bg-[#eef2f8] p-1 sm:w-fit">
            {statusChips.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatusFilter(id)}
                className={cn(
                  "rounded-[8px] px-3 py-1.5 text-xs font-semibold",
                  statusFilter === id
                    ? "bg-white text-[#0b1f33] shadow-sm"
                    : "text-[#5a6b7d]",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {!list.data?.items?.length ? (
            <EmptyState
              title="No expenses in range"
              detail="Record rent, utilities, petrol, or petty cash on the left."
            />
          ) : (
            <ul className="mt-4 max-h-[28rem] divide-y divide-[#f0f3f7] overflow-y-auto text-sm">
              {list.data.items.map((e) => {
                const href = receiptHref(e.receiptUrl);
                return (
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
                        <span className="ml-1.5 text-[0.65rem] font-semibold uppercase text-[#5a6b7d]">
                          {e.status}
                        </span>
                      </p>
                      <p className="text-[0.75rem] text-[#5a6b7d]">
                        {String(e.spentAt).slice(0, 10)} · {e.paymentMethod}
                        {e.location?.name ? ` · ${e.location.name}` : ""}
                        {e.notes ? ` · ${e.notes}` : ""}
                      </p>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-xs font-semibold text-[#1a56db]"
                        >
                          View receipt
                        </a>
                      ) : (
                        <label className="mt-1 inline-block cursor-pointer text-xs font-semibold text-[#1a56db]">
                          Attach receipt
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(ev) => {
                              const file = ev.target.files?.[0];
                              if (file) attach.mutate({ id: e.id, file });
                            }}
                          />
                        </label>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-semibold tabular-nums">
                        {money(e.amount)}
                      </span>
                      <div className="flex flex-wrap justify-end gap-1">
                        {allowApprove && e.status === "pending" ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => approve.mutate(e.id)}
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => reject.mutate(e.id)}
                            >
                              Reject
                            </Button>
                          </>
                        ) : null}
                        {allowApprove && e.status === "approved" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => voidExp.mutate(e.id)}
                          >
                            Void
                          </Button>
                        ) : null}
                        {e.status !== "approved" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={remove.isPending}
                            onClick={() => remove.mutate(e.id)}
                          >
                            ×
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
