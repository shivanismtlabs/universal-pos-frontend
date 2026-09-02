"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Shared page header — bold title, clear subtitle, optional action.
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  action,
  className,
}: {
  title: string;
  subtitle: React.ReactNode;
  /** Optional blue kicker above the title (e.g. Inventory, Sales) */
  eyebrow?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-[#eef1f4] pb-3",
        className,
      )}
    >
      <div className="min-w-0 max-w-2xl">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className={cn("page-title", eyebrow ? "mt-1" : undefined)}>
          {title}
        </h1>
        <p className="page-subtitle mt-1.5">{subtitle}</p>
      </div>
      {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
    </header>
  );
}

export function PageBreadcrumb({
  items,
}: {
  items: Array<{ label: string; href?: string }>;
}) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 text-caption text-[var(--muted)]">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 ? <span aria-hidden>/</span> : null}
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="font-semibold text-[#1a56db] hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={
                    last ? "font-semibold text-[var(--ink)]" : undefined
                  }
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#e4e9f0] bg-white px-6 py-10 text-center">
      <p className="section-title">{title}</p>
      {detail ? (
        <p className="mt-2 text-body text-[var(--muted)]">{detail}</p>
      ) : null}
      {action ? (
        <div className="mt-5 flex justify-center">{action}</div>
      ) : null}
    </div>
  );
}

export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-52 animate-pulse rounded-md bg-[#e8ebf0]" />
      <div className="h-4 w-72 max-w-full animate-pulse rounded-md bg-[#eef1f5]" />
      <div className="space-y-2 rounded-xl border border-[var(--line)] bg-white p-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-10 animate-pulse rounded-lg bg-[#f4f6fa]"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
