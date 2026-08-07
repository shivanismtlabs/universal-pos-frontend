"use client";

import { motion } from "motion/react";
import { AuthHeroVisual } from "@/components/auth-hero-visual";

/**
 * Conversly-style auth card: animated left + form right.
 * Brand colors: sapphire / navy / cool gray (not peach-purple).
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
    <div className="grid min-h-dvh place-items-center bg-[#e8edf4] px-3 py-6 text-[#0b1f33] sm:px-6 sm:py-10">
      <motion.div
        className="grid w-full max-w-[980px] overflow-hidden rounded-[22px] bg-white shadow-[0_24px_80px_-32px_rgba(11,31,51,0.35)] lg:grid-cols-2"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <aside className="relative min-h-[280px] lg:min-h-[640px]">
          <AuthHeroVisual />
        </aside>

        <div className="flex flex-col justify-center px-5 py-8 sm:px-10 sm:py-12 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.08 }}
          >
            <h1 className="bg-[linear-gradient(105deg,#1a56db_0%,#0b1f33_85%)] bg-clip-text text-[1.65rem] font-bold tracking-tight text-transparent sm:text-[1.85rem]">
              {title}
            </h1>
            <p className="mt-2 max-w-md text-[0.9375rem] leading-relaxed text-[#5a6b7d]">
              {subtitle}
            </p>

            <div className="mt-7">{children}</div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
