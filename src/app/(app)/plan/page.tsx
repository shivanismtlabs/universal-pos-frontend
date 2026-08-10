"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  CreditCard,
  FileText,
  Loader2,
  Rocket,
} from "lucide-react";
import { paymentsApi, platformBillingApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { cn, formatInr } from "@/lib/utils";

type PlanRow = {
  id: string;
  code: string;
  name: string;
  priceInr?: string | number;
  priceAmount?: string | number;
  limits?: Record<string, unknown> | null;
  features?: Record<string, unknown> | null;
};

type InvoiceRow = {
  id: string;
  sessionId: string | null;
  createdAt: string;
  planCode: string | null;
  planName: string | null;
  amount: number | string | null;
  currency: string;
  via: string;
};

function limitNumber(
  limits: Record<string, unknown> | null | undefined,
  keys: string[],
): number | null {
  if (!limits) return null;
  for (const key of keys) {
    const v = limits[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) {
      return Number(v);
    }
  }
  return null;
}

function planAmount(plan: PlanRow): number {
  const n = Number(plan.priceInr ?? plan.priceAmount ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function planDescription(plan: PlanRow): string {
  const code = plan.code.toLowerCase();
  if (code.includes("pro")) {
    return "Advanced features for growing retail businesses.";
  }
  if (code.includes("enter")) {
    return "Custom solutions for large-scale operations.";
  }
  return "Essential tools for small shops just getting started.";
}

function planHighlights(plan: PlanRow): string[] {
  const limits = plan.limits ?? {};
  const features = plan.features ?? {};
  const fromJson: string[] = [];

  const seats = limitNumber(limits, ["users", "seats", "maxSeats", "max_users"]);
  const locations = limitNumber(limits, [
    "locations",
    "maxLocations",
    "max_locations",
  ]);
  if (seats != null) fromJson.push(`Up to ${seats} staff seats`);
  if (locations != null) fromJson.push(`Up to ${locations} locations`);

  if (Array.isArray(features.list)) {
    for (const item of features.list) {
      if (typeof item === "string" && item.trim()) fromJson.push(item.trim());
    }
  }

  if (fromJson.length) return fromJson.slice(0, 5);

  const code = plan.code.toLowerCase();
  if (code.includes("pro")) {
    return [
      "Up to 50 staff seats",
      "Up to 10 locations",
      "Advanced analytics & export",
      "Priority support",
    ];
  }
  return ["Up to 10 staff seats", "Up to 2 locations", "Basic reporting"];
}

function UsageBar({
  label,
  used,
  max,
}: {
  label: string;
  used: number;
  max: number | null;
}) {
  const safeMax = max && max > 0 ? max : null;
  const pct = safeMax
    ? Math.min(100, Math.round((used / safeMax) * 100))
    : 0;

  return (
    <div className="min-w-[8rem] flex-1">
      <div className="flex items-center justify-between gap-2 text-[0.75rem]">
        <span className="font-medium text-[#5a6b7d]">{label}</span>
        <span className="tabular-nums text-[#0b1f33]">
          {used}
          {safeMax != null ? ` / ${safeMax}` : ""}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#e8eef5]">
        <div
          className="h-full rounded-full bg-[#1a56db] transition-[width]"
          style={{ width: `${safeMax ? pct : 12}%` }}
        />
      </div>
    </div>
  );
}

function returnUrls() {
  const origin = window.location.origin;
  return {
    successUrl: `${origin}/plan?checkout=success`,
    cancelUrl: `${origin}/plan?checkout=cancel`,
  };
}

export default function PlanPage() {
  const qc = useQueryClient();
  const confirmedSession = useRef<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null);

  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: () => platformBillingApi.listPlans(),
  });
  const sub = useQuery({
    queryKey: ["subscription"],
    queryFn: () => platformBillingApi.subscription(),
  });
  const stripeConfig = useQuery({
    queryKey: ["stripe-config"],
    queryFn: () => paymentsApi.stripeConfig(),
  });
  const invoices = useQuery({
    queryKey: ["platform-invoices"],
    queryFn: () => platformBillingApi.listInvoices(),
    enabled: historyOpen,
  });

  const confirmCheckout = useMutation({
    mutationFn: (sessionId: string) =>
      platformBillingApi.confirmCheckout(sessionId),
    onSuccess: (data) => {
      toast.success(
        data.alreadyApplied
          ? "Payment already applied — plan is active"
          : "Payment successful — plan activated",
      );
      void qc.invalidateQueries({ queryKey: ["subscription"] });
      void qc.invalidateQueries({ queryKey: ["bootstrap"] });
      void qc.invalidateQueries({ queryKey: ["tenant-bootstrap"] });
      void qc.invalidateQueries({ queryKey: ["platform-invoices"] });
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", url.pathname + url.search);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError
          ? e.messages.join(", ")
          : "Could not confirm payment",
      ),
  });

  // After Stripe Hosted Checkout redirect
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("checkout");
    const sessionId = params.get("session_id");

    if (flag === "cancel") {
      toast.message("Checkout cancelled", {
        description: "No charge was made. You can try again when ready.",
      });
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      window.history.replaceState({}, "", url.pathname + url.search);
      return;
    }

    if (flag === "success" && sessionId) {
      if (confirmedSession.current === sessionId) return;
      confirmedSession.current = sessionId;
      confirmCheckout.mutate(sessionId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const checkout = useMutation({
    mutationFn: async (planId: string) => {
      setPayingPlanId(planId);
      const { successUrl, cancelUrl } = returnUrls();
      return platformBillingApi.createCheckout({
        planId,
        successUrl,
        cancelUrl,
      });
    },
    onSuccess: (data) => {
      if (data.free) {
        toast.success("Plan activated");
        void qc.invalidateQueries({ queryKey: ["subscription"] });
        void qc.invalidateQueries({ queryKey: ["bootstrap"] });
        setPayingPlanId(null);
        return;
      }
      if (data.url) {
        toast.message("Redirecting to secure payment…");
        window.location.assign(data.url);
        return;
      }
      toast.error("Payment session could not be started");
      setPayingPlanId(null);
    },
    onError: (e) => {
      setPayingPlanId(null);
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Checkout failed",
      );
    },
  });

  const cancel = useMutation({
    mutationFn: () => platformBillingApi.cancel(),
    onSuccess: () => {
      toast.success("Subscription cancelled");
      void qc.invalidateQueries({ queryKey: ["subscription"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Cancel failed",
      ),
  });

  const planList = (plans.data ?? []) as PlanRow[];
  const stripeOn = Boolean(stripeConfig.data?.enabled);

  const currentPlan = useMemo(() => {
    if (!sub.data?.plan) return undefined;
    return planList.find(
      (p) =>
        p.code === sub.data?.plan?.code || p.name === sub.data?.plan?.name,
    );
  }, [planList, sub.data?.plan]);

  const currentPrice =
    currentPlan?.priceInr ??
    currentPlan?.priceAmount ??
    sub.data?.plan?.priceInr;
  const seatsUsed = sub.data?.seatsUsed ?? 1;
  const locationsUsed = sub.data?.locationsUsed ?? 1;
  const seatMax = limitNumber(currentPlan?.limits ?? null, [
    "users",
    "seats",
    "maxSeats",
    "max_users",
  ]);
  const locationMax = limitNumber(currentPlan?.limits ?? null, [
    "locations",
    "maxLocations",
    "max_locations",
  ]);

  const recommendedCode = planList.find((p) =>
    p.code.toLowerCase().includes("pro"),
  )?.code;

  const periodLabel = useMemo(() => {
    if (sub.data?.currentPeriodEnd) {
      return new Date(sub.data.currentPeriodEnd).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [sub.data?.currentPeriodEnd]);

  const busy =
    checkout.isPending ||
    confirmCheckout.isPending ||
    cancel.isPending;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-[#0b1f33] sm:text-[1.75rem]">
          Your Universal POS software plan
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[#5a6b7d]">
          This is what you pay so your shop can use Universal POS — not the
          membership plans you sell to your customers. Card payment via Stripe;
          the plan activates only after payment succeeds.
        </p>
        {!stripeOn && stripeConfig.isFetched ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Stripe is not configured on the server. Paid upgrades will not work
            until{" "}
            <code className="text-xs">STRIPE_SECRET_KEY</code> and{" "}
            <code className="text-xs">STRIPE_PUBLISHABLE_KEY</code> are set.
          </p>
        ) : null}
        {confirmCheckout.isPending ? (
          <p className="mt-2 inline-flex items-center gap-2 text-sm text-[#1a56db]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Confirming payment with Stripe…
          </p>
        ) : null}
      </header>

      {/* Current plan + usage */}
      <section className="rounded-xl border border-[#d9e0ea] bg-white px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#1a56db] text-white">
            <Rocket className="h-5 w-5" strokeWidth={1.75} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
                {sub.data?.plan?.name ?? "No plan"} Plan
              </h2>
              {sub.data && sub.data.status === "active" ? (
                <span className="rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-[#166534] uppercase">
                  Active
                </span>
              ) : sub.data?.status === "cancelled" ? (
                <span className="rounded-full bg-[#fef2f2] px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-[#991b1b] uppercase">
                  Cancelled
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm text-[#5a6b7d]">
              {currentPrice != null ? (
                <>
                  {formatInr(currentPrice)} / month · current period ends{" "}
                  {periodLabel}
                </>
              ) : (
                "Select a plan below to get started"
              )}
            </p>

            <div className="mt-4 flex flex-wrap gap-5">
              <UsageBar label="Seats" used={seatsUsed} max={seatMax} />
              <UsageBar
                label="Locations"
                used={locationsUsed}
                max={locationMax}
              />
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0"
            disabled={busy || !sub.data || sub.data.status === "cancelled"}
            onClick={() => {
              if (
                window.confirm(
                  "Cancel this subscription? You can resubscribe later by paying again.",
                )
              ) {
                cancel.mutate();
              }
            }}
          >
            Cancel plan
          </Button>
        </div>
      </section>

      {/* Plan cards */}
      <section>
        {plans.isLoading ? (
          <div className="rounded-xl border border-dashed border-[#d9e0ea] bg-white px-5 py-14 text-center text-sm text-[#5a6b7d]">
            Loading plans…
          </div>
        ) : !planList.length ? (
          <div className="rounded-xl border border-dashed border-[#d9e0ea] bg-white px-5 py-14 text-center text-sm text-[#5a6b7d]">
            No plans available yet.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {planList.map((p) => {
              const active =
                currentPlan?.id === p.id ||
                sub.data?.plan?.code === p.code ||
                sub.data?.plan?.name === p.name;
              const price = planAmount(p);
              const highlights = planHighlights(p);
              const recommended =
                !active &&
                recommendedCode != null &&
                p.code === recommendedCode;
              const isPaying = payingPlanId === p.id && checkout.isPending;

              return (
                <article
                  key={p.id}
                  className={cn(
                    "relative flex flex-col rounded-xl border bg-white p-5",
                    recommended
                      ? "border-[#1a56db] shadow-[0_8px_24px_-16px_rgba(26,86,219,0.55)]"
                      : "border-[#d9e0ea]",
                  )}
                >
                  {recommended ? (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-[#1a56db] px-2.5 py-0.5 text-[0.62rem] font-semibold tracking-wide text-white uppercase">
                      Recommended
                    </span>
                  ) : null}

                  <h3 className="text-lg font-bold text-[#0b1f33]">{p.name}</h3>
                  <p className="mt-1 text-sm leading-snug text-[#5a6b7d]">
                    {planDescription(p)}
                  </p>

                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-[1.75rem] font-bold tracking-tight tabular-nums text-[#0b1f33]">
                      {formatInr(price)}
                    </span>
                    <span className="text-sm text-[#5a6b7d]">/ mo</span>
                  </div>

                  <ul className="mt-5 flex-1 space-y-2.5">
                    {highlights.map((line) => (
                      <li
                        key={line}
                        className="flex items-start gap-2 text-sm text-[#2c3e50]"
                      >
                        {recommended ? (
                          <Check
                            className="mt-0.5 h-4 w-4 shrink-0 text-[#1a56db]"
                            strokeWidth={2.25}
                          />
                        ) : (
                          <span
                            aria-hidden
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1a56db]"
                          />
                        )}
                        {line}
                      </li>
                    ))}
                  </ul>

                  <Button
                    type="button"
                    className="mt-6 w-full"
                    variant={active ? "secondary" : "default"}
                    disabled={busy || active || (price > 0 && !stripeOn)}
                    onClick={() => checkout.mutate(p.id)}
                  >
                    {active
                      ? "Current plan"
                      : isPaying
                        ? "Opening Stripe…"
                        : price > 0
                          ? `Pay ${formatInr(price)} · ${p.name}`
                          : `Activate ${p.name}`}
                  </Button>
                  {!active && price > 0 ? (
                    <p className="mt-2 text-center text-[0.7rem] text-[#8b9aab]">
                      Secure card payment · powered by Stripe
                    </p>
                  ) : null}
                </article>
              );
            })}

            <article className="relative flex flex-col rounded-xl border border-[#d9e0ea] bg-white p-5">
              <h3 className="text-lg font-bold text-[#0b1f33]">Enterprise</h3>
              <p className="mt-1 text-sm leading-snug text-[#5a6b7d]">
                Custom solutions for large-scale operations.
              </p>
              <p className="mt-4 text-[1.75rem] font-bold tracking-tight text-[#0b1f33]">
                Custom
              </p>
              <p className="text-sm text-[#5a6b7d]">pricing</p>

              <ul className="mt-5 flex-1 space-y-2.5">
                {[
                  "Unlimited everything",
                  "Dedicated account manager",
                  "Custom integrations",
                ].map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-2 text-sm text-[#2c3e50]"
                  >
                    <span
                      aria-hidden
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1a56db]"
                    />
                    {line}
                  </li>
                ))}
              </ul>

              <Button
                type="button"
                variant="secondary"
                className="mt-6 w-full"
                onClick={() => {
                  window.location.href =
                    "mailto:sales@walit.in?subject=Universal%20POS%20Enterprise";
                }}
              >
                Contact sales
              </Button>
            </article>
          </div>
        )}
      </section>

      {/* Billing footer */}
      <section className="space-y-4 border-t border-[#d9e0ea] pt-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
              Billing & invoices
            </h2>
            <p className="mt-0.5 text-sm text-[#5a6b7d]">
              {currentPrice != null && sub.data?.status === "active" ? (
                <>
                  Current period through {periodLabel}. Renew by paying again
                  before the period ends (auto-renew via webhooks can be added
                  next).
                </>
              ) : (
                "No active billing cycle — choose a plan and complete payment."
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm font-medium text-[#1a56db]">
            <span className="inline-flex items-center gap-1.5 text-[#5a6b7d]">
              <CreditCard className="h-4 w-4" strokeWidth={1.75} />
              Card on Stripe Checkout
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 hover:underline"
              onClick={() => setHistoryOpen((v) => !v)}
            >
              <FileText className="h-4 w-4" strokeWidth={1.75} />
              {historyOpen ? "Hide history" : "View history"}
            </button>
          </div>
        </div>

        {historyOpen ? (
          <div className="overflow-hidden rounded-xl border border-[#d9e0ea] bg-white">
            {invoices.isLoading ? (
              <p className="px-4 py-8 text-center text-sm text-[#5a6b7d]">
                Loading payments…
              </p>
            ) : !(invoices.data as InvoiceRow[] | undefined)?.length ? (
              <p className="px-4 py-8 text-center text-sm text-[#5a6b7d]">
                No paid invoices yet. Complete a plan payment to see history.
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[#eef2f7] bg-[#f8fafc] text-[0.7rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Plan</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoices.data as InvoiceRow[]).map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[#eef2f7] last:border-0"
                    >
                      <td className="px-4 py-2.5 text-[#5a6b7d]">
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-[#0b1f33]">
                        {row.planName ?? row.planCode ?? "—"}
                        <span className="ml-1.5 text-[0.7rem] text-[#8b9aab]">
                          {row.via}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums text-[#0b1f33]">
                        {formatInr(row.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
