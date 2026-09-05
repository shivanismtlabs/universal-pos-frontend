"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inventoryApi, posApi, servicesCommerceApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { useBranchStore } from "@/lib/branch-store";
import { newIdempotencyKey } from "@/lib/utils";
import { FloorTabs } from "@/components/getting-started";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { CustomerPicker } from "@/components/customer-picker";
import { ReceiptModal, type ReceiptData } from "@/components/receipt-modal";
import { canWriteCatalog } from "@/lib/roles";
import { useAuthStore } from "@/lib/auth-store";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "charge" | "catalog";

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120] as const;

function errMsg(e: unknown) {
  if (e instanceof ApiError) return e.messages.join(", ");
  if (e instanceof Error) return e.message;
  return "Request failed";
}

function suggestSku(title: string): string {
  const base = title
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 10);
  const stamp = Date.now().toString(36).toUpperCase().slice(-4);
  const sku = `SVC-${base || "ITEM"}-${stamp}`.slice(0, 18);
  return sku.length >= 2 ? sku : `SVC-${stamp}`;
}

/**
 * Live Services floor — charge at counter + light menu builder.
 * Full item forms stay on /catalog; appointments on /appointments.
 */
export function ServiceDashboard({ embed = false }: { embed?: boolean }) {
  const { money } = useBootstrap();
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.user?.roles);
  const canWrite = canWriteCatalog(roles);
  const locationId = useBranchStore((s) => s.currentLocationId) || undefined;

  const [tab, setTab] = useState<Tab>("charge");
  const [form, setForm] = useState({
    title: "",
    description: "",
    categoryId: "",
    sku: "",
    price: "",
    durationMinutes: "30",
  });
  const [newCat, setNewCat] = useState("");
  const [billCustomerId, setBillCustomerId] = useState("");
  const [billServiceId, setBillServiceId] = useState("");
  const [billQty, setBillQty] = useState("1");
  const [payMethod, setPayMethod] = useState<"cash" | "card" | "upi">("cash");
  const [receiptOrderId, setReceiptOrderId] = useState<string | null>(null);
  const [menuQ, setMenuQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const receiptQ = useQuery({
    queryKey: ["order-receipt", receiptOrderId],
    queryFn: () => posApi.receipt(receiptOrderId!),
    enabled: Boolean(receiptOrderId),
  });

  const services = useQuery({
    queryKey: ["services-catalog"],
    queryFn: () => servicesCommerceApi.list(),
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => inventoryApi.listCategories(),
  });

  const createCat = useMutation({
    mutationFn: () => inventoryApi.createCategory({ name: newCat.trim() }),
    onSuccess: (c) => {
      toast.success(`Category ${c.name}`);
      setNewCat("");
      setForm((f) => ({ ...f, categoryId: c.id }));
      void qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const createService = useMutation({
    mutationFn: () => {
      const sku =
        form.sku.trim() || suggestSku(form.title || "SERVICE");
      return servicesCommerceApi.create({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        categoryId: form.categoryId,
        sku,
        price: Number(form.price),
        durationMinutes: Number(form.durationMinutes) || undefined,
      });
    },
    onSuccess: (created) => {
      toast.success("Service created");
      setForm({
        title: "",
        description: "",
        categoryId: form.categoryId,
        sku: "",
        price: "",
        durationMinutes: "30",
      });
      void qc.invalidateQueries({ queryKey: ["services-catalog"] });
      void qc.invalidateQueries({ queryKey: ["services-summary"] });
      const id = (created as { id?: string })?.id;
      if (id) {
        setBillServiceId(id);
        setTab("charge");
      }
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      servicesCommerceApi.setActive(id, isActive),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["services-catalog"] });
      void qc.invalidateQueries({ queryKey: ["services-summary"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const bill = useMutation({
    mutationFn: () => {
      const qty = Math.max(1, Math.min(99, Math.floor(Number(billQty) || 1)));
      return servicesCommerceApi.bill({
        customerId: billCustomerId || undefined,
        productId: billServiceId,
        paymentMethod: payMethod,
        quantity: qty,
        locationId,
        idempotencyKey: newIdempotencyKey("svc-bill"),
      });
    },
    onSuccess: (r) => {
      const paid = r.totals?.grandTotal ?? r.payment.amount;
      toast.success(`Charged ${r.order.orderNumber} · ${money(paid)}`);
      setReceiptOrderId(r.order.id);
      setBillCustomerId("");
      setBillQty("1");
      // keep service selected for next walk-in of same type
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const activeServices = useMemo(
    () => (services.data?.items ?? []).filter((s) => s.isActive),
    [services.data?.items],
  );

  const filteredMenu = useMemo(() => {
    const q = menuQ.trim().toLowerCase();
    const list = services.data?.items ?? [];
    if (!q) return list;
    return list.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.sku.toLowerCase().includes(q) ||
        (s.category?.name ?? "").toLowerCase().includes(q),
    );
  }, [services.data?.items, menuQ]);

  const menuCategories = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of activeServices) {
      if (s.category?.id) map.set(s.category.id, s.category.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [activeServices]);

  const visibleMenu = useMemo(() => {
    return filteredMenu.filter((s) => {
      if (!s.isActive) return false;
      if (categoryFilter && s.category?.id !== categoryFilter) return false;
      return true;
    });
  }, [filteredMenu, categoryFilter]);

  const selected = useMemo(
    () => (services.data?.items ?? []).find((s) => s.id === billServiceId),
    [services.data?.items, billServiceId],
  );

  const qtyNum = Math.max(1, Math.min(99, Math.floor(Number(billQty) || 1)));
  const unit = selected ? Number(selected.price) : 0;
  const taxPct = selected?.taxRatePercent ?? 0;
  const subtotal = unit * qtyNum;
  const taxAmt = taxPct > 0 ? Math.round(subtotal * taxPct) / 100 : 0;
  const grand = subtotal + taxAmt;

  function chargeService(id: string) {
    setBillServiceId(id);
    setTab("charge");
  }

  return (
    <div
      className={cn(
        embed ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "space-y-4",
      )}
    >
      {!embed ? (
        <header className="flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <p className="eyebrow">Counter</p>
            <h1 className="page-title mt-1">Services</h1>
            <p className="page-subtitle mt-1.5">
              Charge walk-ins from the menu. Full item forms stay on{" "}
              <Link
                href="/catalog/new"
                className="font-semibold text-[#1a56db] hover:underline"
              >
                New Item
              </Link>
              .
            </p>
          </div>
        </header>
      ) : null}

      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-b border-[#eef1f4]",
          embed ? "shrink-0 px-4 py-2" : "",
        )}
      >
        {embed ? (
          <p className="text-sm font-semibold text-[#0b1f33]">
            {tab === "charge" ? "Charge" : "Service menu"}
          </p>
        ) : (
          <FloorTabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "charge", label: "Charge" },
              { id: "catalog", label: "Service menu" },
            ]}
          />
        )}
        <div className="flex flex-wrap gap-2 pb-1">
          {embed ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setTab((t) => (t === "charge" ? "catalog" : "charge"))
              }
            >
              {tab === "charge" ? "Service menu" : "Back to charge"}
            </Button>
          ) : null}
          <Button asChild variant="secondary" size="sm">
            <Link href="/appointments">Appointments</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/catalog?kind=service">Items</Link>
          </Button>
        </div>
      </div>

      {tab === "charge" ? (
        <div
          className={cn(
            "grid min-h-0 gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:grid-rows-[minmax(0,1fr)]",
            embed
              ? "min-w-0 flex-1 overflow-hidden"
              : "lg:min-h-[calc(100dvh-11rem)]",
          )}
        >
          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#f4f6fa] p-3 sm:p-4">
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <div className="relative min-w-[12rem] flex-1 sm:max-w-sm">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[#8a9bb0]" />
                <Input
                  className="h-9 pl-9"
                  placeholder="Search service or SKU"
                  value={menuQ}
                  onChange={(e) => setMenuQ(e.target.value)}
                />
              </div>
              {menuCategories.length ? (
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setCategoryFilter("")}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[0.75rem] font-medium",
                      !categoryFilter
                        ? "bg-[#1a56db] text-white"
                        : "bg-white text-[#5a6b7d] ring-1 ring-[#e2e8f0]",
                    )}
                  >
                    All
                  </button>
                  {menuCategories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setCategoryFilter((cur) => (cur === c.id ? "" : c.id))
                      }
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[0.75rem] font-medium",
                        categoryFilter === c.id
                          ? "bg-[#1a56db] text-white"
                          : "bg-white text-[#5a6b7d] ring-1 ring-[#e2e8f0]",
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-width:thin]">
              {services.isLoading ? (
                <p className="py-12 text-center text-sm text-[#5a6b7d]">
                  Loading services…
                </p>
              ) : visibleMenu.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#d9e0ea] bg-white px-6 py-12 text-center">
                  <p className="text-sm font-semibold text-[#0b1f33]">
                    {activeServices.length === 0
                      ? "No services yet"
                      : "No matching services"}
                  </p>
                  <p className="mt-1 text-sm text-[#5a6b7d]">
                    {activeServices.length === 0
                      ? "Add a service on the Service menu tab or in Catalog."
                      : "Try another search or category."}
                  </p>
                  {activeServices.length === 0 ? (
                    <Button
                      className="mt-4"
                      size="sm"
                      onClick={() => setTab("catalog")}
                    >
                      Open service menu
                    </Button>
                  ) : null}
                </div>
              ) : (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  {visibleMenu.map((s) => {
                    const on = s.id === billServiceId;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => chargeService(s.id)}
                          className={cn(
                            "flex h-full w-full flex-col rounded-lg border bg-white p-3 text-left shadow-[0_1px_2px_rgba(11,31,51,0.04)] transition",
                            on
                              ? "border-[#1a56db] ring-2 ring-[#1a56db]/20"
                              : "border-[#e4e9f0] hover:border-[#c5d0e0]",
                          )}
                        >
                          <p className="line-clamp-2 text-sm font-semibold text-[#0b1f33]">
                            {s.title}
                          </p>
                          <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                            {(s as any).durationQuantity && (s as any).durationUnit
                              ? `${(s as any).durationQuantity} ${(s as any).durationUnit}`
                              : s.durationMinutes
                                ? `${s.durationMinutes} min`
                                : "Duration not set"}
                            {s.category?.name ? ` · ${s.category.name}` : ""}
                          </p>
                          <p className="mt-auto pt-3 text-sm font-semibold tabular-nums text-[#0b1f33]">
                            {money(s.price)}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-t border-[#e8edf3] bg-white lg:border-t-0 lg:border-l">
            <div className="shrink-0 border-b border-[#eef1f4] px-4 py-3">
              <h2 className="text-sm font-semibold text-[#0b1f33]">Ticket</h2>
              <p className="text-[0.75rem] text-[#8b9bb0]">
                Walk-in or booked customer
              </p>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4 [scrollbar-width:thin]">
              {selected ? (
                <div className="rounded-lg border border-[#e8edf4] bg-[#f8fafc] px-3 py-3">
                  <p className="text-sm font-semibold text-[#0b1f33]">
                    {selected.title}
                  </p>
                  <p className="mt-0.5 text-[0.75rem] text-[#5a6b7d]">
                    {(selected as any).durationQuantity && (selected as any).durationUnit
                      ? `${(selected as any).durationQuantity} ${(selected as any).durationUnit}`
                      : selected.durationMinutes
                        ? `${selected.durationMinutes} min`
                        : "Service"}
                    {selected.sku ? ` · ${selected.sku}` : ""}
                  </p>
                  <p className="mt-2 text-sm font-semibold tabular-nums">
                    {money(selected.price)}
                    <span className="font-normal text-[#8b9bb0]">
                      {" "}
                      / {(selected as any).durationUnit || "service"}
                    </span>
                  </p>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-[#e4e9f0] px-3 py-6 text-center text-sm text-[#8b9bb0]">
                  Tap a service to add it to the ticket
                </p>
              )}

              <div>
                <Label>Customer</Label>
                <div className="mt-1.5">
                  <CustomerPicker
                    value={billCustomerId}
                    onChange={(id) => setBillCustomerId(id)}
                    placeholder="Walk-in — search name or phone"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Qty</Label>
                  <div className="mt-1.5 flex h-9 overflow-hidden rounded-md border border-[#d9e0ea]">
                    <button
                      type="button"
                      className="w-9 text-[#5a6b7d] hover:bg-[#f1f5f9]"
                      onClick={() =>
                        setBillQty(String(Math.max(1, qtyNum - 1)))
                      }
                    >
                      −
                    </button>
                    <Input
                      className="h-9 rounded-none border-0 text-center"
                      type="number"
                      min={1}
                      max={99}
                      value={billQty}
                      onChange={(e) => setBillQty(e.target.value)}
                    />
                    <button
                      type="button"
                      className="w-9 text-[#5a6b7d] hover:bg-[#f1f5f9]"
                      onClick={() =>
                        setBillQty(String(Math.min(99, qtyNum + 1)))
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <Label>Duration</Label>
                  <p className="mt-1.5 flex h-9 items-center text-sm text-[#0b1f33]">
                    {(selected as any)?.durationQuantity && (selected as any)?.durationUnit
                      ? `${Number(((selected as any).durationQuantity * qtyNum).toFixed(2))} ${(selected as any).durationUnit}${(selected as any).durationQuantity * qtyNum > 1 && !(selected as any).durationUnit.endsWith('s') ? 's' : ''}`
                      : selected?.durationMinutes
                        ? `${selected.durationMinutes * qtyNum} min`
                        : "—"}
                  </p>
                </div>
              </div>
            </div>
            <div className="shrink-0 space-y-4 border-t border-[#eef1f4] bg-[#fafbfc] p-4">
              <div>
                <Label>Payment</Label>
                <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-md border border-[#e2e8f0] bg-[#f1f5f9] p-0.5">
                  {(
                    [
                      ["cash", "Cash"],
                      ["upi", "UPI"],
                      ["card", "Card"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPayMethod(id)}
                      className={cn(
                        "rounded-[5px] py-1.5 text-[0.75rem] font-semibold",
                        payMethod === id
                          ? "bg-white text-[#0b1f33] shadow-sm"
                          : "text-[#5a6b7d]",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {selected ? (
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-[#5a6b7d]">
                    <span>Subtotal</span>
                    <span className="tabular-nums text-[#0b1f33]">
                      {money(subtotal)}
                    </span>
                  </div>
                  {taxPct > 0 ? (
                    <div className="flex justify-between text-[#5a6b7d]">
                      <span>Tax ({taxPct}%)</span>
                      <span className="tabular-nums text-[#0b1f33]">
                        {money(taxAmt)}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex items-baseline justify-between pt-1">
                    <span className="font-semibold text-[#0b1f33]">
                      Net Payable
                    </span>
                    <span className="text-lg font-bold tabular-nums text-[#0b1f33]">
                      {money(grand)}
                    </span>
                  </div>
                </div>
              ) : null}

              <Button
                type="button"
                className="h-11 w-full text-sm font-semibold"
                disabled={bill.isPending || !billServiceId}
                onClick={() => bill.mutate()}
              >
                {bill.isPending
                  ? "Charging…"
                  : selected
                    ? `Charge ${money(grand)}`
                    : "Select a service"}
              </Button>
            </div>
          </aside>
        </div>
      ) : null}

      {tab === "catalog" ? (
        <div
          className={cn(
            "grid gap-4 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]",
            embed
              ? "min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 [scrollbar-width:thin]"
              : "p-4",
          )}
        >
          {canWrite ? (
            <section className="rounded-[14px] border border-[#d9e0ea] bg-white p-4">
              <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
                Quick add service
              </h2>
              <p className="mt-1 text-[0.75rem] text-[#5a6b7d]">
                For full fields (tax, images), use Catalog → New Item → Service.
              </p>
              <div className="mt-4 space-y-3">
                <div className="field-shell">
                  <Label htmlFor="svc-title">Service name *</Label>
                  <Input
                    id="svc-title"
                    autoFocus
                    value={form.title}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, title: e.target.value }))
                    }
                    placeholder="e.g. Haircut 30 min"
                  />
                  {!form.title.trim() ? (
                    <p className="mt-1 text-[0.7rem] text-[#b45309]">
                      Name is required
                    </p>
                  ) : null}
                </div>
                <div className="field-shell">
                  <Label htmlFor="svc-price">Price *</Label>
                  <Input
                    id="svc-price"
                    inputMode="decimal"
                    value={form.price}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, price: e.target.value }))
                    }
                    placeholder="e.g. 499"
                  />
                  {!Number(form.price) ? (
                    <p className="mt-1 text-[0.7rem] text-[#b45309]">
                      Enter a price greater than 0
                    </p>
                  ) : null}
                </div>
                <div className="field-shell">
                  <Label>Duration</Label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {DURATION_PRESETS.map((mins) => {
                      const on =
                        String(form.durationMinutes).trim() === String(mins);
                      return (
                        <button
                          key={mins}
                          type="button"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              durationMinutes: String(mins),
                            }))
                          }
                          className={cn(
                            "rounded-md border px-2.5 py-1 text-[0.8125rem] font-medium",
                            on
                              ? "border-[#1a56db] bg-[#e8eefb] text-[#1a56db]"
                              : "border-[#d9e0ea] bg-white text-[#5a6b7d]",
                          )}
                        >
                          {mins} min
                        </button>
                      );
                    })}
                  </div>
                  <Input
                    className="mt-2 max-w-[8rem]"
                    inputMode="numeric"
                    value={form.durationMinutes}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        durationMinutes: e.target.value,
                      }))
                    }
                    placeholder="Custom"
                  />
                </div>
                <div className="field-shell">
                  <Label>Category *</Label>
                  <Select
                    value={form.categoryId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, categoryId: e.target.value }))
                    }
                  >
                    <option value="">Select…</option>
                    {(categories.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  {!form.categoryId ? (
                    <p className="mt-1 text-[0.7rem] text-[#b45309]">
                      Pick a category (or add one below)
                    </p>
                  ) : null}
                  <div className="mt-2 flex gap-2">
                    <Input
                      placeholder="New category"
                      value={newCat}
                      onChange={(e) => setNewCat(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={
                        newCat.trim().length < 2 || createCat.isPending
                      }
                      onClick={() => createCat.mutate()}
                    >
                      Add
                    </Button>
                  </div>
                </div>
                <div className="field-shell">
                  <Label>SKU</Label>
                  <Input
                    maxLength={18}
                    value={form.sku}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sku: e.target.value }))
                    }
                    placeholder="Auto if blank"
                  />
                  <button
                    type="button"
                    className="mt-1 text-[0.7rem] font-semibold text-[#1a56db]"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        sku: suggestSku(f.title || "SERVICE"),
                      }))
                    }
                  >
                    Generate SKU
                  </button>
                </div>
                <Button
                  type="button"
                  className="w-full"
                  disabled={createService.isPending}
                  onClick={() => {
                    if (!form.title.trim()) {
                      toast.error("Enter a service name");
                      return;
                    }
                    if (!form.categoryId) {
                      toast.error("Select or add a category");
                      return;
                    }
                    if (!Number(form.price)) {
                      toast.error("Enter a price greater than 0");
                      return;
                    }
                    createService.mutate();
                  }}
                >
                  {createService.isPending ? "Creating…" : "Create service"}
                </Button>
                {!form.title.trim() ||
                !form.categoryId ||
                !Number(form.price) ? (
                  <p className="text-center text-[0.72rem] text-[#8b9bb0]">
                    Need:{" "}
                    {[
                      !form.title.trim() ? "name" : null,
                      !Number(form.price) ? "price" : null,
                      !form.categoryId ? "category" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
            </section>
          ) : (
            <section className="rounded-[14px] border border-[#d9e0ea] bg-white p-4 text-sm text-[#5a6b7d]">
              Catalog write access required to add services.
            </section>
          )}

          <section className="overflow-hidden rounded-lg border border-[#e4e9f0] bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-[#eef1f4] px-3 py-2.5">
              <h2 className="text-sm font-semibold text-[#0b1f33]">Menu</h2>
              <p className="text-[0.75rem] text-[#8b9bb0]">
                {(services.data?.items ?? []).length}{" "}
                {(services.data?.items ?? []).length === 1
                  ? "service"
                  : "services"}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="border-b border-[#eef1f4] bg-[#f7f9fb] text-[0.7rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
                  <tr>
                    <th className="px-3 py-2.5">Name</th>
                    <th className="px-3 py-2.5">SKU</th>
                    <th className="px-3 py-2.5">Category</th>
                    <th className="px-3 py-2.5 text-right">Rate</th>
                    <th className="px-3 py-2.5">Duration</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {services.isLoading ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-8 text-center text-[#5a6b7d]"
                      >
                        Loading services…
                      </td>
                    </tr>
                  ) : !(services.data?.items ?? []).length ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-10 text-center text-sm text-[#5a6b7d]"
                      >
                        No services yet.
                      </td>
                    </tr>
                  ) : (
                    (services.data?.items ?? []).map((s) => (
                      <tr
                        key={s.id}
                        className="border-b border-[#eef1f4] last:border-0"
                      >
                        <td className="px-3 py-2.5 font-semibold text-[#0b1f33]">
                          {s.title}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[0.75rem] text-[#5a6b7d]">
                          {s.sku}
                        </td>
                        <td className="px-3 py-2.5 text-[#5a6b7d]">
                          {s.category?.name ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                          {money(s.price)}
                        </td>
                        <td className="px-3 py-2.5 text-[#5a6b7d]">
                          {s.durationMinutes
                            ? `${s.durationMinutes} min`
                            : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[0.7rem] font-semibold",
                              s.isActive
                                ? "bg-[#e8f5ee] text-[#0d7a4c]"
                                : "bg-[#fef3c7] text-[#b45309]",
                            )}
                          >
                            {s.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            {s.isActive ? (
                              <Button
                                size="sm"
                                variant="soft"
                                onClick={() => chargeService(s.id)}
                              >
                                Charge
                              </Button>
                            ) : null}
                            {canWrite ? (
                              <Button
                                size="sm"
                                variant="soft"
                                onClick={() =>
                                  toggle.mutate({
                                    id: s.id,
                                    isActive: !s.isActive,
                                  })
                                }
                              >
                                {s.isActive ? "Deactivate" : "Activate"}
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {receiptOrderId ? (
        <ReceiptModal
          data={(receiptQ.data as ReceiptData | undefined) ?? null}
          loading={receiptQ.isLoading}
          change={receiptQ.data?.change}
          cashTendered={receiptQ.data?.cashTendered}
          onClose={() => setReceiptOrderId(null)}
        />
      ) : null}
    </div>
  );
}
