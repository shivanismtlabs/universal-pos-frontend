"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { paymentsApi } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

type MethodStatus = "ready" | "not_configured" | "provider_required";

type PaymentMethod = {
  id: string;
  label: string;
  isInternal: boolean;
  status: MethodStatus;
  statusLabel: string;
  description: string;
  configHint?: string;
};

type ApiMethodRow = {
  method?: string;
  label?: string;
  displayName?: string;
  isInternal?: boolean;
  status?: string;
  description?: string;
  configHint?: string;
  reason?: string;
  configured?: boolean;
  available?: boolean;
  requiresProvider?: boolean;
};

function unwrapMethodRows(payload: unknown): ApiMethodRow[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as ApiMethodRow[];
  if (typeof payload === "object") {
    const rec = payload as { items?: unknown; data?: unknown; methods?: unknown };
    if (Array.isArray(rec.items)) return rec.items as ApiMethodRow[];
    if (Array.isArray(rec.methods)) return rec.methods as ApiMethodRow[];
    if (Array.isArray(rec.data)) return rec.data as ApiMethodRow[];
  }
  return [];
}

export default function PaymentMethodsSettingsPage() {
  const methodsQ = useQuery({
    queryKey: ["payment-methods-settings"],
    queryFn: () => paymentsApi.methods(),
  });

  const methods: PaymentMethod[] = useMemo(() => {
    return unwrapMethodRows(methodsQ.data).map((m) => {
      const configured = m.configured !== false;
      const available = m.available !== false;
      const status: MethodStatus =
        m.status === "ready" ||
        m.status === "not_configured" ||
        m.status === "provider_required"
          ? m.status
          : !configured || !available
            ? m.requiresProvider
              ? "provider_required"
              : "not_configured"
            : "ready";
      const statusLabel =
        status === "ready"
          ? "Ready"
          : status === "not_configured"
            ? "Not configured"
            : "Provider required";
      return {
        id: m.method || m.label || m.displayName || "method",
        label: m.label ?? m.displayName ?? m.method ?? "Method",
        isInternal: m.isInternal ?? false,
        status,
        statusLabel,
        description: m.description ?? "",
        configHint: m.configHint ?? m.reason,
      };
    });
  }, [methodsQ.data]);

  const STATUS_STYLES: Record<MethodStatus, string> = {
    ready: "bg-[#d1fae5] text-[#065f46]",
    not_configured: "bg-[#fef3c7] text-[#92400e]",
    provider_required: "bg-[#fee2e2] text-[#991b1b]",
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Payment Methods"
        subtitle="Payment methods available at checkout. Provider-backed methods require credentials in Settings → Counter."
      />

      {methodsQ.isLoading ? (
        <p className="text-sm text-[#6b7280]">Loading…</p>
      ) : methodsQ.isError ? (
        <p className="text-sm text-[#b91c1c]">Could not load payment methods.</p>
      ) : (
        <section className="rounded-2xl border border-[#e5e7eb] bg-white">
          {methods.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-[#6b7280]">
              No payment methods returned from API.
            </p>
          ) : (
            <ul className="divide-y divide-[#f3f4f6]">
              {methods.map((m) => (
                <li
                  key={m.id}
                  className="flex items-start justify-between gap-4 px-5 py-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[#0b1f33] text-sm">
                        {m.label}
                      </p>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase",
                          STATUS_STYLES[m.status],
                        )}
                      >
                        {m.statusLabel}
                      </span>
                      {m.isInternal ? (
                        <span className="rounded bg-[#eff6ff] px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase text-[#1a56db]">
                          Internal
                        </span>
                      ) : null}
                    </div>
                    {m.description ? (
                      <p className="mt-0.5 text-[0.75rem] text-[#5a6b7d]">
                        {m.description}
                      </p>
                    ) : null}
                    {m.configHint ? (
                      <p className="mt-1 text-[0.72rem] text-[#b45309]">
                        {m.configHint}
                      </p>
                    ) : null}
                  </div>
                  <span className="font-mono text-[0.72rem] text-[#8b9bb0] shrink-0">
                    {m.id}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5 text-sm text-[#5a6b7d] space-y-2">
        <p className="font-semibold text-[#0b1f33]">How payment methods work</p>
        <ul className="space-y-1 list-disc list-inside text-[0.8rem]">
          <li>
            <strong>Cash / Gift Card / Store Credit</strong> — internal,
            confirmed immediately at checkout.
          </li>
          <li>
            <strong>Card / UPI</strong> — provider-backed (Stripe). Charge
            creates a pending intent; payment succeeds only on provider
            confirmation.
          </li>
          <li>
            <strong>Bank Transfer</strong> — pending until a finance user
            confirms receipt.
          </li>
          <li>
            <strong>QR / Wallet / EMI</strong> — require a configured payment
            provider. Checkout will show &quot;Not configured&quot; until a provider is
            set up.
          </li>
        </ul>
        <p className="text-[0.72rem] text-[#8b9bb0]">
          External payment completion never depends on business type. Any
          unknown business can use any configured tender.
        </p>
      </section>
    </div>
  );
}
