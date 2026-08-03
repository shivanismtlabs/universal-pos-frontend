"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  appointmentsApi,
  ordersApi,
  reportsApi,
} from "@/lib/api";
import {
  formatDate,
  formatInr,
  moneyNumber,
  todayYmd,
  toYmd,
} from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";
import { canFinance, hasAnyRole } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { FadeIn, HoverLift, Stagger, StaggerItem } from "@/components/motion";

const OPEN_STATUSES = new Set([
  "quote",
  "reserved",
  "fitted",
  "ready",
  "checked_out",
  "returned",
  "inspected",
]);

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const finance = canFinance(user?.roles);
  const canSeeFittings = hasAnyRole(user?.roles, [
    "admin",
    "manager",
    "cashier",
    "fitter",
  ]);
  const today = todayYmd();

  const orders = useQuery({
    queryKey: ["orders", "floor"],
    queryFn: () => ordersApi.list({ limit: 100 }),
  });
  const appointments = useQuery({
    queryKey: ["appointments", "today", today],
    queryFn: () => {
      const from = new Date(`${today}T00:00:00`);
      const to = new Date(`${today}T23:59:59.999`);
      return appointmentsApi.list({
        limit: 50,
        status: "scheduled",
        from: from.toISOString(),
        to: to.toISOString(),
      });
    },
    enabled: canSeeFittings,
  });
  const balances = useQuery({
    queryKey: ["reports", "balances"],
    queryFn: () => reportsApi.balances(),
    enabled: finance,
  });
  const salesToday = useQuery({
    queryKey: ["reports", "sales", today],
    queryFn: () => reportsApi.salesSummary(today, today),
    enabled: finance,
  });
  const paymentsToday = useQuery({
    queryKey: ["reports", "payments", today],
    queryFn: () => reportsApi.paymentsSummary(today, today),
    enabled: finance,
  });
  const utilization = useQuery({
    queryKey: ["reports", "util"],
    queryFn: () => reportsApi.inventoryUtilization(),
    enabled: finance,
  });

  const items = orders.data?.items ?? [];

  const pickupsToday = useMemo(
    () =>
      items.filter(
        (o) =>
          toYmd(o.pickupDate) === today &&
          ["reserved", "fitted", "ready"].includes(o.status),
      ),
    [items, today],
  );

  const returnsDueToday = useMemo(
    () =>
      items.filter(
        (o) =>
          toYmd(o.returnDueDate) === today && o.status === "checked_out",
      ),
    [items, today],
  );

  const overdueReturns = useMemo(
    () =>
      items.filter((o) => {
        const due = toYmd(o.returnDueDate);
        return (
          o.status === "checked_out" && due != null && due < today
        );
      }),
    [items, today],
  );

  const readyForPickup = useMemo(
    () => items.filter((o) => o.status === "ready"),
    [items],
  );

  const openCount = items.filter((o) => OPEN_STATUSES.has(o.status)).length;

  const utilRows = useMemo(() => {
    const raw = utilization.data?.byAvailabilityStatus;
    if (Array.isArray(raw)) {
      return raw as Array<{ availabilityStatus: string; count: number }>;
    }
    return [];
  }, [utilization.data]);
  const utilTotal = utilRows.reduce((s, r) => s + r.count, 0) || 1;

  const cashInToday = (paymentsToday.data?.byMethod ?? []).reduce(
    (s, r) => s + moneyNumber(r.amount),
    0,
  );

  return (
    <div className="space-y-7 text-[#111827]">
      <FadeIn>
        <header className="flex flex-col gap-4 rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-7">
          <div>
            <p className="eyebrow">Counter · Floor</p>
            <h1 className="display mt-2 text-[1.75rem] leading-tight sm:text-[2.1rem]">
              Today&apos;s board, {user?.fullName?.split(" ")[0] ?? "team"}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-[#6b7280]">
              What the counter must clear today — pickups, returns, fittings,
              and money still on tickets.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/pos">Open terminal</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/orders">New quote</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/returns">Receive return</Link>
            </Button>
          </div>
        </header>
      </FadeIn>

      <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {[
          { label: "Pickups today", value: pickupsToday.length, tone: "teal" },
          { label: "Ready bags", value: readyForPickup.length, tone: "dark" },
          {
            label: "Returns due",
            value: returnsDueToday.length,
            tone: "dark",
          },
          {
            label: "Overdue out",
            value: overdueReturns.length,
            tone: overdueReturns.length ? "warn" : "dark",
          },
          {
            label: "Cash in today",
            value: formatInr(cashInToday),
            tone: "teal",
          },
        ].map((c) => (
          <StaggerItem key={c.label}>
            <HoverLift>
              <div
                className={`panel p-4 ${
                  c.tone === "warn"
                    ? "border-amber-200 bg-amber-50"
                    : c.tone === "teal"
                      ? "border-[#99f6e4]/60"
                      : ""
                }`}
              >
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[#6b7280]">
                  {c.label}
                </p>
                <p className="display mt-2 text-2xl">{c.value}</p>
              </div>
            </HoverLift>
          </StaggerItem>
        ))}
      </Stagger>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <FloorList
          title="Pickups today"
          empty="No pickups scheduled for today"
          rows={pickupsToday.map((o) => ({
            id: o.id,
            primary: o.orderNumber,
            secondary: `${o.customer?.fullName ?? "—"} · ${o.status}`,
            meta: formatInr(o.balanceDue),
            href: `/pos?order=${o.id}`,
          }))}
        />
        <FloorList
          title="Returns due / overdue"
          empty="Nothing due back today"
          rows={[...overdueReturns, ...returnsDueToday].map((o) => ({
            id: o.id,
            primary: o.orderNumber,
            secondary: `${o.customer?.fullName ?? "—"} · due ${formatDate(o.returnDueDate)}`,
            meta: toYmd(o.returnDueDate)! < today ? "OVERDUE" : "Today",
            href: `/returns`,
          }))}
        />
        <FloorList
          title="Fittings today"
          empty="No fittings on the book"
          rows={(appointments.data?.items ?? []).map((a) => ({
            id: a.id,
            primary: a.customer?.fullName ?? "Customer",
            secondary: `${a.aptType} · ${new Date(a.startsAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`,
            meta: a.status,
            href: "/appointments",
          }))}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <FloorList
          title="Outstanding balances"
          empty="All tickets settled"
          rows={(balances.data?.items ?? []).slice(0, 8).map((o) => ({
            id: o.id,
            primary: o.orderNumber,
            secondary: `${o.customer?.fullName ?? "—"} · ${o.customer?.phone ?? ""}`,
            meta: formatInr(o.balanceDue),
            href: `/pos?order=${o.id}`,
          }))}
        />

        <section className="panel p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="display text-lg">Floor pulse</h2>
            <p className="text-xs text-[#6b7280]">{openCount} open tickets</p>
          </div>
          <div className="mt-4 hairline" />
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-[#f6f7f9] p-3">
              <dt className="text-xs text-[#6b7280]">Orders booked today</dt>
              <dd className="mt-1 font-semibold">
                {(salesToday.data?.byStatus ?? []).reduce(
                  (s, r) => s + r.count,
                  0,
                )}
              </dd>
            </div>
            <div className="rounded-xl bg-[#f6f7f9] p-3">
              <dt className="text-xs text-[#6b7280]">Balance on books</dt>
              <dd className="mt-1 font-semibold">
                {formatInr(salesToday.data?.totals?.balanceDue)}
              </dd>
            </div>
          </dl>
          <div className="mt-5 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
              Garment rack
            </p>
            {utilRows.length === 0 ? (
              <p className="text-sm text-[#6b7280]">No units yet</p>
            ) : (
              utilRows.map((row) => (
                <div key={row.availabilityStatus}>
                  <div className="mb-1 flex justify-between text-xs font-medium text-[#6b7280]">
                    <span>
                      {row.availabilityStatus.replaceAll("_", " ")}
                    </span>
                    <span>{row.count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#f3f4f6]">
                    <div
                      className="h-full rounded-full bg-[#0f766e]"
                      style={{
                        width: `${(row.count / utilTotal) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function FloorList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: Array<{
    id: string;
    primary: string;
    secondary: string;
    meta: string;
    href: string;
  }>;
}) {
  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="display text-lg">{title}</h2>
      <div className="mt-4 hairline" />
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={r.href}
              className="flex items-center justify-between gap-3 border-b border-[#e5e7eb] py-3.5 text-sm last:border-0 hover:bg-[#f9fafb]"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{r.primary}</p>
                <p className="truncate text-[#6b7280]">{r.secondary}</p>
              </div>
              <p className="shrink-0 text-xs font-semibold uppercase tracking-wide text-[#0f766e]">
                {r.meta}
              </p>
            </Link>
          </li>
        ))}
        {!rows.length ? (
          <li className="py-8 text-sm text-[#6b7280]">{empty}</li>
        ) : null}
      </ul>
    </section>
  );
}
