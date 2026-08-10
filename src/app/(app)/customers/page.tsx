"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { customersApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import {
  createCustomerSchema,
  createMeasurementSchema,
  type CreateCustomerInput,
  type CreateMeasurementInput,
} from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/form";
import { formatDate } from "@/lib/utils";
import { FadeIn } from "@/components/motion";
import { cn } from "@/lib/utils";
import { useBootstrap } from "@/lib/bootstrap";
import { PageHeader } from "@/components/page-header";

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
      <p className="text-[0.65rem] font-semibold tracking-wide text-[#9ca3af] uppercase">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium text-[#111827] tabular-nums">
        {text}
      </p>
    </div>
  );
}

export default function CustomersPage() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const qc = useQueryClient();
  const { hasModule } = useBootstrap();
  const rental = hasModule("rental");
  const pageSize = 30;

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
  const totalPages = meta?.totalPages ?? 1;

  const selectedDetail = useQuery({
    queryKey: ["customer", selectedId],
    queryFn: () => customersApi.get(selectedId!),
    enabled: Boolean(selectedId),
  });

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
      notes: "",
      marketingOptIn: false,
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
        notes: values.notes || undefined,
        marketingOptIn: values.marketingOptIn,
      }),
    onSuccess: (row) => {
      toast.success("Customer created");
      form.reset();
      setSelectedId(row.id);
      void qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Create failed",
      ),
  });

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
    <div className="mx-auto max-w-6xl space-y-8">
      <FadeIn>
        <PageHeader
          title="Customers"
          subtitle="Customer directory for your shop. Search, add contacts, and review history."
          action={
            <p className="text-caption text-[var(--muted)]">
              {list.isLoading
                ? "Loading…"
                : `${total.toLocaleString()} customer${total === 1 ? "" : "s"}`}
            </p>
          }
        />
      </FadeIn>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
        {/* Client list — search + pages (never render the whole book) */}
        <FadeIn delay={0.04}>
          <section className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
            <div className="border-b border-[#e5e7eb] p-4 sm:p-5">
              <label className="relative block">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
                <Input
                  className="pl-10"
                  placeholder="Search name, phone, or email"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
              <p className="mt-2 text-[0.7rem] text-[#8b9bb0]">
                Showing {items.length} of {total.toLocaleString()}
                {debouncedQ ? ` for “${debouncedQ}”` : ""} · page {page} /{" "}
                {totalPages}
              </p>
            </div>

            <ul className="max-h-[28rem] divide-y divide-[#f3f4f6] overflow-y-auto">
              {items.map((c) => {
                const active = selectedId === c.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        "flex w-full flex-col gap-1 px-4 py-3.5 text-left transition sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5",
                        active
                          ? "bg-[#e8eefb]"
                          : "bg-white hover:bg-[#f9fafb]",
                      )}
                    >
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "truncate text-[0.95rem] font-semibold",
                            active ? "text-[#0b1f33]" : "text-[#111827]",
                          )}
                        >
                          {c.fullName}
                        </p>
                        <p className="mt-0.5 text-sm tabular-nums text-[#4b5563]">
                          {c.phone}
                        </p>
                      </div>
                      <div className="shrink-0 text-left sm:text-right">
                        {rental ? (
                          <>
                            <p className="text-[0.65rem] font-semibold tracking-wide text-[#9ca3af] uppercase">
                              Event
                            </p>
                            <p className="text-sm text-[#374151]">
                              {c.eventDate ? formatDate(c.eventDate) : "—"}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-[#6b7280]">{c.email ?? "—"}</p>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            {list.isLoading ? (
              <p className="px-5 py-8 text-sm text-[#6b7280]">Loading…</p>
            ) : null}
            {!list.isLoading && !items.length ? (
              <p className="px-5 py-8 text-sm text-[#6b7280]">
                No customers found
              </p>
            ) : null}

            {totalPages > 1 ? (
              <div className="flex items-center justify-between gap-2 border-t border-[#eef2f8] px-4 py-3">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1 || list.isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-[0.75rem] text-[#5a6b7d]">
                  Page {page} of {totalPages}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={page >= totalPages || list.isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </section>
        </FadeIn>

        {/* Add customer */}
        <FadeIn delay={0.08}>
          <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5 sm:p-6">
            <h2 className="display text-2xl text-[#111827]">Add customer</h2>
            <p className="mt-1 text-sm text-[#6b7280]">
              Name and phone are required
            </p>
            <form
              className="mt-5 space-y-4"
              onSubmit={form.handleSubmit((v) => create.mutate(v))}
              noValidate
            >
              <div>
                <Label>Full name</Label>
                <Input className="mt-1.5" {...form.register("fullName")} />
                <FieldError message={form.formState.errors.fullName?.message} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Phone</Label>
                  <Input className="mt-1.5" {...form.register("phone")} />
                  <FieldError message={form.formState.errors.phone?.message} />
                </div>
                {rental ? (
                  <div>
                    <Label>Event date</Label>
                    <Input
                      className="mt-1.5"
                      type="date"
                      {...form.register("eventDate")}
                    />
                  </div>
                ) : (
                  <div>
                    <Label>Email</Label>
                    <Input
                      className="mt-1.5"
                      type="email"
                      {...form.register("email")}
                    />
                    <FieldError message={form.formState.errors.email?.message} />
                  </div>
                )}
              </div>
              {rental ? (
              <div>
                <Label>Email</Label>
                <Input
                  className="mt-1.5"
                  type="email"
                  {...form.register("email")}
                />
                <FieldError message={form.formState.errors.email?.message} />
              </div>
              ) : null}
              <div>
                <Label>Notes</Label>
                <Input className="mt-1.5" {...form.register("notes")} />
              </div>
              <Button
                type="submit"
                disabled={create.isPending}
                className="w-full"
              >
                {create.isPending ? "Saving…" : "Create customer"}
              </Button>
            </form>
          </section>
        </FadeIn>
      </div>

      {/* Measurements — rental module only */}
      {rental ? (
      <FadeIn delay={0.1}>
        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5 sm:p-6">
          {!selected ? (
            <div className="py-10 text-center">
              <p className="eyebrow text-[#0b1f33]">Measurements</p>
              <h2 className="display mt-2 text-2xl text-[#111827]">
                Select a customer
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-[#6b7280]">
                Click a name in the list above to add or review fittings.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 border-b border-[#e5e7eb] pb-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="eyebrow text-[#0b1f33]">Measurements</p>
                  <h2 className="display mt-1 text-2xl text-[#111827] sm:text-[1.75rem]">
                    {selected.fullName}
                  </h2>
                  <p className="mt-1 text-sm tabular-nums text-[#6b7280]">
                    {selected.phone}
                    {selected.eventDate
                      ? ` · Event ${formatDate(selected.eventDate)}`
                      : ""}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <form
                  className="space-y-4"
                  onSubmit={measureForm.handleSubmit((v) =>
                    addMeasurement.mutate(v),
                  )}
                  noValidate
                >
                  <h3 className="text-sm font-semibold text-[#111827]">
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
                        <Label>{label}</Label>
                        <Input
                          className="mt-1.5"
                          type="number"
                          step="0.1"
                          inputMode="decimal"
                          {...measureForm.register(name)}
                        />
                      </div>
                    ))}
                    <div className="col-span-2 sm:col-span-1">
                      <Label>Shoe size</Label>
                      <Input
                        className="mt-1.5"
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
                    disabled={addMeasurement.isPending}
                    className="w-full sm:w-auto"
                  >
                    {addMeasurement.isPending
                      ? "Saving…"
                      : "Save measurement"}
                  </Button>
                </form>

                <div>
                  <h3 className="text-sm font-semibold text-[#111827]">
                    Fitting history
                  </h3>
                  <ul className="mt-3 max-h-[22rem] space-y-3 overflow-y-auto pr-1">
                    {(measurements.data ?? []).map((m) => (
                      <li
                        key={m.id}
                        className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4"
                      >
                        <p className="text-xs font-semibold tracking-wide text-[#0b1f33] uppercase">
                          {formatDate(m.takenAt)}
                        </p>
                        <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-3 sm:grid-cols-4">
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
                      <li className="text-sm text-[#6b7280]">Loading…</li>
                    ) : null}
                    {!measurements.isLoading &&
                    !(measurements.data ?? []).length ? (
                      <li className="rounded-xl border border-dashed border-[#e5e7eb] px-4 py-8 text-center text-sm text-[#6b7280]">
                        No measurements yet — add the first fitting on the left.
                      </li>
                    ) : null}
                  </ul>
                </div>
              </div>
            </>
          )}
        </section>
      </FadeIn>
      ) : null}
    </div>
  );
}
