"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { customersApi, notifyApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

type FormValues = {
  customerId: string;
  phone: string;
  templateKey: string;
  orderNumber: string;
  customMessage: string;
};

const TEMPLATES = [
  { value: "order_ready_for_pickup", label: "Order ready for pickup" },
  { value: "fitting_reminder", label: "Fitting reminder" },
  { value: "payment_received", label: "Payment received" },
  { value: "return_due", label: "Return due reminder" },
  { value: "custom", label: "Custom message" },
];

function templateLabel(key: string) {
  return TEMPLATES.find((t) => t.value === key)?.label ?? key;
}

function StatusPill({ status }: { status: string }) {
  const mock = status.includes("mock");
  const ok = status === "sent" || status === "sent_mock";
  const fail = status.includes("fail") || status.includes("error");
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold tracking-wide uppercase",
        fail
          ? "bg-red-50 text-red-700"
          : mock
            ? "bg-amber-50 text-amber-800"
            : ok
              ? "bg-[#ecfdf8] text-[#0f766e]"
              : "bg-[#f3f4f6] text-[#4b5563]",
      )}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

export default function NotifyPage() {
  const qc = useQueryClient();

  const config = useQuery({
    queryKey: ["notify-config"],
    queryFn: () => notifyApi.config(),
  });
  const logs = useQuery({
    queryKey: ["notify-logs"],
    queryFn: () => notifyApi.listLogs({ limit: 30 }),
  });
  const customers = useQuery({
    queryKey: ["customers", "pick"],
    queryFn: () => customersApi.list({ limit: 100 }),
  });

  const form = useForm<FormValues>({
    defaultValues: {
      customerId: "",
      phone: "",
      templateKey: "order_ready_for_pickup",
      orderNumber: "ORD-DEMO-READY",
      customMessage: "",
    },
  });

  const send = useMutation({
    mutationFn: (v: FormValues) => {
      const payload: Record<string, unknown> = {
        orderNumber: v.orderNumber || undefined,
      };
      if (v.templateKey === "custom") {
        payload.message = v.customMessage;
      }
      const selected = (customers.data?.items ?? []).find(
        (c) => c.id === v.customerId,
      );
      if (selected) payload.customerName = selected.fullName;

      return notifyApi.send({
        channel: "whatsapp",
        templateKey: v.templateKey,
        customerId: v.customerId || undefined,
        phone: v.phone || undefined,
        payload,
      });
    },
    onSuccess: (row) => {
      toast.success(
        row.status === "sent_mock"
          ? "Mock WhatsApp sent (check logs)"
          : "WhatsApp sent",
      );
      void qc.invalidateQueries({ queryKey: ["notify-logs"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Send failed"),
  });

  const cfg = config.data;
  const items = logs.data?.items ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
      <header>
        <p className="text-sm tracking-[0.2em] text-[#0f766e] uppercase">
          Notify
        </p>
        <h1 className="display mt-2 text-3xl text-[#111827] sm:text-4xl">
          WhatsApp
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#6b7280]">
          Send pickup, fitting, and payment messages via Gupshup. Mock mode logs
          the flow without delivering.
        </p>
      </header>

      <div
        className={cn(
          "rounded-xl border px-4 py-3 text-sm leading-relaxed",
          cfg?.mock
            ? "border-amber-200 bg-amber-50 text-amber-950"
            : "border-[#99f6e4] bg-[#ecfdf8] text-[#0f766e]",
        )}
      >
        {config.isLoading
          ? "Checking provider…"
          : cfg?.mock
            ? "Mock mode ON — messages are logged, not delivered. Add Gupshup keys and set WHATSAPP_MOCK=false for live send."
            : `Live Gupshup · source ${cfg?.source} · app ${cfg?.appName}`}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <form
          className="rounded-2xl border border-[#e5e7eb] bg-white p-5 sm:p-6"
          onSubmit={form.handleSubmit((v) => send.mutate(v))}
          noValidate
        >
          <h2 className="display text-2xl text-[#111827]">Send message</h2>
          <p className="mt-1 text-sm text-[#6b7280]">
            Choose a customer or enter a phone number
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <Label>Customer</Label>
              <select
                className="mt-1.5 select-field"
                {...form.register("customerId")}
              >
                <option value="">Select (optional if phone set)</option>
                {(customers.data?.items ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} · {c.phone}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Phone override</Label>
                <Input
                  className="mt-1.5"
                  placeholder="9811111111"
                  {...form.register("phone")}
                />
              </div>
              <div>
                <Label>Order number</Label>
                <Input className="mt-1.5" {...form.register("orderNumber")} />
              </div>
            </div>

            <div>
              <Label>Template</Label>
              <select
                className="mt-1.5 select-field"
                {...form.register("templateKey")}
              >
                {TEMPLATES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {form.watch("templateKey") === "custom" ? (
              <div>
                <Label>Custom message</Label>
                <Input className="mt-1.5" {...form.register("customMessage")} />
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={send.isPending}>
              {send.isPending ? "Sending…" : "Send WhatsApp"}
            </Button>
          </div>
        </form>

        <section className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
          <div className="flex items-end justify-between border-b border-[#e5e7eb] px-5 py-4">
            <div>
              <h2 className="display text-2xl text-[#111827]">Recent logs</h2>
              <p className="mt-1 text-sm text-[#6b7280]">
                {logs.isLoading ? "Loading…" : `${items.length} recent`}
              </p>
            </div>
          </div>

          <ul className="scroll-soft max-h-[32rem] divide-y divide-[#f3f4f6] overflow-y-auto">
            {items.map((row) => {
              const destination = String(
                (row.payload as { destination?: string })?.destination ?? "",
              );
              const toName = row.customer?.fullName ?? null;
              return (
                <li key={row.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[0.95rem] font-semibold text-[#111827]">
                        {toName ?? (destination || "Unknown recipient")}
                      </p>
                      {destination ? (
                        <p className="mt-0.5 text-sm tabular-nums text-[#6b7280]">
                          {destination}
                        </p>
                      ) : null}
                    </div>
                    <StatusPill status={row.status} />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-[0.65rem] font-semibold tracking-wide text-[#9ca3af] uppercase">
                        When
                      </p>
                      <p className="mt-0.5 text-[#374151]">
                        {formatDate(row.createdAt)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[0.65rem] font-semibold tracking-wide text-[#9ca3af] uppercase">
                        Template
                      </p>
                      <p className="mt-0.5 truncate text-[#374151]">
                        {templateLabel(row.templateKey)}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {!logs.isLoading && !items.length ? (
            <p className="px-5 py-10 text-center text-sm text-[#6b7280]">
              No notifications yet — send one from the form.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
