"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { expensesApi, tenantsApi } from "@/lib/api";
import type { ExpenseRow } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { EMPTY_ROLES, useAuthStore } from "@/lib/auth-store";
import { canFinance } from "@/lib/roles";
import {
  todayYmd,
  cn,
  newIdempotencyKey,
  mediaUrl,
  readFileAsDataUrl,
  moneyNumber,
} from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FieldError } from "@/components/ui/form";
import { PageHeader, EmptyState, PageSkeleton } from "@/components/page-header";
import { TablePager } from "@/components/table-pager";
import {
  createExpenseSchema,
  expenseCategoryNameSchema,
  pettyCashAmountSchema,
  zodFieldErrors,
  zodMessages,
} from "@/lib/validations";

type DeskTab = "dashboard" | "expenses" | "approvals" | "petty";
type StatusFilter = "all" | "pending" | "approved" | "rejected";

const PAYMENT_METHODS = [
  ["cash", "Cash"],
  ["upi", "UPI"],
  ["card", "Card"],
  ["bank_transfer", "Bank transfer"],
  ["petty_cash", "Petty cash"],
  ["other", "Other"],
] as const;

function monthStartYmd() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "pending":
      return "bg-amber-50 text-amber-800 ring-amber-200";
    case "approved":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "rejected":
      return "bg-rose-50 text-rose-800 ring-rose-200";
    case "voided":
      return "bg-gray-100 text-gray-600 ring-gray-200";
    case "draft":
      return "bg-slate-100 text-slate-700 ring-slate-200";
    default:
      return "bg-[#eef2f8] text-[#5a6b7d] ring-[#d9e0ea]";
  }
}

function methodLabel(method: string) {
  return (
    PAYMENT_METHODS.find(([id]) => id === method)?.[1] ??
    method.replace(/_/g, " ")
  );
}

function expenseTotal(row: ExpenseRow) {
  return moneyNumber(row.amount);
}

function expenseTax(row: ExpenseRow) {
  return moneyNumber(row.taxAmount);
}

function expenseNet(row: ExpenseRow) {
  if (row.netAmount != null) return moneyNumber(row.netAmount);
  return Math.max(0, expenseTotal(row) - expenseTax(row));
}

