"use client";

import { motion } from "motion/react";
import { AuthHeroVisual } from "@/components/auth-hero-visual";

/**
 * Auth layout: brand panel + form.
 * Sapphire / navy / cool gray brand system.
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
    <div className="grid min-h-dvh place-items-center bg-[#eef2f7] px-3 py-5 text-[#0b1f33] sm:px-5 sm:py-8">
      <motion.div
        className="grid w-full max-w-[960px] overflow-hidden rounded-[20px] border border-[#d9e0ea]/80 bg-white shadow-[0_20px_60px_-28px_rgba(11,31,51,0.28)] lg:grid-cols-2"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38 }}
      >
        <aside className="relative lg:min-h-[600px]">
          <AuthHeroVisual />
        </aside>

        <div className="flex flex-col justify-center px-5 py-7 sm:px-9 sm:py-10 lg:px-11 lg:py-12">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: 0.06 }}
          >
            <p className="mb-3 text-[0.7rem] font-semibold tracking-[0.12em] text-[#1a56db] uppercase lg:hidden">
              Universal POS
            </p>
            <h1 className="text-[1.5rem] font-bold tracking-tight text-[#0b1f33] sm:text-[1.75rem]">
              {title}
            </h1>
            <p className="mt-2 max-w-md text-[0.9rem] leading-relaxed text-[#5a6b7d]">
              {subtitle}
            </p>

            <div className="mt-6 sm:mt-7">{children}</div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
