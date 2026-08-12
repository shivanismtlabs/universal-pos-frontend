"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Shared tab header: title + one-line purpose + primary action top-right.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-3",
        className,
      )}
    >
      <div className="min-w-0 max-w-2xl">
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle mt-1">{subtitle}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
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
                  className="font-medium text-[#1a56db] hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span className={last ? "font-medium text-[var(--ink)]" : undefined}>
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
      {detail ? <p className="mt-2 text-body text-[var(--muted)]">{detail}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-48 animate-pulse rounded-md bg-[#e8ebf0]" />
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
