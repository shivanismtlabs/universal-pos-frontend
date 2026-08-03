"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { platformBillingApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/utils";

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
      toast.success("Subscription updated");
      void qc.invalidateQueries({ queryKey: ["subscription"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <p className="text-sm tracking-[0.18em] text-[#0f766e] uppercase">
          Platform
        </p>
        <h1 className="display mt-1 text-3xl text-[#111827]">Subscription</h1>
        <p className="mt-1 text-sm text-[#6b7280]">
          Shop plan for this tenant (SaaS billing — separate from customer POS
          payments)
        </p>
      </header>

      <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
        <h2 className="text-sm font-semibold">Current plan</h2>
        {sub.data ? (
          <p className="mt-2 text-sm">
            <span className="font-semibold">
              {sub.data.plan?.name ?? sub.data.plan?.code ?? "Plan"}
            </span>
            <span className="text-[#6b7280]"> · {sub.data.status}</span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-[#6b7280]">No active subscription</p>
        )}
      </section>

      <section className="rounded-2xl border border-[#e5e7eb] bg-white">
        <ul className="divide-y divide-[#f3f4f6]">
          {(plans.data ?? []).map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <p className="font-semibold text-[#111827]">{p.name}</p>
                <p className="text-sm text-[#6b7280]">
                  {p.code} · {formatInr(p.priceInr)}/mo
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={subscribe.isPending}
                onClick={() => subscribe.mutate(p.id)}
              >
                Select
              </Button>
            </li>
          ))}
          {!plans.data?.length ? (
            <li className="px-4 py-8 text-sm text-[#6b7280]">
              No plans seeded yet
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
