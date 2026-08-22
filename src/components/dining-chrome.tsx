"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/auth-store";
import { useBootstrap } from "@/lib/bootstrap";
import { useBranchStore } from "@/lib/branch-store";
import { cn } from "@/lib/utils";

const TABS: Array<{
  href: string;
  label: string;
  cap?: string;
  anyCap?: string[];
  exact?: boolean;
}> = [
  { href: "/restaurant", label: "Dashboard", exact: true },
  { href: "/restaurant/tables", label: "Tables", cap: "TABLE" },
  {
    href: "/restaurant/menu",
    label: "Menus",
    anyCap: ["TABLE", "KOT", "QR_ORDER", "MODIFIERS"],
  },
  { href: "/restaurant/qr", label: "QR menu", cap: "QR_ORDER" },
  { href: "/kitchen", label: "Kitchen", cap: "KOT" },
  { href: "/restaurant/reservations", label: "Reservations", cap: "DINING_RESERVATION" },
  { href: "/restaurant/tokens", label: "Tokens", cap: "TOKEN" },
  { href: "/restaurant/recipes", label: "Recipes", cap: "RECIPE" },
  { href: "/restaurant/wastage", label: "Wastage", cap: "WASTAGE" },
  { href: "/restaurant/food-cost", label: "Food cost", cap: "RECIPE" },
  { href: "/restaurant/setup", label: "Setup" },
];

export const diningSelectClass =
  "h-9 w-full rounded-md border border-[#d9e0ea] bg-white px-2.5 text-sm text-[#0b1f33] outline-none transition focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/15";

const STATUS_STYLE: Record<string, string> = {
  available: "bg-[#ecfdf3] text-[#166534] ring-1 ring-[#bbf7d0]",
  occupied: "bg-[#eff6ff] text-[#1e40af] ring-1 ring-[#bfdbfe]",
  reserved: "bg-[#fff7ed] text-[#9a3412] ring-1 ring-[#fed7aa]",
  cleaning: "bg-[#fffbeb] text-[#92400e] ring-1 ring-[#fde68a]",
  blocked: "bg-[#f8fafc] text-[#475569] ring-1 ring-[#e2e8f0]",
  booked: "bg-[#eff6ff] text-[#1e40af] ring-1 ring-[#bfdbfe]",
  seated: "bg-[#ecfdf3] text-[#166534] ring-1 ring-[#bbf7d0]",
  completed: "bg-[#f8fafc] text-[#475569] ring-1 ring-[#e2e8f0]",
  cancelled: "bg-[#f8fafc] text-[#64748b] ring-1 ring-[#e2e8f0]",
  no_show: "bg-[#fef2f2] text-[#991b1b] ring-1 ring-[#fecaca]",
  new: "bg-[#eff6ff] text-[#1e40af] ring-1 ring-[#bfdbfe]",
  accepted: "bg-[#f0f9ff] text-[#075985] ring-1 ring-[#bae6fd]",
  preparing: "bg-[#fff7ed] text-[#9a3412] ring-1 ring-[#fed7aa]",
  ready: "bg-[#ecfdf3] text-[#166534] ring-1 ring-[#bbf7d0]",
  served: "bg-[#f8fafc] text-[#475569] ring-1 ring-[#e2e8f0]",
  waiting: "bg-[#eff6ff] text-[#1e40af] ring-1 ring-[#bfdbfe]",
  delayed: "bg-[#fffbeb] text-[#92400e] ring-1 ring-[#fde68a]",
  critical: "bg-[#fef2f2] text-[#991b1b] ring-1 ring-[#fecaca]",
};

export function DiningStatusBadge({
  value,
}: {
  value: string;
}) {
  const label = value.replaceAll("_", " ");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[0.68rem] font-semibold capitalize",
        STATUS_STYLE[value] ?? STATUS_STYLE.blocked,
      )}
    >
      {label}
    </span>
  );
}

export function DiningTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const identityToken = useAuthStore((s) => s.identityToken);
  const { hasCapability } = useBootstrap();
  const visible = TABS.filter(
    (t) =>
      (!t.cap && !t.anyCap) ||
      (t.cap ? hasCapability(t.cap) : false) ||
      (t.anyCap ? t.anyCap.some((c) => hasCapability(c)) : false),
  );

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#eef1f4]">
      <nav
        aria-label="Dining"
        className="flex min-w-0 flex-wrap gap-1"
      >
        {visible.map((t) => {
          const active = t.exact
            ? pathname === t.href
            : pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-[#1a56db] text-[#1a56db]"
                  : "border-transparent text-[#5a6b7d] hover:text-[#0b1f33]",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <button
        type="button"
        className="mb-px shrink-0 rounded-md border border-[#d9e0ea] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#334155] hover:bg-[#f8fafc]"
        onClick={() => {
          qc.clear();
          useBranchStore.getState().bindTenant(null);
          if (!identityToken) {
            toast.message("Sign in again to pick another shop");
            return;
          }
          useAuthStore.getState().clearTenantSession();
          router.replace("/organizations");
        }}
      >
        Switch organization
      </button>
    </div>
  );
}

export function DiningShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <p className="eyebrow">Dining</p>
          <h1 className="page-title mt-1">{title}</h1>
          <p className="page-subtitle mt-1.5">{subtitle}</p>
        </div>
        {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
      </header>
      <DiningTabs />
      {children}
    </div>
  );
}

export function DiningPanel({
  title,
  hint,
  action,
  className,
  children,
}: {
  title?: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-[#e2e8f0] bg-white",
        className,
      )}
    >
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef1f4] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-[#0b1f33]">{title}</h2>
            {hint ? (
              <p className="mt-0.5 text-xs text-[#5a6b7d]">{hint}</p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function DiningEmpty({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[#d9e0ea] bg-[#f8fafc] px-6 py-10 text-center">
      <p className="text-sm font-semibold text-[#0b1f33]">{title}</p>
      {detail ? (
        <p className="mx-auto mt-1.5 max-w-md text-sm text-[#5a6b7d]">{detail}</p>
      ) : null}
    </div>
  );
}

export function DiningToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-[#eef1f4] bg-[#f8fafc] px-3 py-3">
      <span>
        <span className="block text-sm font-medium text-[#0b1f33]">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-xs text-[#5a6b7d]">{hint}</span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition",
          checked ? "bg-[#1a56db]" : "bg-[#cbd5e1]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </button>
    </label>
  );
}
