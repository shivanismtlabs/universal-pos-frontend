"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inventoryApi, subscriptionsApi } from "@/lib/api";
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

type Tab = "plans" | "enroll" | "members";

function errMsg(e: unknown) {
  if (e instanceof ApiError) return e.messages.join(", ");
  if (e instanceof Error) return e.message;
  return "Request failed";
}

/**
 * Live Plans floor — create plans, enroll customers, renew / cancel.
 */
export function SubscriptionDashboard() {
  const { productName, money } = useBootstrap();
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.user?.roles);
  const canWrite = canWriteCatalog(roles);
  const [tab, setTab] = useState<Tab>("plans");

  const [planForm, setPlanForm] = useState({
    title: "",
    description: "",
    categoryId: "",
    sku: "",
    price: "",
    billingPeriodDays: "30",
  });
  const [newCat, setNewCat] = useState("");

  const [enrollCustomerId, setEnrollCustomerId] = useState("");
  const [enrollPlanId, setEnrollPlanId] = useState("");
  const [payMethod, setPayMethod] = useState("cash");

  const summary = useQuery({
    queryKey: ["subscriptions-summary"],
    queryFn: () => subscriptionsApi.summary(),
  });
  const plans = useQuery({
    queryKey: ["subscriptions-plans"],
    queryFn: () => subscriptionsApi.listPlans(),
  });
  const members = useQuery({
    queryKey: ["subscriptions-members"],
    queryFn: () => subscriptionsApi.list({ limit: 80 }),
    enabled: tab === "members" || tab === "enroll",
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => inventoryApi.listCategories(),
  });
  const activePlans = useMemo(
    () => (plans.data?.items ?? []).filter((p) => p.isActive),
    [plans.data],
  );

  const createCat = useMutation({
    mutationFn: () => inventoryApi.createCategory({ name: newCat.trim() }),
    onSuccess: (c) => {
      toast.success(`Category ${c.name}`);
      setNewCat("");
      setPlanForm((f) => ({ ...f, categoryId: c.id }));
      void qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const createPlan = useMutation({
    mutationFn: () =>
      subscriptionsApi.createPlan({
        title: planForm.title.trim(),
        description: planForm.description.trim() || undefined,
        categoryId: planForm.categoryId,
        sku: planForm.sku.trim(),
        price: Number(planForm.price),
        billingPeriodDays: Number(planForm.billingPeriodDays) || 30,
      }),
    onSuccess: () => {
      toast.success("Plan created");
      setPlanForm({
        title: "",
        description: "",
        categoryId: planForm.categoryId,
        sku: "",
        price: "",
        billingPeriodDays: "30",
      });
      void qc.invalidateQueries({ queryKey: ["subscriptions-plans"] });
      void qc.invalidateQueries({ queryKey: ["subscriptions-summary"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const togglePlan = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      subscriptionsApi.updatePlan(id, { isActive }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["subscriptions-plans"] });
      void qc.invalidateQueries({ queryKey: ["subscriptions-summary"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const enroll = useMutation({
    mutationFn: () =>
      subscriptionsApi.enroll({
        customerId: enrollCustomerId,
        productId: enrollPlanId,
        paymentMethod: payMethod,
        idempotencyKey: newIdempotencyKey("sub-enroll"),
      }),
    onSuccess: (r) => {
      toast.success(
        `Enrolled · ${r.order.orderNumber} · until ${new Date(r.subscription.currentPeriodEnd).toLocaleDateString()}`,
      );
      void qc.invalidateQueries({ queryKey: ["subscriptions-members"] });
      void qc.invalidateQueries({ queryKey: ["subscriptions-summary"] });
      void qc.invalidateQueries({ queryKey: ["subscriptions-plans"] });
      setTab("members");
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const renew = useMutation({
    mutationFn: (id: string) =>
      subscriptionsApi.renew(id, {
        paymentMethod: "cash",
        idempotencyKey: newIdempotencyKey("sub-renew"),
      }),
    onSuccess: () => {
      toast.success("Membership renewed");
      void qc.invalidateQueries({ queryKey: ["subscriptions-members"] });
      void qc.invalidateQueries({ queryKey: ["subscriptions-summary"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => subscriptionsApi.cancel(id),
    onSuccess: () => {
      toast.success("Membership cancelled");
      void qc.invalidateQueries({ queryKey: ["subscriptions-members"] });
      void qc.invalidateQueries({ queryKey: ["subscriptions-summary"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-[#0b1f33] sm:text-2xl">
          Plans · {productName}
        </h1>
        <p className="mt-1 text-sm text-[#5a6b7d]">
          Create memberships, enroll customers, renew or cancel — live billing.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Active plans", value: summary.data?.plans ?? "—" },
          {
            label: "Active members",
            value: summary.data?.activeMembers ?? "—",
          },
          { label: "Expired", value: summary.data?.expired ?? "—" },
          { label: "Cancelled", value: summary.data?.cancelled ?? "—" },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-[12px] border border-[#d9e0ea] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(11,31,51,0.04)]"
          >
            <p className="text-[0.7rem] font-medium text-[#5a6b7d]">{c.label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-[#0b1f33]">
              {c.value}
            </p>
          </div>
        ))}
      </div>

      <FloorTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "plans", label: "Plans" },
          { id: "enroll", label: "Enroll" },
          { id: "members", label: "Members" },
        ]}
      />

      {tab === "plans" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          {canWrite ? (
            <section className="rounded-[14px] border border-[#d9e0ea] bg-white p-4">
              <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
                New plan
              </h2>
              <p className="mt-0.5 text-[0.75rem] text-[#5a6b7d]">
                SKU must be 15–18 characters
              </p>
              <div className="mt-4 space-y-3">
                <div className="field-shell">
                  <Label>Plan name *</Label>
                  <Input
                    value={planForm.title}
                    onChange={(e) =>
                      setPlanForm((f) => ({ ...f, title: e.target.value }))
                    }
                    placeholder="Monthly membership"
                  />
                </div>
                <div className="field-shell">
                  <Label>Category *</Label>
                  <Select
                    value={planForm.categoryId}
                    onChange={(e) =>
                      setPlanForm((f) => ({
                        ...f,
                        categoryId: e.target.value,
                      }))
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
                      value={planForm.sku}
                      onChange={(e) =>
                        setPlanForm((f) => ({ ...f, sku: e.target.value }))
                      }
                      placeholder="PLAN-MONTHLY-001"
                    />
                  </div>
                  <div className="field-shell">
                    <Label>Period (days) *</Label>
                    <Input
                      inputMode="numeric"
                      value={planForm.billingPeriodDays}
                      onChange={(e) =>
                        setPlanForm((f) => ({
                          ...f,
                          billingPeriodDays: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="field-shell">
                  <Label>Price per period *</Label>
                  <Input
                    inputMode="decimal"
                    value={planForm.price}
                    onChange={(e) =>
                      setPlanForm((f) => ({ ...f, price: e.target.value }))
                    }
                    placeholder="999"
                  />
                </div>
                <div className="field-shell">
                  <Label>Description</Label>
                  <Input
                    value={planForm.description}
                    onChange={(e) =>
                      setPlanForm((f) => ({
                        ...f,
                        description: e.target.value,
                      }))
                    }
                  />
                </div>
                <Button
                  type="button"
                  disabled={
                    createPlan.isPending ||
                    !planForm.title.trim() ||
                    !planForm.categoryId ||
                    planForm.sku.trim().length < 15 ||
                    !Number(planForm.price)
                  }
                  onClick={() => createPlan.mutate()}
                >
                  Create plan
                </Button>
              </div>
            </section>
          ) : (
            <section className="rounded-[14px] border border-[#d9e0ea] bg-white p-4 text-sm text-[#5a6b7d]">
              Catalog write access required to create plans.
            </section>
          )}

          <section className="rounded-[14px] border border-[#d9e0ea] bg-white p-4">
            <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
              Plan catalog
            </h2>
            <ul className="mt-3 divide-y divide-[#eef2f8]">
              {(plans.data?.items ?? []).map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-[#0b1f33]">
                      {p.title}
                      {!p.isActive ? (
                        <span className="ml-2 text-xs font-medium text-[#b45309]">
                          inactive
                        </span>
                      ) : null}
                    </p>
                    <p className="font-mono text-[0.7rem] text-[#5a6b7d]">
                      {p.sku} · {p.billingPeriodDays}d · {p.activeMembers}{" "}
                      active
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums text-[#0b1f33]">
                      {money(p.price)}
                    </span>
                    {canWrite ? (
                      <Button
                        size="sm"
                        variant="soft"
                        disabled={togglePlan.isPending}
                        onClick={() =>
                          togglePlan.mutate({
                            id: p.id,
                            isActive: !p.isActive,
                          })
                        }
                      >
                        {p.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
              {!plans.data?.items?.length && !plans.isLoading ? (
                <li className="py-8 text-center text-sm text-[#5a6b7d]">
                  No plans yet — create one on the left.
                </li>
              ) : null}
            </ul>
          </section>
        </div>
      ) : null}

      {tab === "enroll" ? (
        <section className="mx-auto max-w-lg rounded-[14px] border border-[#d9e0ea] bg-white p-5">
          <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
            Enroll customer
          </h2>
          <p className="mt-0.5 text-[0.75rem] text-[#5a6b7d]">
            Charges the plan price and starts the billing period now.
          </p>
          <div className="mt-4 space-y-3">
            <div className="field-shell">
              <Label>Customer *</Label>
              <CustomerPicker
                value={enrollCustomerId}
                onChange={(id) => setEnrollCustomerId(id)}
                placeholder="Search name or phone…"
              />
            </div>
            <div className="field-shell">
              <Label>Plan *</Label>
              <Select
                value={enrollPlanId}
                onChange={(e) => setEnrollPlanId(e.target.value)}
              >
                <option value="">Select…</option>
                {activePlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} · {money(p.price)} / {p.billingPeriodDays}d
                  </option>
                ))}
              </Select>
            </div>
            <div className="field-shell">
              <Label>Payment</Label>
              <Select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
              </Select>
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={
                enroll.isPending || !enrollCustomerId || !enrollPlanId
              }
              onClick={() => enroll.mutate()}
            >
              {enroll.isPending ? "Enrolling…" : "Charge & enroll"}
            </Button>
          </div>
        </section>
      ) : null}

      {tab === "members" ? (
        <section className="rounded-[14px] border border-[#d9e0ea] bg-white p-4">
          <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
            Members
          </h2>
          <ul className="mt-3 divide-y divide-[#eef2f8]">
            {(members.data?.items ?? []).map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[#0b1f33]">
                    {m.customer.fullName}
                    <span className="ml-2 rounded-md bg-[#e8eefb] px-1.5 py-0.5 text-[0.65rem] font-bold uppercase text-[#1341a8]">
                      {m.status}
                    </span>
                  </p>
                  <p className="text-[0.75rem] text-[#5a6b7d]">
                    {m.plan.title} · {money(m.price)} · ends{" "}
                    {new Date(m.currentPeriodEnd).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {m.status !== "cancelled" ? (
                    <>
                      <Button
                        size="sm"
                        disabled={renew.isPending}
                        onClick={() => renew.mutate(m.id)}
                      >
                        Renew
                      </Button>
                      {m.status === "active" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={cancel.isPending}
                          onClick={() => cancel.mutate(m.id)}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </li>
            ))}
            {!members.data?.items?.length && !members.isLoading ? (
              <li className="py-8 text-center text-sm text-[#5a6b7d]">
                No members yet — enroll a customer.
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
