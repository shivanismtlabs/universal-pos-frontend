"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { customersApi, notifyApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatDate, cn } from "@/lib/utils";

type FormValues = {
  customerId: string;
  phone: string;
  templateKey: string;
  orderNumber: string;
  customMessage: string;
};

const SALE_TEMPLATES = [
  { value: "payment_received", label: "Payment received" },
  { value: "order_ready_for_pickup", label: "Order ready for pickup" },
  { value: "sale_invoice", label: "Sale invoice" },
  { value: "birthday_wish", label: "Birthday wish" },
  { value: "custom", label: "Custom message" },
];

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
              ? "bg-[#e8eefb] text-[#0b1f33]"
              : "bg-[#f3f4f6] text-[#4b5563]",
      )}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

function BirthdayRemindersPanel() {
  const qc = useQueryClient();
  const upcoming = useQuery({
    queryKey: ["notify-birthdays"],
    queryFn: () => notifyApi.birthdaysUpcoming(30),
  });
  const sendToday = useMutation({
    mutationFn: () => notifyApi.sendBirthdaysToday(["sms", "whatsapp", "email"]),
    onSuccess: (res) => {
      toast.success(
        res.sentFor
          ? `Birthday wishes queued for ${res.sentFor} customer(s)`
          : "No opt-in birthdays today",
      );
      void qc.invalidateQueries({ queryKey: ["notify-logs"] });
      void qc.invalidateQueries({ queryKey: ["notify-birthdays"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Send failed",
      ),
  });

  const items = upcoming.data?.items ?? [];

  return (
    <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="display text-2xl text-[#111827]">
            Birthday reminders
          </h2>
          <p className="mt-1 text-sm text-[#6b7280]">
            Optional — only customers with a birthday on file and marketing
            opt-in. Add DOB on the Customers screen.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={sendToday.isPending}
          onClick={() => sendToday.mutate()}
        >
          {sendToday.isPending ? "Sending…" : "Send today’s wishes"}
        </Button>
      </div>
      <ul className="mt-4 max-h-48 divide-y divide-[#f3f4f6] overflow-y-auto text-sm">
        {upcoming.isLoading ? (
          <li className="py-3 text-[#6b7280]">Loading…</li>
        ) : !items.length ? (
          <li className="py-3 text-[#6b7280]">
            No birthdays in the next 30 days
          </li>
        ) : (
          items.slice(0, 20).map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2 py-2"
            >
              <div>
                <p className="font-medium text-[#111827]">{c.fullName}</p>
                <p className="text-xs text-[#6b7280]">
                  {c.dateOfBirth} · in {c.daysUntil}d · {c.phone}
                </p>
              </div>
              <span
                className={cn(
                  "text-[0.65rem] font-semibold uppercase",
                  c.canSend ? "text-emerald-700" : "text-[#9ca3af]",
                )}
              >
                {c.canSend ? "Opted in" : "No opt-in"}
              </span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

export default function NotifyPage() {
  const qc = useQueryClient();
  const TEMPLATES = SALE_TEMPLATES;
  const templateLabel = (key: string) =>
    TEMPLATES.find((t) => t.value === key)?.label ?? key;

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
      templateKey: "payment_received",
      orderNumber: "",
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
        <p className="text-sm tracking-[0.2em] text-[#0b1f33] uppercase">
          Notify
        </p>
        <h1 className="display mt-2 text-3xl text-[#111827] sm:text-4xl">
          Messages & reminders
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#6b7280]">
          WhatsApp, email/SMS invoices, and optional birthday reminders.
          Email/SMS use mock delivery until EMAIL_WEBHOOK_URL / SMS_WEBHOOK_URL
          are set.
        </p>
      </header>

      <BirthdayRemindersPanel />

      <div
        className={cn(
          "rounded-xl border px-4 py-3 text-sm leading-relaxed",
          cfg?.mock
            ? "border-amber-200 bg-amber-50 text-amber-950"
            : "border-[#8b9bb0] bg-[#e8eefb] text-[#0b1f33]",
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
              <Select
                className="mt-1.5 select-field"
                {...form.register("customerId")}
              >
                <option value="">Select (optional if phone set)</option>
                {(customers.data?.items ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} · {c.phone}
                  </option>
                ))}
              </Select>
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
              <Select
                className="mt-1.5 select-field"
                {...form.register("templateKey")}
              >
                {TEMPLATES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
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
