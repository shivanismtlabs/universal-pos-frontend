"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inventoryApi, servicesCommerceApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { newIdempotencyKey } from "@/lib/utils";
import { FloorTabs } from "@/components/getting-started";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { CustomerPicker } from "@/components/customer-picker";
import { canWriteCatalog } from "@/lib/roles";
import { useAuthStore } from "@/lib/auth-store";

type Tab = "catalog" | "bill";

function errMsg(e: unknown) {
  if (e instanceof ApiError) return e.messages.join(", ");
  if (e instanceof Error) return e.message;
  return "Request failed";
}

/**
 * Live Services floor — catalog + charge at counter; appointments stay on /appointments.
 */
export function ServiceDashboard() {
  const { productName, money } = useBootstrap();
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.user?.roles);
  const canWrite = canWriteCatalog(roles);
  const [tab, setTab] = useState<Tab>("catalog");

  const [form, setForm] = useState({
    title: "",
    description: "",
    categoryId: "",
    sku: "",
    price: "",
    durationMinutes: "45",
  });
  const [newCat, setNewCat] = useState("");
  const [billCustomerId, setBillCustomerId] = useState("");
  const [billServiceId, setBillServiceId] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "card" | "upi">("cash");

  const summary = useQuery({
    queryKey: ["services-summary"],
    queryFn: () => servicesCommerceApi.summary(),
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
    mutationFn: () =>
      servicesCommerceApi.create({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        categoryId: form.categoryId,
        sku: form.sku.trim(),
        price: Number(form.price),
        durationMinutes: Number(form.durationMinutes) || undefined,
      }),
    onSuccess: () => {
      toast.success("Service created");
      setForm({
        title: "",
        description: "",
        categoryId: form.categoryId,
        sku: "",
        price: "",
        durationMinutes: "45",
      });
      void qc.invalidateQueries({ queryKey: ["services-catalog"] });
      void qc.invalidateQueries({ queryKey: ["services-summary"] });
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
    mutationFn: () =>
      servicesCommerceApi.bill({
        customerId: billCustomerId,
        productId: billServiceId,
        paymentMethod: payMethod,
        idempotencyKey: newIdempotencyKey("svc-bill"),
      }),
    onSuccess: (r) => {
      toast.success(
        `Charged ${r.order.orderNumber} · ${money(r.payment.amount)}`,
      );
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const activeServices = (services.data?.items ?? []).filter((s) => s.isActive);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#0b1f33] sm:text-2xl">
            Services · {productName}
          </h1>
          <p className="mt-1 text-sm text-[#5a6b7d]">
            Build your service menu and charge customers at the counter.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/appointments">Open appointments</Link>
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[12px] border border-[#d9e0ea] bg-white px-4 py-3">
          <p className="text-[0.7rem] font-medium text-[#5a6b7d]">
            Active services
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[#0b1f33]">
            {summary.data?.services ?? "—"}
          </p>
        </div>
        <div className="rounded-[12px] border border-[#d9e0ea] bg-white px-4 py-3">
          <p className="text-[0.7rem] font-medium text-[#5a6b7d]">
            Open appointments
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[#0b1f33]">
            {summary.data?.openAppointments ?? "—"}
          </p>
        </div>
      </div>

      <FloorTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "catalog", label: "Service menu" },
          { id: "bill", label: "Charge" },
        ]}
      />

      {tab === "catalog" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          {canWrite ? (
            <section className="rounded-[14px] border border-[#d9e0ea] bg-white p-4">
              <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
                Add service
              </h2>
              <div className="mt-4 space-y-3">
                <div className="field-shell">
                  <Label>Title *</Label>
                  <Input
                    value={form.title}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, title: e.target.value }))
                    }
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
                  <div className="mt-2 flex gap-2">
                    <Input
                      placeholder="New category"
                      value={newCat}
                      onChange={(e) => setNewCat(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={newCat.trim().length < 2 || createCat.isPending}
                      onClick={() => createCat.mutate()}
                    >
                      Add
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="field-shell">
                    <Label>SKU *</Label>
                    <Input
                      maxLength={18}
                      value={form.sku}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, sku: e.target.value }))
                      }
                      placeholder="SVC-HAIRCUT-001"
                    />
                  </div>
                  <div className="field-shell">
                    <Label>Duration (min)</Label>
                    <Input
                      inputMode="numeric"
                      value={form.durationMinutes}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          durationMinutes: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="field-shell">
                  <Label>Price *</Label>
                  <Input
                    inputMode="decimal"
                    value={form.price}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, price: e.target.value }))
                    }
                  />
                </div>
                <Button
                  type="button"
                  disabled={
                    createService.isPending ||
                    !form.title.trim() ||
                    !form.categoryId ||
                    form.sku.trim().length < 15 ||
                    !Number(form.price)
                  }
                  onClick={() => createService.mutate()}
                >
                  Create service
                </Button>
              </div>
            </section>
          ) : (
            <section className="rounded-[14px] border border-[#d9e0ea] bg-white p-4 text-sm text-[#5a6b7d]">
              Catalog write access required to add services.
            </section>
          )}

          <section className="rounded-[14px] border border-[#d9e0ea] bg-white p-4">
            <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
              Menu
            </h2>
            <ul className="mt-3 divide-y divide-[#eef2f8]">
              {(services.data?.items ?? []).map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div>
                    <p className="font-semibold text-[#0b1f33]">
                      {s.title}
                      {!s.isActive ? (
                        <span className="ml-2 text-xs text-[#b45309]">
                          inactive
                        </span>
                      ) : null}
                    </p>
                    <p className="font-mono text-[0.7rem] text-[#5a6b7d]">
                      {s.sku}
                      {s.durationMinutes ? ` · ${s.durationMinutes} min` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{money(s.price)}</span>
                    {canWrite ? (
                      <Button
                        size="sm"
                        variant="soft"
                        onClick={() =>
                          toggle.mutate({ id: s.id, isActive: !s.isActive })
                        }
                      >
                        {s.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
              {!services.data?.items?.length && !services.isLoading ? (
                <li className="py-8 text-center text-sm text-[#5a6b7d]">
                  No services yet.
                </li>
              ) : null}
            </ul>
          </section>
        </div>
      ) : null}

      {tab === "bill" ? (
        <section className="mx-auto max-w-lg rounded-[14px] border border-[#d9e0ea] bg-white p-5">
          <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
            Charge a service
          </h2>
          <div className="mt-4 space-y-3">
            <div className="field-shell">
              <Label>Customer *</Label>
              <CustomerPicker
                value={billCustomerId}
                onChange={(id) => setBillCustomerId(id)}
                placeholder="Search name or phone…"
              />
            </div>
            <div className="field-shell">
              <Label>Service *</Label>
              <Select
                value={billServiceId}
                onChange={(e) => setBillServiceId(e.target.value)}
              >
                <option value="">Select…</option>
                {activeServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} · {money(s.price)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="field-shell">
              <Label>Payment</Label>
              <Select
                value={payMethod}
                onChange={(e) =>
                  setPayMethod(e.target.value as "cash" | "card" | "upi")
                }
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
              </Select>
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={bill.isPending || !billCustomerId || !billServiceId}
              onClick={() => bill.mutate()}
            >
              {bill.isPending ? "Charging…" : "Charge now"}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