export default function ExpensesPage() {
  const { money } = useBootstrap();
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.user?.roles ?? EMPTY_ROLES);
  const allowFinance = canFinance(roles);

  const [deskTab, setDeskTab] = useState<DeskTab>("dashboard");
  const [expListPage, setExpListPage] = useState(1);
  const EXP_PAGE = 15;

  const [from, setFrom] = useState(monthStartYmd);
  const [to, setTo] = useState(todayYmd);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [filterLocationId, setFilterLocationId] = useState("");
  const [pettyOnly, setPettyOnly] = useState(false);

  const [spentAt, setSpentAt] = useState(todayYmd);
  const [categoryId, setCategoryId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [amount, setAmount] = useState("");
  const [taxable, setTaxable] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [payee, setPayee] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [petty, setPetty] = useState(false);
  const [reimbursement, setReimbursement] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptOverride, setReceiptOverride] = useState(false);
  const [newCat, setNewCat] = useState("");

  const [pettyLocationId, setPettyLocationId] = useState("");
  const [openingAmount, setOpeningAmount] = useState("");
  const [openingNotes, setOpeningNotes] = useState("");
  const [replenishAmount, setReplenishAmount] = useState("");
  const [replenishRef, setReplenishRef] = useState("");
  const [replenishNotes, setReplenishNotes] = useState("");
  const [replenishMethod, setReplenishMethod] = useState("cash");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustDirection, setAdjustDirection] = useState<"credit" | "debit">(
    "credit",
  );
  const [adjustNotes, setAdjustNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const categories = useQuery({
    queryKey: ["expense-categories", "active"],
    queryFn: () => expensesApi.listCategories(true),
  });
  const allCategories = useQuery({
    queryKey: ["expense-categories", "all"],
    queryFn: () => expensesApi.listCategories(),
  });
  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });

  const summary = useQuery({
    queryKey: ["expenses-summary"],
    queryFn: () => expensesApi.summary(),
    enabled: deskTab === "dashboard",
  });

  const list = useQuery({
    queryKey: [
      "expenses",
      from,
      to,
      statusFilter,
      filterCategoryId,
      filterLocationId,
      pettyOnly,
    ],
    queryFn: () =>
      expensesApi.list({
        from,
        to,
        status: statusFilter === "all" ? undefined : statusFilter,
        categoryId: filterCategoryId || undefined,
        locationId: filterLocationId || undefined,
        pettyCash: pettyOnly || undefined,
      }),
    enabled: deskTab === "expenses",
  });

  const pending = useQuery({
    queryKey: ["expenses", "pending-approvals"],
    queryFn: () => expensesApi.list({ status: "pending" }),
    enabled: deskTab === "approvals",
  });

  const pettyCash = useQuery({
    queryKey: ["petty-cash", pettyLocationId],
    queryFn: () =>
      expensesApi.pettyCash(pettyLocationId || undefined),
    enabled: deskTab === "petty",
  });

  const pettyLedger = useQuery({
    queryKey: ["petty-cash-ledger", pettyLocationId],
    queryFn: () =>
      expensesApi.pettyCashLedger({
        locationId: pettyLocationId || undefined,
        limit: 100,
      }),
    enabled: deskTab === "petty",
  });

  const invalidateExpenses = () => {
    void qc.invalidateQueries({ queryKey: ["expenses"] });
    void qc.invalidateQueries({ queryKey: ["expenses-summary"] });
    void qc.invalidateQueries({ queryKey: ["petty-cash"] });
    void qc.invalidateQueries({ queryKey: ["petty-cash-ledger"] });
  };

  const resetForm = () => {
    setAmount("");
    setPayee("");
    setReference("");
    setNotes("");
    setReceiptFile(null);
    setReceiptOverride(false);
    setReimbursement(false);
    setSpentAt(todayYmd());
    setTaxable(true);
    setFieldErrors({});
  };

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
    mutationFn: () => {
      const parsed = expenseCategoryNameSchema.safeParse({ name: newCat });
      if (!parsed.success) {
        toast.error(zodMessages(parsed.error).join(", "));
        throw new Error(zodMessages(parsed.error)[0] ?? "Invalid category");
      }
      return expensesApi.createCategory({ name: parsed.data.name });
    },
    onSuccess: () => {
      toast.success("Category added");
      setNewCat("");
      void qc.invalidateQueries({ queryKey: ["expense-categories"] });
    },
    onError: (e) => {
      if (e instanceof ApiError) toast.error(e.messages.join(", "));
    },
  });

  const create = useMutation({
    mutationFn: async (saveAsDraft: boolean) => {
      const isPetty = petty || paymentMethod === "petty_cash";
      const method = isPetty ? "petty_cash" : paymentMethod;
      const parsed = createExpenseSchema.safeParse({
        amount: Number(amount),
        spentAt,
        categoryId,
        paymentMethod: method,
        payee,
        notes,
      });
      if (!parsed.success) {
        setFieldErrors(zodFieldErrors(parsed.error));
        toast.error(zodMessages(parsed.error).join(", "));
        throw new Error(zodMessages(parsed.error)[0] ?? "Check the form");
      }
      setFieldErrors({});
      const receiptBase64 = receiptFile
        ? await readFileAsDataUrl(receiptFile)
        : undefined;
      return expensesApi.create({
        amount: parsed.data.amount,
        spentAt: parsed.data.spentAt,
        categoryId: parsed.data.categoryId || undefined,
        locationId: locationId || undefined,
        paymentMethod: parsed.data.paymentMethod,
        notes: parsed.data.notes?.trim() || undefined,
        payee: parsed.data.payee?.trim() || undefined,
        reference: reference.trim() || undefined,
        isPettyCash: isPetty,
        isReimbursement: reimbursement,
        taxable,
        receiptBase64,
        receiptOverride: allowFinance ? receiptOverride : undefined,
        saveAsDraft,
        idempotencyKey: newIdempotencyKey("exp"),
      });
    },
    onSuccess: (_d, saveAsDraft) => {
      toast.success(
        saveAsDraft
          ? "Draft saved"
          : allowFinance
            ? "Expense recorded"
            : "Expense submitted for approval",
      );
      resetForm();
      invalidateExpenses();
    },
    onError: (e) => {
      if (e instanceof ApiError) toast.error(e.messages.join(", "));
    },
  });

  const attach = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const imageBase64 = await readFileAsDataUrl(file);
      return expensesApi.uploadReceipt(id, imageBase64);
    },
    onSuccess: () => {
      toast.success("Receipt attached");
      invalidateExpenses();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const approve = useMutation({
    mutationFn: (id: string) => expensesApi.approve(id),
    onSuccess: () => {
      toast.success("Approved");
      invalidateExpenses();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      expensesApi.reject(id, reason),
    onSuccess: () => {
      toast.success("Rejected");
      invalidateExpenses();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const voidExp = useMutation({
    mutationFn: (id: string) => expensesApi.void(id),
    onSuccess: () => {
      toast.success("Voided");
      invalidateExpenses();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => expensesApi.remove(id),
    onSuccess: () => {
      toast.success("Deleted");
      invalidateExpenses();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const openPetty = useMutation({
    mutationFn: () => {
      const parsed = pettyCashAmountSchema.safeParse({
        amount: Number(openingAmount),
        notes: openingNotes,
      });
      if (!parsed.success) {
        toast.error(zodMessages(parsed.error).join(", "));
        throw new Error(zodMessages(parsed.error)[0] ?? "Invalid amount");
      }
      return expensesApi.pettyCashOpening({
        amount: parsed.data.amount,
        locationId: pettyLocationId || undefined,
        notes: parsed.data.notes?.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Petty cash opened");
      setOpeningAmount("");
      setOpeningNotes("");
      invalidateExpenses();
    },
    onError: (e) => {
      if (e instanceof ApiError) toast.error(e.messages.join(", "));
    },
  });

  const replenish = useMutation({
    mutationFn: () => {
      const parsed = pettyCashAmountSchema.safeParse({
        amount: Number(replenishAmount),
        notes: replenishNotes,
      });
      if (!parsed.success) {
        toast.error(zodMessages(parsed.error).join(", "));
        throw new Error(zodMessages(parsed.error)[0] ?? "Invalid amount");
      }
      return expensesApi.pettyCashReplenish({
        amount: parsed.data.amount,
        locationId: pettyLocationId || undefined,
        reference: replenishRef.trim() || undefined,
        notes: parsed.data.notes?.trim() || undefined,
        paymentMethod: replenishMethod,
      });
    },
    onSuccess: () => {
      toast.success("Petty cash replenished");
      setReplenishAmount("");
      setReplenishRef("");
      setReplenishNotes("");
      invalidateExpenses();
    },
    onError: (e) => {
      if (e instanceof ApiError) toast.error(e.messages.join(", "));
    },
  });

  const adjust = useMutation({
    mutationFn: () => {
      const parsed = pettyCashAmountSchema.safeParse({
        amount: Number(adjustAmount),
        notes: adjustNotes,
      });
      if (!parsed.success) {
        toast.error(zodMessages(parsed.error).join(", "));
        throw new Error(zodMessages(parsed.error)[0] ?? "Invalid amount");
      }
      if (!parsed.data.notes?.trim()) {
        toast.error("Notes are required for adjustments");
        throw new Error("Notes are required for adjustments");
      }
      return expensesApi.pettyCashAdjust({
        amount: parsed.data.amount,
        direction: adjustDirection,
        notes: parsed.data.notes.trim(),
        locationId: pettyLocationId || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Petty cash adjusted");
      setAdjustAmount("");
      setAdjustNotes("");
      invalidateExpenses();
    },
    onError: (e) => {
      if (e instanceof ApiError) toast.error(e.messages.join(", "));
    },
  });

  const promptReject = (id: string) => {
    const reason = window.prompt("Reject reason (optional)");
    if (reason === null) return;
    reject.mutate({ id, reason: reason.trim() || undefined });
  };

  const categoryMax = useMemo(() => {
    const rows = summary.data?.byCategory ?? [];
    return Math.max(1, ...rows.map((r) => r.total));
  }, [summary.data]);

  const tabs = useMemo(
    () =>
      [
        ["dashboard", "Dashboard"],
        ["expenses", "Expenses"],
        ["approvals", "Approvals"],
        ["petty", "Petty cash"],
      ] as const,
    [],
  );

  const loadingShell =
    (deskTab === "dashboard" && summary.isLoading) ||
    (deskTab === "expenses" && list.isLoading && categories.isLoading) ||
    (deskTab === "approvals" && pending.isLoading) ||
    (deskTab === "petty" && pettyCash.isLoading);

  if (loadingShell && !summary.data && !list.data && !pending.data && !pettyCash.data) {
    return <PageSkeleton rows={8} />;
  }

  const renderActions = (e: ExpenseRow) => {
    const href = mediaUrl(e.receiptUrl);
    return (
      <div className="flex flex-wrap items-center justify-end gap-1">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="rounded-md px-2 py-1 text-[0.7rem] font-semibold text-[#1a56db] hover:bg-[#eef2f8]"
          >
            Receipt
          </a>
        ) : e.status === "pending" || e.status === "draft" ? (
          <label className="cursor-pointer rounded-md px-2 py-1 text-[0.7rem] font-semibold text-[#1a56db] hover:bg-[#eef2f8]">
            Attach
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(ev) => {
                const file = ev.target.files?.[0];
                if (file) attach.mutate({ id: e.id, file });
              }}
            />
          </label>
        ) : null}
        {allowFinance && e.status === "pending" ? (
          <>
            <Button
              type="button"
              size="sm"
              onClick={() => approve.mutate(e.id)}
              disabled={approve.isPending}
            >
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => promptReject(e.id)}
              disabled={reject.isPending}
            >
              Reject
            </Button>
          </>
        ) : null}
        {allowFinance && e.status === "approved" ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => voidExp.mutate(e.id)}
            disabled={voidExp.isPending}
          >
            Void
          </Button>
        ) : null}
        {e.status !== "approved" && e.status !== "voided" ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={remove.isPending}
            onClick={() => remove.mutate(e.id)}
          >
            Delete
          </Button>
        ) : null}
      </div>
    );
  };

  const expenseTable = (items: ExpenseRow[], emptyTitle: string, emptyDetail: string) => {
    if (!items.length) {
      return <EmptyState title={emptyTitle} detail={emptyDetail} />;
    }
    const totalPages = Math.max(1, Math.ceil(items.length / EXP_PAGE));
    const pageSafe = Math.min(expListPage, totalPages);
    const slice = items.slice((pageSafe - 1) * EXP_PAGE, pageSafe * EXP_PAGE);
    return (
      <div className="mt-3 overflow-hidden rounded-xl border border-[#d9e0ea]">
        <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#f5f7fb] text-[0.7rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
            <tr>
              <th className="px-3 py-2.5">Number</th>
              <th className="px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5">Category</th>
              <th className="px-3 py-2.5">Store</th>
              <th className="px-3 py-2.5 text-right">Amount</th>
              <th className="px-3 py-2.5 text-right">Tax</th>
              <th className="px-3 py-2.5 text-right">Total</th>
              <th className="px-3 py-2.5">Method</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Created by</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef2f7] bg-white">
            {slice.map((e) => (
              <tr key={e.id} className="hover:bg-[#fafbfd]">
                <td className="px-3 py-2 font-medium text-[#0b1f33]">
                  {e.expenseNumber ?? "—"}
                  {e.isPettyCash ? (
                    <span className="ml-1.5 text-[0.6rem] font-bold tracking-wide text-[#1a56db]">
                      PETTY
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 tabular-nums text-[#5a6b7d]">
                  {String(e.spentAt).slice(0, 10)}
                </td>
                <td className="px-3 py-2 text-[#0b1f33]">
                  {e.category?.name ?? "Uncategorised"}
                </td>
                <td className="px-3 py-2 text-[#5a6b7d]">
                  {e.location?.name ?? "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {money(expenseNet(e))}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[#5a6b7d]">
                  {money(expenseTax(e))}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-[#0b1f33]">
                  {money(expenseTotal(e))}
                </td>
                <td className="px-3 py-2 text-[#5a6b7d]">
                  {methodLabel(e.paymentMethod)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ring-1 ring-inset capitalize",
                      statusBadgeClass(e.status),
                    )}
                  >
                    {e.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-[#5a6b7d]">
                  {e.createdBy?.fullName ?? "—"}
                </td>
                <td className="px-3 py-2 text-right">{renderActions(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <TablePager
          page={pageSafe}
          totalPages={totalPages}
          total={items.length}
          pageSize={EXP_PAGE}
          onPage={setExpListPage}
        />
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Expense Management"
        subtitle="Track shop costs, approvals, receipts, and petty cash — Universal POS."
      />

      <div className="flex gap-1 rounded-[12px] bg-[#eef2f8] p-1 sm:w-fit">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setDeskTab(id);
              setExpListPage(1);
            }}
            className={cn(
              "rounded-[8px] px-3.5 py-1.5 text-xs font-semibold transition-colors",
              deskTab === id
                ? "bg-white text-[#0b1f33] shadow-sm"
                : "text-[#5a6b7d] hover:text-[#0b1f33]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {deskTab === "dashboard" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {(
              [
                ["Today", summary.data?.todayTotal ?? 0],
                ["This month", summary.data?.monthTotal ?? 0],
                ["Pending", summary.data?.pendingTotal ?? 0],
                ["Approved", summary.data?.approvedTotal ?? 0],
                ["Rejected", summary.data?.rejectedTotal ?? 0],
                ["Petty cash", summary.data?.pettyCashBalance ?? 0],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-[#d9e0ea] bg-white px-4 py-3"
              >
                <p className="text-[0.7rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
                  {label}
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-[#0b1f33]">
                  {money(value)}
                </p>
              </div>
            ))}
          </div>

          <section className="rounded-xl border border-[#d9e0ea] bg-white p-4">
            <h2 className="text-sm font-semibold text-[#0b1f33]">
              By category
            </h2>
            <p className="mt-0.5 text-xs text-[#5a6b7d]">
              Approved spend in the current summary window.
            </p>
            {!(summary.data?.byCategory?.length) ? (
              <EmptyState
                title="No category totals yet"
                detail="Record and approve expenses to see the breakdown."
              />
            ) : (
              <ul className="mt-4 space-y-2.5">
                {summary.data.byCategory.map((row) => (
                  <li key={row.categoryId ?? row.name} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-[#0b1f33]">
                        {row.name}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-[#0b1f33]">
                        {money(row.total)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#eef2f8]">
                      <div
                        className="h-full rounded-full bg-[#1a56db]"
                        style={{
                          width: `${Math.max(4, (row.total / categoryMax) * 100)}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {deskTab === "expenses" ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
          <section className="space-y-4 rounded-xl border border-[#d9e0ea] bg-white p-4">
            <h2 className="text-sm font-semibold text-[#0b1f33]">Add expense</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={spentAt}
                  onChange={(e) => {
                    setSpentAt(e.target.value);
                    setFieldErrors((f) => ({ ...f, spentAt: "" }));
                  }}
                />
                <FieldError message={fieldErrors.spentAt} />
              </div>
              <div>
                <Label>Category</Label>
                <Select
                  className="mt-1"
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    setFieldErrors((f) => ({ ...f, categoryId: "" }));
                  }}
                >
                  <option value="">—</option>
                  {(categories.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.receiptRequired ? " · receipt req." : ""}
                    </option>
                  ))}
                </Select>
                <FieldError message={fieldErrors.categoryId} />
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
                <Label>Amount</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  className="mt-1"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setFieldErrors((f) => ({ ...f, amount: "" }));
                  }}
                />
                <FieldError message={fieldErrors.amount} />
              </div>
              <div>
                <Label>Payment method</Label>
                <Select
                  className="mt-1"
                  value={paymentMethod}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPaymentMethod(v);
                    setFieldErrors((f) => ({ ...f, paymentMethod: "" }));
                    if (v === "petty_cash") setPetty(true);
                  }}
                >
                  {PAYMENT_METHODS.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </Select>
                <FieldError message={fieldErrors.paymentMethod} />
              </div>
              <div>
                <Label>Payee</Label>
                <Input
                  className="mt-1"
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  placeholder="Vendor / person"
                />
                <FieldError message={fieldErrors.payee} />
              </div>
              <div>
                <Label>Reference</Label>
                <Input
                  className="mt-1"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Invoice # / UTR"
                />
              </div>
              <div>
                <Label>Receipt</Label>
                <Input
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  className="mt-1"
                  onChange={(e) =>
                    setReceiptFile(e.target.files?.[0] ?? null)
                  }
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
              <FieldError message={fieldErrors.notes} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-[#0b1f33]">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={taxable}
                  onChange={(e) => setTaxable(e.target.checked)}
                />
                Taxable
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={petty || paymentMethod === "petty_cash"}
                  onChange={(e) => {
                    setPetty(e.target.checked);
                    if (e.target.checked) setPaymentMethod("petty_cash");
                    else if (paymentMethod === "petty_cash")
                      setPaymentMethod("cash");
                  }}
                />
                Petty cash
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={reimbursement}
                  onChange={(e) => setReimbursement(e.target.checked)}
                />
                Reimbursement
              </label>
              {allowFinance ? (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={receiptOverride}
                    onChange={(e) => setReceiptOverride(e.target.checked)}
                  />
                  Receipt override
                </label>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={create.isPending || !amount}
                onClick={() => create.mutate(false)}
              >
                {create.isPending ? "Saving…" : "Submit"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={create.isPending || !amount}
                onClick={() => create.mutate(true)}
              >
                Save draft
              </Button>
            </div>

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
                  disabled={
                    !newCat.trim() || addCat.isPending || !allowFinance
                  }
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
                disabled={seed.isPending || !allowFinance}
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
              <div>
                <Label className="text-xs">Status</Label>
                <Select
                  className="mt-1 h-9"
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as StatusFilter)
                  }
                >
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <Select
                  className="mt-1 h-9"
                  value={filterCategoryId}
                  onChange={(e) => setFilterCategoryId(e.target.value)}
                >
                  <option value="">All</option>
                  {(allCategories.data ?? categories.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label className="text-xs">Location</Label>
                <Select
                  className="mt-1 h-9"
                  value={filterLocationId}
                  onChange={(e) => setFilterLocationId(e.target.value)}
                >
                  <option value="">All</option>
                  {(locations.data ?? []).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
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

            {list.isLoading ? (
              <p className="mt-6 text-sm text-[#5a6b7d]">Loading expenses…</p>
            ) : (
              expenseTable(
                list.data?.items ?? [],
                "No expenses in range",
                "Adjust filters or add an expense on the left.",
              )
            )}
          </section>
        </div>
      ) : null}

      {deskTab === "approvals" ? (
        <section className="rounded-xl border border-[#d9e0ea] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[#0b1f33]">
                Pending approvals
              </h2>
              <p className="text-xs text-[#5a6b7d]">
                {allowFinance
                  ? "Approve or reject with an optional reason."
                  : "Finance role required to approve or reject."}
              </p>
            </div>
            <p className="text-sm font-semibold tabular-nums text-[#0b1f33]">
              {pending.data?.count ?? pending.data?.items?.length ?? 0} pending
            </p>
          </div>
          {pending.isLoading ? (
            <p className="mt-6 text-sm text-[#5a6b7d]">Loading…</p>
          ) : (
            expenseTable(
              pending.data?.items ?? [],
              "Nothing pending",
              "Submitted expenses awaiting finance review will appear here.",
            )
          )}
        </section>
      ) : null}

      {deskTab === "petty" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">Location</Label>
              <Select
                className="mt-1 h-9 min-w-[10rem]"
                value={pettyLocationId}
                onChange={(e) => setPettyLocationId(e.target.value)}
              >
                <option value="">Tenant default</option>
                {(locations.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="rounded-xl border border-[#d9e0ea] bg-white px-4 py-2.5">
              <p className="text-[0.65rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
                Balance
              </p>
              <p className="text-xl font-semibold tabular-nums text-[#0b1f33]">
                {money(pettyCash.data?.balance ?? 0)}
              </p>
              <p className="text-[0.7rem] text-[#5a6b7d]">
                {pettyCash.data?.name ?? "Petty cash"}
              </p>
            </div>
          </div>

          {(pettyCash.data?.balance ?? 0) === 0 ? (
            <section className="rounded-xl border border-[#d9e0ea] bg-white p-4">
              <h2 className="text-sm font-semibold text-[#0b1f33]">
                Opening balance
              </h2>
              <p className="mt-0.5 text-xs text-[#5a6b7d]">
                Fund the float once. This is not an expense.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-1"
                    value={openingAmount}
                    onChange={(e) => setOpeningAmount(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input
                    className="mt-1"
                    value={openingNotes}
                    onChange={(e) => setOpeningNotes(e.target.value)}
                  />
                </div>
              </div>
              <Button
                type="button"
                className="mt-3"
                disabled={
                  !allowFinance ||
                  openPetty.isPending ||
                  !openingAmount ||
                  Number(openingAmount) <= 0
                }
                onClick={() => openPetty.mutate()}
              >
                {openPetty.isPending ? "Opening…" : "Set opening balance"}
              </Button>
            </section>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-[#d9e0ea] bg-white p-4">
              <h2 className="text-sm font-semibold text-[#0b1f33]">
                Replenishment
              </h2>
              <p className="mt-0.5 text-xs font-medium text-[#1a56db]">
                Not an expense — top-up to the petty cash fund only.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-1"
                    value={replenishAmount}
                    onChange={(e) => setReplenishAmount(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Source method</Label>
                  <Select
                    className="mt-1"
                    value={replenishMethod}
                    onChange={(e) => setReplenishMethod(e.target.value)}
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="upi">UPI</option>
                    <option value="other">Other</option>
                  </Select>
                </div>
                <div>
                  <Label>Reference</Label>
                  <Input
                    className="mt-1"
                    value={replenishRef}
                    onChange={(e) => setReplenishRef(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input
                    className="mt-1"
                    value={replenishNotes}
                    onChange={(e) => setReplenishNotes(e.target.value)}
                  />
                </div>
              </div>
              <Button
                type="button"
                className="mt-3"
                disabled={
                  !allowFinance ||
                  replenish.isPending ||
                  !replenishAmount ||
                  Number(replenishAmount) <= 0
                }
                onClick={() => replenish.mutate()}
              >
                {replenish.isPending ? "Saving…" : "Replenish fund"}
              </Button>
            </section>

            {allowFinance ? (
              <section className="rounded-xl border border-[#d9e0ea] bg-white p-4">
                <h2 className="text-sm font-semibold text-[#0b1f33]">
                  Adjust (finance)
                </h2>
                <p className="mt-0.5 text-xs text-[#5a6b7d]">
                  Manual credit or debit with a required note.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="mt-1"
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Direction</Label>
                    <Select
                      className="mt-1"
                      value={adjustDirection}
                      onChange={(e) =>
                        setAdjustDirection(
                          e.target.value as "credit" | "debit",
                        )
                      }
                    >
                      <option value="credit">Credit (add)</option>
                      <option value="debit">Debit (remove)</option>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Notes (required)</Label>
                    <Input
                      className="mt-1"
                      value={adjustNotes}
                      onChange={(e) => setAdjustNotes(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-3"
                  disabled={
                    adjust.isPending ||
                    !adjustAmount ||
                    Number(adjustAmount) <= 0 ||
                    !adjustNotes.trim()
                  }
                  onClick={() => adjust.mutate()}
                >
                  {adjust.isPending ? "Saving…" : "Post adjustment"}
                </Button>
              </section>
            ) : null}
          </div>

          <section className="rounded-xl border border-[#d9e0ea] bg-white p-4">
            <h2 className="text-sm font-semibold text-[#0b1f33]">Ledger</h2>
            {!(pettyLedger.data?.items?.length) ? (
              <EmptyState
                title="No ledger entries"
                detail="Opening, replenishments, expenses, and adjustments appear here."
              />
            ) : (
              <div className="mt-3 overflow-x-auto rounded-xl border border-[#d9e0ea]">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#f5f7fb] text-[0.7rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
                    <tr>
                      <th className="px-3 py-2.5">Date</th>
                      <th className="px-3 py-2.5">Type</th>
                      <th className="px-3 py-2.5">Ref</th>
                      <th className="px-3 py-2.5 text-right">Debit</th>
                      <th className="px-3 py-2.5 text-right">Credit</th>
                      <th className="px-3 py-2.5 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eef2f7] bg-white">
                    {pettyLedger.data.items.map((row) => {
                      const isDebit = row.direction === "debit";
                      const isCredit = row.direction === "credit";
                      return (
                        <tr key={row.id} className="hover:bg-[#fafbfd]">
                          <td className="px-3 py-2 tabular-nums text-[#5a6b7d]">
                            {String(row.createdAt).slice(0, 10)}
                          </td>
                          <td className="px-3 py-2 capitalize text-[#0b1f33]">
                            {row.kind.replace(/_/g, " ")}
                          </td>
                          <td className="px-3 py-2 text-[#5a6b7d]">
                            {row.reference || row.notes || "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#0b1f33]">
                            {isDebit ? money(row.amount) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#0b1f33]">
                            {isCredit ? money(row.amount) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-[#0b1f33]">
                            {money(row.balanceAfter)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
