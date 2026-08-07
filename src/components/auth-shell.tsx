"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Auth layout — enterprise counter-ready (sapphire / Manrope / cool gray).
 * `split` = login; `stacked` = long forms (register).
 */
export function AuthShell({
  children,
  title,
  subtitle,
  layout = "split",
}: {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  layout?: "split" | "stacked";
}) {
  if (layout === "stacked") {
    return (
      <div className="relative min-h-dvh overflow-hidden bg-[#f4f6fa] text-[#0b1f33]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_60%_at_50%_-10%,#e8eefb_0%,transparent_55%),linear-gradient(180deg,#f4f6fa_0%,#eef2f7_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#1a56db]/35 to-transparent" />

        <div className="relative z-10 mx-auto flex min-h-dvh max-w-xl flex-col px-4 py-8 sm:px-6 sm:py-12">
          <motion.header
            className="mb-8 text-center"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <Link href="/login" className="inline-flex items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-[#1a56db] text-sm font-bold text-white shadow-[0_4px_14px_rgba(26,86,219,0.28)]">
                U
              </span>
              <span className="text-lg font-bold tracking-tight text-[#0b1f33]">
                Universal POS
              </span>
            </Link>
            <h1 className="mt-6 text-[1.75rem] font-bold tracking-tight text-[#0b1f33] sm:text-[2rem]">
              {title}
            </h1>
            <p className="mx-auto mt-2 max-w-md text-[0.9375rem] leading-relaxed text-[#5a6b7d]">
              {subtitle}
            </p>
          </motion.header>

          <motion.div
            className="w-full flex-1"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05 }}
          >
            <div className="rounded-[14px] border border-[#d9e0ea] bg-white p-5 shadow-[0_1px_2px_rgba(11,31,51,0.04),0_20px_40px_-28px_rgba(11,31,51,0.22)] sm:p-8">
              {children}
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#f4f6fa] text-[#0b1f33]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#f4f6fa_0%,#e8eef5_100%)]" />

      <div
        className={cn(
          "relative z-10 mx-auto grid min-h-dvh max-w-5xl gap-8 px-4 py-10 sm:px-6 lg:items-center lg:gap-14 lg:py-14",
          "lg:grid-cols-[1fr_24rem]",
        )}
      >
        <motion.div
          className="max-w-md"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Link href="/login" className="inline-flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#1a56db] text-sm font-semibold text-white">
              U
            </span>
            <span className="text-lg font-bold tracking-tight text-[#0b1f33]">
              Universal POS
            </span>
          </Link>

          <h1 className="mt-8 text-3xl font-bold tracking-tight text-[#0b1f33] sm:text-[2.25rem] sm:leading-tight">
            One counter for any shop
          </h1>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-[#5a6b7d]">
            {subtitle}
          </p>

          <ul className="mt-8 space-y-2.5 text-sm text-[#5a6b7d]">
            {[
              "Add your own products & categories",
              "Charge cash, UPI, or card",
              "Print receipts & check daily sales",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1a56db]" />
                {line}
              </li>
            ))}
          </ul>

          <p className="mt-6 text-sm text-[#8b9bb0]">{title}</p>
        </motion.div>

        <motion.div
          className="w-full"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.06 }}
        >
          <div className="rounded-xl border border-[#d9e0ea] bg-white p-5 shadow-[0_1px_2px_rgba(11,31,51,0.04),0_12px_32px_-24px_rgba(11,31,51,0.18)] sm:p-6">
            {children}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
