"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export type FlowStep = {
  n: number;
  title: string;
  detail: string;
  /** Tab id or href */
  action: string;
  href?: string;
  done?: boolean;
  current?: boolean;
};

/**
 * Compact “what to do next” strip — clear for first-time users.
 */
export function GettingStarted({
  title = "How to start",
  steps,
  onStepClick,
}: {
  title?: string;
  steps: FlowStep[];
  onStepClick?: (action: string) => void;
}) {
  return (
    <section className="rounded-xl border border-[#d9e0ea] bg-white px-4 py-3.5">
      <p className="text-[0.8125rem] font-semibold text-[#0b1f33]">{title}</p>
      <ol className="mt-3 grid gap-2 sm:grid-cols-3">
        {steps.map((s) => {
          const inner = (
            <>
              <span
                className={cn(
                  "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.7rem] font-semibold",
                  s.done
                    ? "bg-[#e8eefb] text-[#1a56db]"
                    : s.current
                      ? "bg-[#1a56db] text-white"
                      : "bg-[#f4f6fa] text-[#5a6b7d]",
                )}
              >
                {s.done ? "✓" : s.n}
              </span>
              <span className="min-w-0">
                <span className="block text-[0.8125rem] font-semibold text-[#0b1f33]">
                  {s.title}
                </span>
                <span className="mt-0.5 block text-[0.75rem] leading-snug text-[#5a6b7d]">
                  {s.detail}
                </span>
              </span>
            </>
          );

          const className = cn(
            "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition",
            s.current
              ? "bg-[#e8eefb]"
              : "hover:bg-[#f4f6fa]",
          );

          if (s.href) {
            return (
              <li key={s.n}>
                <Link href={s.href} className={className}>
                  {inner}
                </Link>
              </li>
            );
          }

          return (
            <li key={s.n}>
              <button
                type="button"
                className={className}
                onClick={() => onStepClick?.(s.action)}
              >
                {inner}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Simple text tabs — not oversized card buttons */
export function FloorTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ id: T; label: string; hint?: string }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Shop floor"
      className="flex gap-1 border-b border-[#d9e0ea]"
    >
      {tabs.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "-mb-px border-b-2 px-3.5 py-2.5 text-[0.8125rem] font-medium transition",
              active
                ? "border-[#1a56db] text-[#1a56db]"
                : "border-transparent text-[#5a6b7d] hover:text-[#0b1f33]",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
