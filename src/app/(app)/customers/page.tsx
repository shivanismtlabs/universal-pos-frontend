"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { customersApi, customFieldsApi, subscriptionsApi } from "@/lib/api";
import {
  CUSTOM_FIELD_QUERY,
  customFieldDefsToMeta,
} from "@/lib/product-form-fields";
import { CustomFieldsSection } from "@/components/custom-field-inputs";
import { ApiError } from "@/lib/api/client";
import {
  createCustomerSchema,
  createMeasurementSchema,
  parseCreditLimit,
  type CreateCustomerInput,
  type CreateMeasurementInput,
} from "@/lib/validations";
import { filterPersonNameInput } from "@/lib/input-guards";
import {
  GETTING_STARTED_PATH,
  readReturnToParam,
  resolveSetupReturnTo,
} from "@/lib/setup-return";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/form";
import { cn, formatDate } from "@/lib/utils";
import { useBootstrap } from "@/lib/bootstrap";
import { useAuthStore } from "@/lib/auth-store";
import { EntityRowActions } from "@/components/entity-row-actions";
import { TablePager } from "@/components/table-pager";
import { pagerFromMeta } from "@/lib/use-paged-list";
import { CustomerCrmPanel } from "@/components/customer-crm-panel";
import { PhoneCountryInput } from "@/components/phone-country-input";
import { ModalFrame } from "@/components/modal-frame";

