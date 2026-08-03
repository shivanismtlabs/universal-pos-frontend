"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { z } from "zod";
import { inventoryApi, tenantsApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import {
  createCategorySchema,
  createInventoryUnitSchema,
  createProductStyleSchema,
} from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/form";
import { formatInr, cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";

type UnitForm = z.infer<typeof createInventoryUnitSchema>;
type StyleForm = z.infer<typeof createProductStyleSchema>;
type CatForm = z.infer<typeof createCategorySchema>;
type AddTab = "unit" | "style" | "category";

function StatusPill({ status }: { status: string }) {
  const s = status.toUpperCase();
  const tone =
    s.includes("AVAILABLE") || s === "IN_STOCK"
      ? "bg-[#ecfdf8] text-[#0f766e]"
      : s.includes("CHECKED") || s.includes("OUT")
        ? "bg-amber-50 text-amber-900"
        : "bg-[#f3f4f6] text-[#4b5563]";
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase",
        tone,
      )}
    >
      {status.replaceAll("_", " ").toLowerCase()}
    </span>
  );
}

export default function InventoryPage() {
  const qc = useQueryClient();
  const storeId = useAuthStore((s) => s.user?.storeId);
  const [tab, setTab] = useState<AddTab>("unit");
  const [q, setQ] = useState("");
  const [availStart, setAvailStart] = useState("");
  const [availEnd, setAvailEnd] = useState("");
  const [availStyle, setAvailStyle] = useState("");
  const [availSize, setAvailSize] = useState("");
  const [availEnabled, setAvailEnabled] = useState(false);

  const units = useQuery({
    queryKey: ["units"],
    queryFn: () => inventoryApi.listUnits({ limit: 100 }),
  });
  const styles = useQuery({
    queryKey: ["styles"],
    queryFn: () => inventoryApi.listStyles(),
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => inventoryApi.listCategories(),
  });
  const stores = useQuery({
    queryKey: ["stores"],
    queryFn: () => tenantsApi.listStores(),
  });
  const availability = useQuery({
    queryKey: ["availability", availStart, availEnd, availStyle, availSize, storeId],
    queryFn: () =>
      inventoryApi.availability({
        startDate: availStart,
        endDate: availEnd,
        productStyleId: availStyle || undefined,
        storeId: storeId || undefined,
        size: availSize || undefined,
      }),
    enabled: availEnabled && Boolean(availStart && availEnd),
  });

  const reserve = useMutation({
    mutationFn: (inventoryUnitId: string) =>
      inventoryApi.reserve({
        inventoryUnitId,
        startDate: availStart,
        endDate: availEnd,
      }),
    onSuccess: () => {
      toast.success("Unit reserved");
      void qc.invalidateQueries({ queryKey: ["availability"] });
      void qc.invalidateQueries({ queryKey: ["units"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const catForm = useForm<CatForm>({
    resolver: zodResolver(createCategorySchema),
    defaultValues: { name: "" },
  });
  const styleForm = useForm<StyleForm>({
    resolver: zodResolver(createProductStyleSchema),
    defaultValues: {
      name: "",
      styleCode: "",
      color: "Black",
      isRental: true,
      hsnSac: "9988",
    },
  });
  const unitForm = useForm<UnitForm>({
    resolver: zodResolver(createInventoryUnitSchema),
    defaultValues: {
      storeId: storeId ?? "",
      productStyleId: "",
      barcodeSku: "",
      size: "42",
      condition: "GOOD",
      ownership: "own",
      rentalPrice: 2500,
      depositAmount: 5000,
    },
  });

  const createCat = useMutation({
    mutationFn: (v: CatForm) => inventoryApi.createCategory(v),
    onSuccess: () => {
      toast.success("Category created");
      catForm.reset();
      void qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const createStyle = useMutation({
    mutationFn: (v: StyleForm) =>
      inventoryApi.createStyle({
        ...v,
        color: v.color || undefined,
        hsnSac: v.hsnSac || undefined,
      }),
    onSuccess: () => {
      toast.success("Style created");
      styleForm.reset({
        name: "",
        styleCode: "",
        color: "Black",
        isRental: true,
        hsnSac: "9988",
      });
      void qc.invalidateQueries({ queryKey: ["styles"] });
      setTab("unit");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const createUnit = useMutation({
    mutationFn: (v: UnitForm) => inventoryApi.createUnit(v),
    onSuccess: () => {
      toast.success("Unit created");
      unitForm.reset({
        storeId: storeId ?? unitForm.getValues("storeId"),
        productStyleId: "",
        barcodeSku: "",
        size: "42",
        condition: "GOOD",
        ownership: "own",
        rentalPrice: 2500,
        depositAmount: 5000,
      });
      void qc.invalidateQueries({ queryKey: ["units"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const unitItems = (units.data?.items ?? []).filter((u) => {
    if (!q.trim()) return true;
    const hay =
      `${u.barcodeSku} ${u.productStyle?.name ?? ""} ${u.size}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  const tabs: { id: AddTab; label: string }[] = [
    { id: "unit", label: "Unit" },
    { id: "style", label: "Style" },
    { id: "category", label: "Category" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-sm tracking-[0.18em] text-[#0f766e] uppercase">
          Catalog
        </p>
        <h1 className="display mt-1 text-3xl text-[#111827]">Inventory</h1>
        <p className="mt-1.5 text-sm text-[#6b7280]">
          {units.isLoading
            ? "Loading stock…"
            : `${units.data?.items?.length ?? 0} units · ${styles.data?.length ?? 0} styles · ${categories.data?.length ?? 0} categories`}
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.85fr)]">
        {/* Stock */}
        <section className="rounded-2xl border border-[#e5e7eb] bg-white">
          <div className="flex items-center gap-3 border-b border-[#e5e7eb] px-4 py-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
              <Input
                className="h-10 pl-9"
                placeholder="Search barcode or style"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>

          <ul className="divide-y divide-[#f3f4f6]">
            {unitItems.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-semibold text-[#111827]">
                    {u.barcodeSku}
                  </p>
                  <p className="mt-0.5 truncate text-[0.8rem] text-[#6b7280]">
                    {u.productStyle?.name ?? "Untitled style"} · {u.size}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusPill status={u.availabilityStatus} />
                  <p className="text-sm font-medium tabular-nums text-[#111827]">
                    {formatInr(u.rentalPrice)}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {units.isLoading ? (
            <p className="px-4 py-8 text-sm text-[#6b7280]">Loading…</p>
          ) : null}
          {!units.isLoading && !unitItems.length ? (
            <p className="px-4 py-10 text-center text-sm text-[#6b7280]">
              No stock yet. Add a style, then a unit.
            </p>
          ) : null}
        </section>

        {/* Single add panel with tabs */}
        <aside className="rounded-2xl border border-[#e5e7eb] bg-white">
          <div className="border-b border-[#e5e7eb] p-1.5">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#f6f7f9] p-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "rounded-lg px-2 py-2 text-sm font-medium transition",
                    tab === t.id
                      ? "bg-white text-[#111827] shadow-sm"
                      : "text-[#6b7280] hover:text-[#111827]",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4">
            {tab === "unit" ? (
              <form
                className="space-y-3"
                onSubmit={unitForm.handleSubmit((v) => createUnit.mutate(v))}
                noValidate
              >
                <p className="text-sm text-[#6b7280]">
                  Barcode unit linked to a style
                </p>
                <div>
                  <Label>Store</Label>
                  <select
                    className="mt-1.5 select-field"
                    {...unitForm.register("storeId")}
                  >
                    <option value="">Select</option>
                    {(stores.data ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <FieldError
                    message={unitForm.formState.errors.storeId?.message}
                  />
                </div>
                <div>
                  <Label>Style</Label>
                  <select
                    className="mt-1.5 select-field"
                    {...unitForm.register("productStyleId")}
                  >
                    <option value="">Select</option>
                    {(styles.data ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.styleCode})
                      </option>
                    ))}
                  </select>
                  <FieldError
                    message={unitForm.formState.errors.productStyleId?.message}
                  />
                </div>
                <div>
                  <Label>Barcode / SKU</Label>
                  <Input
                    className="mt-1.5"
                    {...unitForm.register("barcodeSku")}
                  />
                  <FieldError
                    message={unitForm.formState.errors.barcodeSku?.message}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Size</Label>
                    <Input className="mt-1.5" {...unitForm.register("size")} />
                  </div>
                  <div>
                    <Label>Rent ₹</Label>
                    <Input
                      className="mt-1.5"
                      type="number"
                      {...unitForm.register("rentalPrice")}
                    />
                  </div>
                </div>
                <div>
                  <Label>Deposit ₹</Label>
                  <Input
                    className="mt-1.5"
                    type="number"
                    {...unitForm.register("depositAmount")}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createUnit.isPending}
                >
                  {createUnit.isPending ? "Saving…" : "Add unit"}
                </Button>
              </form>
            ) : null}

            {tab === "style" ? (
              <form
                className="space-y-3"
                onSubmit={styleForm.handleSubmit((v) => createStyle.mutate(v))}
                noValidate
              >
                <p className="text-sm text-[#6b7280]">
                  Catalog style before adding units
                </p>
                <div>
                  <Label>Name</Label>
                  <Input className="mt-1.5" {...styleForm.register("name")} />
                  <FieldError
                    message={styleForm.formState.errors.name?.message}
                  />
                </div>
                <div>
                  <Label>Style code</Label>
                  <Input
                    className="mt-1.5"
                    {...styleForm.register("styleCode")}
                  />
                  <FieldError
                    message={styleForm.formState.errors.styleCode?.message}
                  />
                </div>
                <div>
                  <Label>Color</Label>
                  <Input className="mt-1.5" {...styleForm.register("color")} />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createStyle.isPending}
                >
                  {createStyle.isPending ? "Saving…" : "Add style"}
                </Button>
              </form>
            ) : null}

            {tab === "category" ? (
              <form
                className="space-y-3"
                onSubmit={catForm.handleSubmit((v) => createCat.mutate(v))}
                noValidate
              >
                <p className="text-sm text-[#6b7280]">
                  Group styles (tuxedos, accessories…)
                </p>
                <div>
                  <Label>Name</Label>
                  <Input className="mt-1.5" {...catForm.register("name")} />
                  <FieldError
                    message={catForm.formState.errors.name?.message}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createCat.isPending}
                >
                  {createCat.isPending ? "Saving…" : "Add category"}
                </Button>
              </form>
            ) : null}
          </div>
        </aside>
      </div>

      {/* Availability — one section */}
      <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="display text-xl text-[#111827]">Check availability</h2>
            <p className="mt-0.5 text-sm text-[#6b7280]">
              Free units for a date range, then hold
            </p>
          </div>
          {availEnabled && !availability.isLoading ? (
            <p className="text-sm font-semibold text-[#0f766e]">
              {availability.data?.availableCount ?? 0} free
            </p>
          ) : null}
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>Start</Label>
              <Input
                className="mt-1.5"
                type="date"
                value={availStart}
                onChange={(e) => {
                  setAvailStart(e.target.value);
                  setAvailEnabled(false);
                }}
              />
            </div>
            <div>
              <Label>End</Label>
              <Input
                className="mt-1.5"
                type="date"
                value={availEnd}
                onChange={(e) => {
                  setAvailEnd(e.target.value);
                  setAvailEnabled(false);
                }}
              />
            </div>
            <div>
              <Label>Style</Label>
              <select
                className="mt-1.5 select-field"
                value={availStyle}
                onChange={(e) => {
                  setAvailStyle(e.target.value);
                  setAvailEnabled(false);
                }}
              >
                <option value="">Any</option>
                {(styles.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Size</Label>
              <Input
                className="mt-1.5"
                value={availSize}
                onChange={(e) => {
                  setAvailSize(e.target.value);
                  setAvailEnabled(false);
                }}
                placeholder="Optional"
              />
            </div>
          </div>
          <Button
            type="button"
            className="lg:w-28"
            onClick={() => {
              if (!availStart || !availEnd) {
                toast.error("Pick start and end dates");
                return;
              }
              setAvailEnabled(true);
            }}
          >
            Check
          </Button>
        </div>

        {availEnabled ? (
          <div className="mt-4 border-t border-[#e5e7eb] pt-3">
            {availability.isLoading ? (
              <p className="py-4 text-sm text-[#6b7280]">Checking…</p>
            ) : !(availability.data?.units ?? []).length ? (
              <p className="py-4 text-sm text-[#6b7280]">
                No free units in this range
              </p>
            ) : (
              <ul className="divide-y divide-[#f3f4f6]">
                {(availability.data?.units ?? []).map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold">
                        {u.barcodeSku}
                      </p>
                      <p className="text-[0.8rem] text-[#6b7280]">
                        {u.productStyle?.name ?? "—"} · {u.size} ·{" "}
                        {formatInr(u.rentalPrice)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={reserve.isPending}
                      onClick={() => reserve.mutate(u.id)}
                    >
                      Hold
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
