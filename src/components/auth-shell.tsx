"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { AuthHeroVisual } from "@/components/auth-hero-visual";

/**
 * Auth layout — visual left panel + form. Enterprise sapphire / cool gray.
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
    <div className="min-h-dvh bg-[#f4f6fa] text-[#0b1f33]">
      <div className="mx-auto grid min-h-dvh max-w-6xl lg:grid-cols-2">
        <motion.aside
          className="relative p-4 sm:p-6 lg:min-h-dvh lg:p-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.45 }}
        >
          <AuthHeroVisual />
        </motion.aside>

        <div className="flex flex-col justify-center px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
          <motion.div
            className="mx-auto w-full max-w-md"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05 }}
          >
            <Link href="/login" className="inline-flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#1a56db] text-sm font-bold text-white shadow-[0_4px_12px_rgba(26,86,219,0.28)]">
                U
              </span>
              <span className="text-lg font-bold tracking-tight">
                Universal POS
              </span>
            </Link>

            <h1 className="mt-7 text-[1.65rem] font-bold tracking-tight sm:text-[1.85rem]">
              {title}
            </h1>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-[#5a6b7d]">
              {subtitle}
            </p>

            <div className="mt-7 rounded-[14px] border border-[#d9e0ea] bg-white p-5 shadow-[0_1px_2px_rgba(11,31,51,0.04),0_18px_40px_-28px_rgba(11,31,51,0.2)] sm:p-6">
              {children}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