function numOrUndef(v: unknown) {
  if (v === "" || v === undefined || v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function MeasureValue({ label, value }: { label: string; value: unknown }) {
  const text =
    value === null || value === undefined || value === ""
      ? "—"
      : String(value);
  return (
    <div className="min-w-0">
      <p className="text-[0.65rem] font-semibold tracking-wide text-[#8b9bb0] uppercase">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium tabular-nums text-[#0b1f33]">
        {text}
      </p>
    </div>
  );
}

type CustomerListItem = {
  id: string;
  fullName: string;
  phone: string;
  email?: string | null;
  eventDate?: string | null;
  marketingOptIn?: boolean;
  loyaltyPoints?: number;
  storeCreditBalance?: string | number;
};

function CustomerMobileCard({
  customer: c,
  active,
  money,
  canLead,
  onSelect,
  onEdit,
  onSoftDelete,
}: {
  customer: CustomerListItem;
  active: boolean;
  money: (n: number) => string;
  canLead: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onSoftDelete: () => void;
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "rounded-lg border p-3 text-left transition-colors",
        active
          ? "border-[#1a56db] bg-[#eef4ff]"
          : "border-[#e4e9f0] bg-white active:bg-[#fafcfe]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[#0b1f33]">{c.fullName}</p>
          {c.marketingOptIn ? (
            <p className="mt-0.5 text-[0.65rem] font-medium text-[#1a56db]">
              Marketing opt-in
            </p>
          ) : null}
          <p className="mt-1 text-sm tabular-nums text-[#475569]">{c.phone}</p>
          {c.email ? (
            <p className="truncate text-sm text-[#5a6b7d]">{c.email}</p>
          ) : null}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <EntityRowActions
            onEdit={onEdit}
            onSoftDelete={canLead ? onSoftDelete : undefined}
            softDeleteTitle="Remove"
            deleteHidden
          />
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <dt className="text-[#8b9bb0]">Loyalty</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-[#475569]">
            {typeof c.loyaltyPoints === "number"
              ? `${c.loyaltyPoints} pts`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[#8b9bb0]">Wallet</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-[#475569]">
            {c.storeCreditBalance != null
              ? money(Number(c.storeCreditBalance))
              : "—"}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[#8b9bb0]">Anniversary</dt>
          <dd className="mt-0.5 font-medium text-[#5a6b7d]">
            {c.eventDate ? formatDate(c.eventDate) : "—"}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export default function CustomersPage() {
  return (
    <Suspense
      fallback={
        <p className="px-4 py-8 text-sm text-[#5a6b7d]">Loading customers…</p>
      }
    >
      <CustomersPageInner />
    </Suspense>
  );
}

function CustomersPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const returnTo = readReturnToParam(searchParams);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [extraFields, setExtraFields] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const { hasModule, hasMode, money } = useBootstrap();
  const rental = hasModule("rental");
  const hasSub = hasMode("subscription");
  const pageTab =
    searchParams.get("tab") === "memberships" && hasSub
      ? "memberships"
      : "directory";
  const canLead = useAuthStore((s) =>
    (s.user?.roles ?? []).some((r) => r === "admin" || r === "manager"),
  );
  const pageSize = 30;

  useEffect(() => {
    const id = searchParams.get("id");
    const qq = searchParams.get("q");
    if (id) setSelectedId(id);
    if (qq) {
      setQ(qq);
      setDebouncedQ(qq.trim());
    }
  }, [searchParams]);

  function selectPageTab(id: "directory" | "memberships") {
    const params = new URLSearchParams(searchParams.toString());
    if (id === "memberships") params.set("tab", "memberships");
    else params.delete("tab");
    const qs = params.toString();
    router.replace(qs ? `/customers?${qs}` : "/customers", { scroll: false });
  }

  function selectCustomer(id: string | null) {
    setSelectedId(id);
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("id", id);
    else params.delete("id");
    const qs = params.toString();
    router.replace(qs ? `/customers?${qs}` : "/customers", { scroll: false });
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 280);
    return () => window.clearTimeout(t);
  }, [q]);

  const list = useQuery({
    queryKey: ["customers", debouncedQ, page],
    queryFn: () =>
      customersApi.list({
        q: debouncedQ || undefined,
        page,
        limit: pageSize,
      }),
    placeholderData: (prev) => prev,
  });

  const items = list.data?.items ?? [];
  const meta = list.data?.meta;
  const total = meta?.total ?? items.length;

  const members = useQuery({
    queryKey: ["subscriptions-members-customers"],
    queryFn: () => subscriptionsApi.list({ limit: 80 }),
    enabled: hasSub && pageTab === "memberships",
  });

  const selectedDetail = useQuery({
    queryKey: ["customer", selectedId],
    queryFn: () => customersApi.get(selectedId!),
    enabled: Boolean(selectedId),
  });

  const customerFieldsQ = useQuery({
    queryKey: ["custom-fields", "customer"],
    queryFn: () => customFieldsApi.listDefinitions("customer"),
    ...CUSTOM_FIELD_QUERY,
  });
  const customerFormFields = useMemo(
    () => customFieldDefsToMeta(customerFieldsQ.data),
    [customerFieldsQ.data],
  );

  const selected = useMemo(() => {
    const fromPage = items.find((c) => c.id === selectedId);
    if (fromPage) return fromPage;
    const row = selectedDetail.data;
    if (!row || !selectedId) return null;
    return {
      id: String(row.id),
      fullName: String(row.fullName ?? ""),
      phone: String(row.phone ?? ""),
      email: (row.email as string | null | undefined) ?? null,
      eventDate: (row.eventDate as string | null | undefined) ?? null,
      notes: (row.notes as string | null | undefined) ?? null,
    };
  }, [items, selectedId, selectedDetail.data]);

  const measurements = useQuery({
    queryKey: ["measurements", selectedId],
    queryFn: () => customersApi.listMeasurements(selectedId!),
    enabled: Boolean(selectedId) && rental,
  });

  const form = useForm<CreateCustomerInput>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      email: "",
      eventDate: "",
      dateOfBirth: "",
      notes: "",
      marketingOptIn: false,
      creditLimit: "",
    },
  });

  const measureForm = useForm<CreateMeasurementInput>({
    resolver: zodResolver(createMeasurementSchema) as never,
    defaultValues: {
      heightCm: undefined,
      weightKg: undefined,
      chest: undefined,
      waist: undefined,
      inseam: undefined,
      sleeve: undefined,
      shoeSize: "",
    },
  });

  const create = useMutation({
    mutationFn: (values: CreateCustomerInput) =>
      customersApi.create({
        fullName: values.fullName,
        phone: values.phone,
        email: values.email || undefined,
        eventDate: values.eventDate || undefined,
        dateOfBirth: values.dateOfBirth || undefined,
        notes: values.notes || undefined,
        marketingOptIn: values.marketingOptIn,
        creditLimit: parseCreditLimit(values.creditLimit),
        extraFields: Object.fromEntries(
          Object.entries(extraFields).filter(([, v]) => String(v ?? "").trim()),
        ),
      }),
    onSuccess: (row) => {
      toast.success(
        returnTo ? "Customer created — back to Getting Started" : "Customer created",
      );
      form.reset();
      setExtraFields({});
      setFormOpen(false);
      setEditingId(null);
      if (returnTo) {
        router.push(resolveSetupReturnTo(returnTo, GETTING_STARTED_PATH));
        return;
      }
      selectCustomer(row.id);
      void qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Create failed",
      ),
  });

  const update = useMutation({
    mutationFn: (values: CreateCustomerInput) => {
      if (!editingId) throw new Error("No customer");
      return customersApi.update(editingId, {
        fullName: values.fullName,
        phone: values.phone,
        email: values.email || undefined,
        eventDate: values.eventDate || undefined,
        dateOfBirth: values.dateOfBirth || undefined,
        notes: values.notes || undefined,
        marketingOptIn: values.marketingOptIn,
        creditLimit: parseCreditLimit(values.creditLimit),
        extraFields: Object.fromEntries(
          Object.entries(extraFields).filter(([, v]) => String(v ?? "").trim()),
        ),
      });
    },
    onSuccess: () => {
      toast.success("Customer updated");
      setEditingId(null);
      setFormOpen(false);
      setExtraFields({});
      form.reset({
        fullName: "",
        phone: "",
        email: "",
        eventDate: "",
        dateOfBirth: "",
        notes: "",
        marketingOptIn: false,
        creditLimit: "",
      });
      void qc.invalidateQueries({ queryKey: ["customers"] });
      void qc.invalidateQueries({ queryKey: ["customer", selectedId] });
      void qc.invalidateQueries({ queryKey: ["customer-crm", selectedId] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Update failed",
      ),
  });

  const softDelete = useMutation({
    mutationFn: (id: string) => customersApi.softDelete(id),
    onSuccess: (_res, id) => {
      toast.success("Customer removed");
      if (selectedId === id) selectCustomer(null);
      if (editingId === id) setEditingId(null);
      void qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Remove failed",
      ),
  });

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    form.reset({
      fullName: "",
      phone: "",
      email: "",
      eventDate: "",
      dateOfBirth: "",
      notes: "",
      marketingOptIn: false,
      creditLimit: "",
    });
    setExtraFields({});
  }

  function openNewCustomer() {
    setEditingId(null);
    form.reset({
      fullName: "",
      phone: "",
      email: "",
      eventDate: "",
      dateOfBirth: "",
      notes: "",
      marketingOptIn: false,
      creditLimit: "",
    });
    setExtraFields({});
    setFormOpen(true);
  }

  function startEdit(c: {
    id: string;
    fullName: string;
    phone: string;
    email?: string | null;
    eventDate?: string | null;
    dateOfBirth?: string | null;
    notes?: string | null;
    marketingOptIn?: boolean;
    creditLimit?: number | string | null;
  }) {
    selectCustomer(c.id);
    setEditingId(c.id);
    form.reset({
      fullName: c.fullName,
      phone: c.phone,
      email: c.email ?? "",
      eventDate: c.eventDate
        ? String(c.eventDate).slice(0, 10)
        : "",
      dateOfBirth: c.dateOfBirth
        ? String(c.dateOfBirth).slice(0, 10)
        : "",
      notes: c.notes ?? "",
      marketingOptIn: Boolean(c.marketingOptIn),
      creditLimit:
        c.creditLimit != null && String(c.creditLimit) !== ""
          ? String(c.creditLimit)
          : "",
    });
    const raw =
      selectedDetail.data?.id === c.id
        ? selectedDetail.data.extraFields
        : undefined;
    const extras: Record<string, string> = {};
    if (raw && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw)) {
        if (v != null) extras[k] = String(v);
      }
    }
    setExtraFields(extras);
    setFormOpen(true);
  }

  const addMeasurement = useMutation({
    mutationFn: (values: CreateMeasurementInput) => {
      if (!selectedId) throw new Error("Select a customer");
      return customersApi.addMeasurement(selectedId, {
        heightCm: numOrUndef(values.heightCm),
        weightKg: numOrUndef(values.weightKg),
        chest: numOrUndef(values.chest),
        waist: numOrUndef(values.waist),
        inseam: numOrUndef(values.inseam),
        sleeve: numOrUndef(values.sleeve),
        shoeSize: values.shoeSize || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Measurement saved");
      measureForm.reset();
      void qc.invalidateQueries({ queryKey: ["measurements", selectedId] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Measurement failed",
      ),
  });

  return (
    <div className="space-y-4 px-3 pb-4 sm:px-4">
      <header className="flex flex-col gap-2 border-b border-[#eef1f4] pb-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Customers &amp; Perks</p>
          <h1 className="page-title mt-1">Customers</h1>
          <p className="page-subtitle mt-1.5">
            Directory for any shop — contacts, loyalty, wallet, and purchase
            history.
          </p>
        </div>
        <p className="text-caption shrink-0 text-[#5a6b7d]">
          {list.isLoading
            ? "Loading…"
            : `${total.toLocaleString()} customer${total === 1 ? "" : "s"}`}
        </p>
      </header>

      {hasSub ? (
        <div
          role="tablist"
          aria-label="Customers"
          className="flex flex-wrap gap-1 border-b border-[#eef1f4]"
        >
          {(
            [
              ["directory", "Directory"],
              ["memberships", "Memberships"],
            ] as const
          ).map(([id, label]) => {
            const active = pageTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectPageTab(id)}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "border-[#1a56db] text-[#1a56db]"
                    : "border-transparent text-[#5a6b7d] hover:text-[#0b1f33]",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

      {pageTab === "memberships" ? (
        <section className="overflow-hidden rounded-lg border border-[#e4e9f0] bg-white">
          <div className="flex flex-col gap-2 border-b border-[#eef1f4] px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-4">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[#0b1f33]">
                Memberships
              </h2>
              <p className="text-xs text-[#5a6b7d]">
                Active and past subscription plans
              </p>
            </div>
            <Button asChild size="sm" className="w-full sm:w-auto">
              <Link href="/counter?view=subscription">Enroll at counter</Link>
            </Button>
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[#eef1f4] bg-[#f7f9fb] text-[0.7rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
                <tr>
                  <th className="px-3 py-2.5">Customer</th>
                  <th className="px-3 py-2.5">Plan</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Valid through</th>
                </tr>
              </thead>
              <tbody>
                {(members.data?.items ?? []).map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-[#f0f3f7] hover:bg-[#fafcfe]"
                  >
                    <td className="px-3 py-2.5 font-medium text-[#0b1f33]">
                      {m.customer?.fullName ?? "Customer"}
                    </td>
                    <td className="px-3 py-2.5 text-[#5a6b7d]">
                      {m.plan?.title ?? "Plan"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="rounded bg-[#f1f5f9] px-1.5 py-0.5 text-[0.7rem] font-medium capitalize text-[#475569]">
                        {m.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#5a6b7d]">
                      {formatDate(m.currentPeriodEnd)}
                    </td>
                  </tr>
                ))}
                {members.isLoading ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-8 text-center text-[#5a6b7d]"
                    >
                      Loading memberships…
                    </td>
                  </tr>
                ) : null}
                {!members.isLoading && !(members.data?.items ?? []).length ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-10 text-center text-[#5a6b7d]"
                    >
                      No memberships yet. Enroll from the counter Plans tab.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 p-3 md:hidden">
            {(members.data?.items ?? []).map((m) => (
              <li
                key={m.id}
                className="rounded-lg border border-[#eef1f4] bg-[#f8fafc] p-3"
              >
                <p className="font-semibold text-[#0b1f33]">
                  {m.customer?.fullName ?? "Customer"}
                </p>
                <p className="mt-0.5 text-sm text-[#5a6b7d]">
                  {m.plan?.title ?? "Plan"}
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="rounded bg-[#f1f5f9] px-1.5 py-0.5 font-medium capitalize text-[#475569]">
                    {m.status}
                  </span>
                  <span className="tabular-nums text-[#5a6b7d]">
                    Valid through {formatDate(m.currentPeriodEnd)}
                  </span>
                </div>
              </li>
            ))}
            {members.isLoading ? (
              <li className="py-8 text-center text-sm text-[#5a6b7d]">
                Loading memberships…
              </li>
            ) : null}
            {!members.isLoading && !(members.data?.items ?? []).length ? (
              <li className="rounded-lg border border-dashed border-[#dce3ec] px-4 py-10 text-center text-sm text-[#5a6b7d]">
                No memberships yet. Enroll from the counter Plans tab.
              </li>
            ) : null}
          </ul>
        </section>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <label className="relative min-w-0 flex-1 sm:min-w-[14rem]">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#8b9bb0]" />
              <Input
                className="h-9 pl-9"
                placeholder="Search name, phone, or email"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <Button
              type="button"
              className="h-9 w-full shrink-0 sm:w-auto"
              onClick={openNewCustomer}
            >
              <Plus className="mr-1 size-4" />
              New Customer
            </Button>
          </div>

          <div className="hidden overflow-x-auto rounded-lg border border-[#e4e9f0] bg-white md:block">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-[#eef1f4] bg-[#f7f9fb] text-[0.7rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
                <tr>
                  <th className="px-3 py-2.5">Customer</th>
                  <th className="px-3 py-2.5">Phone</th>
                  <th className="px-3 py-2.5">Email</th>
                  <th className="px-3 py-2.5 text-right">Loyalty</th>
                  <th className="px-3 py-2.5 text-right">Wallet</th>
                  <th className="px-3 py-2.5">Anniversary</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.isLoading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-8 text-center text-[#5a6b7d]"
                    >
                      Loading customers…
                    </td>
                  </tr>
                ) : list.isError ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-8 text-center text-[#c81e1e]"
                    >
                      Could not load customers.{" "}
                      <button
                        type="button"
                        className="font-semibold underline"
                        onClick={() => void list.refetch()}
                      >
                        Retry
                      </button>
                    </td>
                  </tr>
                ) : !items.length ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-10 text-center text-[#5a6b7d]"
                    >
                      No customers yet.{" "}
                      <button
                        type="button"
                        className="font-semibold text-[#1a56db] hover:underline"
                        onClick={openNewCustomer}
                      >
                        Add your first customer
                      </button>
                    </td>
                  </tr>
                ) : (
                  items.map((c) => {
                    const active = selectedId === c.id;
                    return (
                      <tr
                        key={c.id}
                        className={cn(
                          "cursor-pointer border-b border-[#f0f3f7] transition-colors",
                          active
                            ? "bg-[#eef4ff]"
                            : "hover:bg-[#fafcfe]",
                        )}
                        onClick={() => selectCustomer(c.id)}
                      >
                        <td className="px-3 py-2.5">
                          <p className="font-semibold text-[#0b1f33]">
                            {c.fullName}
                          </p>
                          {c.marketingOptIn ? (
                            <p className="mt-0.5 text-[0.65rem] font-medium text-[#1a56db]">
                              Marketing opt-in
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-[#475569]">
                          {c.phone}
                        </td>
                        <td className="px-3 py-2.5 text-[#475569]">
                          {c.email ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[#475569]">
                          {typeof c.loyaltyPoints === "number"
                            ? `${c.loyaltyPoints} pts`
                            : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[#475569]">
                          {c.storeCreditBalance != null
                            ? money(Number(c.storeCreditBalance))
                            : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-[#5a6b7d]">
                          {c.eventDate ? formatDate(c.eventDate) : "—"}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <EntityRowActions
                            onEdit={() => startEdit(c)}
                            onSoftDelete={
                              canLead
                                ? () => {
                                    if (
                                      confirm(
                                        `Remove customer "${c.fullName}"? This is a soft delete.`,
                                      )
                                    ) {
                                      softDelete.mutate(c.id);
                                    }
                                  }
                                : undefined
                            }
                            softDeleteTitle="Remove"
                            deleteHidden
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 md:hidden">
            {list.isLoading ? (
              <p className="rounded-lg border border-[#e4e9f0] bg-white px-4 py-8 text-center text-sm text-[#5a6b7d]">
                Loading customers…
              </p>
            ) : list.isError ? (
              <p className="rounded-lg border border-[#e4e9f0] bg-white px-4 py-8 text-center text-sm text-[#c81e1e]">
                Could not load customers.{" "}
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => void list.refetch()}
                >
                  Retry
                </button>
              </p>
            ) : !items.length ? (
              <div className="rounded-lg border border-[#e4e9f0] bg-white px-4 py-10 text-center text-sm text-[#5a6b7d]">
                No customers yet.{" "}
                <button
                  type="button"
                  className="font-semibold text-[#1a56db] hover:underline"
                  onClick={openNewCustomer}
                >
                  Add your first customer
                </button>
              </div>
            ) : (
              items.map((c) => (
                <CustomerMobileCard
                  key={c.id}
                  customer={c}
                  active={selectedId === c.id}
                  money={money}
                  canLead={canLead}
                  onSelect={() => selectCustomer(c.id)}
                  onEdit={() => startEdit(c)}
                  onSoftDelete={() => {
                    if (
                      confirm(
                        `Remove customer "${c.fullName}"? This is a soft delete.`,
                      )
                    ) {
                      softDelete.mutate(c.id);
                    }
                  }}
                />
              ))
            )}
          </div>

          {total ? (
            <TablePager
              {...pagerFromMeta(meta, page, pageSize, setPage, items.length)}
            />
          ) : null}

          {selectedId ? (
            <CustomerCrmPanel customerId={selectedId} />
          ) : (
            <div className="rounded-lg border border-dashed border-[#dce3ec] bg-[#f8fafc] px-5 py-8 text-center">
              <p className="text-sm font-medium text-[#0b1f33]">
                Select a customer
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-[#5a6b7d]">
                Click a row to view purchases, dues, loyalty, wallet, and notes.
              </p>
            </div>
          )}

          {rental && selectedId && selected ? (
            <section className="rounded-lg border border-[#e4e9f0] bg-white p-5">
              <div className="border-b border-[#eef1f4] pb-4">
                <p className="text-[0.65rem] font-semibold tracking-[0.1em] text-[#8b9bb0] uppercase">
                  Measurements
                </p>
                <h2 className="mt-1 text-base font-semibold text-[#0b1f33]">
                  {selected.fullName}
                </h2>
                <p className="mt-0.5 text-sm tabular-nums text-[#5a6b7d]">
                  {selected.phone}
                  {selected.eventDate
                    ? ` Â· Event ${formatDate(selected.eventDate)}`
                    : ""}
                </p>
              </div>

              <div className="mt-5 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <form
                  className="space-y-4"
                  onSubmit={measureForm.handleSubmit((v) =>
                    addMeasurement.mutate(v),
                  )}
                  noValidate
                >
                  <h3 className="text-sm font-semibold text-[#0b1f33]">
                    Add measurement
                  </h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {(
                      [
                        ["heightCm", "Height (cm)"],
                        ["weightKg", "Weight (kg)"],
                        ["chest", "Chest"],
                        ["waist", "Waist"],
                        ["inseam", "Inseam"],
                        ["sleeve", "Sleeve"],
                      ] as const
                    ).map(([name, label]) => (
                      <div key={name}>
                        <Label className="text-xs">{label}</Label>
                        <Input
                          className="mt-1 h-9"
                          type="number"
                          step="0.1"
                          inputMode="decimal"
                          {...measureForm.register(name)}
                        />
                      </div>
                    ))}
                    <div className="col-span-2 sm:col-span-1">
                      <Label className="text-xs">Shoe size</Label>
                      <Input
                        className="mt-1 h-9"
                        placeholder="e.g. 9"
                        {...measureForm.register("shoeSize")}
                      />
                    </div>
                  </div>
                  <FieldError
                    message={measureForm.formState.errors.heightCm?.message}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={addMeasurement.isPending}
                  >
                    {addMeasurement.isPending ? "Saving…" : "Save measurement"}
                  </Button>
                </form>

                <div>
                  <h3 className="text-sm font-semibold text-[#0b1f33]">
                    Fitting history
                  </h3>
                  <ul className="mt-3 max-h-[20rem] space-y-2 overflow-y-auto">
                    {(measurements.data ?? []).map((m) => (
                      <li
                        key={m.id}
                        className="rounded-lg border border-[#eef1f4] bg-[#f8fafc] p-3"
                      >
                        <p className="text-[0.65rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
                          {formatDate(m.takenAt)}
                        </p>
                        <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-4">
                          <MeasureValue label="Height" value={m.heightCm} />
                          <MeasureValue label="Weight" value={m.weightKg} />
                          <MeasureValue label="Chest" value={m.chest} />
                          <MeasureValue label="Waist" value={m.waist} />
                          <MeasureValue label="Inseam" value={m.inseam} />
                          <MeasureValue label="Sleeve" value={m.sleeve} />
                          <MeasureValue label="Shoe" value={m.shoeSize} />
                        </div>
                      </li>
                    ))}
                    {measurements.isLoading ? (
                      <li className="text-sm text-[#5a6b7d]">Loading…</li>
                    ) : null}
                    {!measurements.isLoading &&
                    !(measurements.data ?? []).length ? (
                      <li className="rounded-lg border border-dashed border-[#dce3ec] px-4 py-6 text-center text-sm text-[#5a6b7d]">
                        No measurements yet.
                      </li>
                    ) : null}
                  </ul>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      )}

      {formOpen ? (
        <ModalFrame
          title={editingId ? "Edit customer" : "New customer"}
          subtitle="Name and phone are required. Used at POS and for loyalty."
          onClose={closeForm}
          className="max-w-lg sm:rounded-xl"
          bodyScroll
          footer={
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={closeForm}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={create.isPending || update.isPending}
                onClick={form.handleSubmit((v) =>
                  editingId ? update.mutate(v) : create.mutate(v),
                )}
              >
                {create.isPending || update.isPending
                  ? "Saving…"
                  : editingId
                    ? "Save changes"
                    : "Create customer"}
              </Button>
            </div>
          }
        >
          <form
            className="space-y-4"
            onSubmit={(e) => e.preventDefault()}
            noValidate
          >
            <div>
              <Label>Full name</Label>
              <Input
                className="mt-1.5"
                value={form.watch("fullName")}
                onChange={(e) =>
                  form.setValue("fullName", filterPersonNameInput(e.target.value), {
                    shouldValidate: true,
                  })
                }
              />
              <FieldError message={form.formState.errors.fullName?.message} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <PhoneCountryInput
                  required
                  value={form.watch("phone")}
                  error={form.formState.errors.phone?.message}
                  onChange={(v) =>
                    form.setValue("phone", v, { shouldValidate: true })
                  }
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  className="mt-1.5"
                  type="email"
                  {...form.register("email")}
                />
                <FieldError message={form.formState.errors.email?.message} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Birthday</Label>
                <Input
                  className="mt-1.5"
                  type="date"
                  {...form.register("dateOfBirth")}
                />
              </div>
              <div>
                <Label>Anniversary / event</Label>
                <Input
                  className="mt-1.5"
                  type="date"
                  {...form.register("eventDate")}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-[#5a6b7d]">
              <input type="checkbox" {...form.register("marketingOptIn")} />
              Marketing / birthday opt-in
            </label>
            <div>
              <Label>Notes</Label>
              <Input className="mt-1.5" {...form.register("notes")} />
            </div>
            <div>
              <Label>Credit limit</Label>
              <Input
                className="mt-1.5"
                inputMode="decimal"
                placeholder="Blank = unlimited"
                {...form.register("creditLimit")}
              />
              <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                Blocks underpay at POS when open dues would exceed this amount
              </p>
            </div>
            <CustomFieldsSection
              hint="From Settings → Custom fields (Customer)."
              fields={customerFormFields}
              loading={customerFieldsQ.isLoading}
              values={extraFields}
              onChange={(key, value) =>
                setExtraFields((prev) => ({ ...prev, [key]: value }))
              }
            />
          </form>
        </ModalFrame>
      ) : null}
    </div>
  );
}

