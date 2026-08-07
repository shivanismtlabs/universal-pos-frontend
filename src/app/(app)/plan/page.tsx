"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  CreditCard,
  FileText,
  Rocket,
} from "lucide-react";
import { platformBillingApi } from "@/lib/api";
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
      "Up to 10 staff seats",
      "Unlimited locations",
      "Advanced analytics & export",
      "Priority support 24/7",
    ];
  }
  return [
    "Up to 2 staff seats",
    "Up to 2 locations",
    "Basic reporting",
  ];
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

export default function PlanPage() {
  const qc = useQueryClient();
  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: () => platformBillingApi.listPlans(),
  });
  const sub = useQuery({
    queryKey: ["subscription"],
    queryFn: () => platformBillingApi.subscription(),
  });

  const subscribe = useMutation({
    mutationFn: (planId: string) => platformBillingApi.subscribe(planId),
    onSuccess: () => {
      toast.success("Plan updated");
      void qc.invalidateQueries({ queryKey: ["subscription"] });
      void qc.invalidateQueries({ queryKey: ["bootstrap"] });
      void qc.invalidateQueries({ queryKey: ["tenant-bootstrap"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const planList = (plans.data ?? []) as PlanRow[];

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

  const nextInvoiceDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-[#0b1f33] sm:text-[1.75rem]">
          Manage your subscription
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[#5a6b7d]">
          Scale your plan as your business grows. View your current usage and
          explore options to unlock more features.
        </p>
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
              {sub.data ? (
                <span className="rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-[#166534] uppercase">
                  Active
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm text-[#5a6b7d]">
              {currentPrice != null ? (
                <>
                  {formatInr(currentPrice)} / month, billed monthly
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
            onClick={() =>
              toast.message("Cancel plan", {
                description: "Contact support to cancel your subscription.",
              })
            }
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
              const price = p.priceInr ?? p.priceAmount;
              const highlights = planHighlights(p);
              const recommended =
                !active && recommendedCode != null && p.code === recommendedCode;

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
                    disabled={subscribe.isPending || active}
                    onClick={() => subscribe.mutate(p.id)}
                  >
                    {active
                      ? "Current plan"
                      : subscribe.isPending
                        ? "Updating…"
                        : `Upgrade to ${p.name}`}
                  </Button>
                </article>
              );
            })}

            {/* Enterprise — contact sales (not in seed plans) */}
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
                onClick={() =>
                  toast.message("Contact sales", {
                    description: "Email sales@universalpos.com for Enterprise.",
                  })
                }
              >
                Contact sales
              </Button>
            </article>
          </div>
        )}
      </section>

      {/* Billing footer */}
      <section className="flex flex-wrap items-center justify-between gap-4 border-t border-[#d9e0ea] pt-5">
        <div>
          <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
            Billing & invoices
          </h2>
          <p className="mt-0.5 text-sm text-[#5a6b7d]">
            {currentPrice != null ? (
              <>
                Next invoice for {formatInr(currentPrice)} will be issued on{" "}
                {nextInvoiceDate}.
              </>
            ) : (
              "No billing cycle yet — select a plan to start."
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm font-medium text-[#1a56db]">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 hover:underline"
            onClick={() =>
              toast.message("Payment methods", {
                description: "Card on file can be wired with Stripe later.",
              })
            }
          >
            <CreditCard className="h-4 w-4" strokeWidth={1.75} />
            Payment methods
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 hover:underline"
            onClick={() =>
              toast.message("Invoice history", {
                description: "No invoices to show yet.",
              })
            }
          >
            <FileText className="h-4 w-4" strokeWidth={1.75} />
            View history
          </button>
        </div>
      </section>
    </div>
  );
}
