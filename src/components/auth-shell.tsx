"use client";

import Link from "next/link";
import { motion } from "motion/react";

/**
 * Auth layout — clean, brand-first, easy for first-time users.
 */
export function AuthShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#f4f6fa] text-[#0b1f33]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#f4f6fa_0%,#e8eef5_100%)]" />

      <div className="relative z-10 mx-auto grid min-h-dvh max-w-5xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_24rem] lg:items-center lg:gap-14 lg:py-14">
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
