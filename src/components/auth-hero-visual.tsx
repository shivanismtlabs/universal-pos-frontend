"use client";

import { motion } from "motion/react";
import {
  BarChart3,
  Box,
  CreditCard,
  LayoutDashboard,
  Package,
  Users,
} from "lucide-react";

/**
 * Auth left panel — brand-led, commerce-mode agnostic.
 * No grocery/restaurant/salon hardcoding (Universal POS product rule).
 */
const CAPABILITIES = [
  { label: "Catalog", icon: Box },
  { label: "Counter", icon: CreditCard },
  { label: "Stock", icon: Package },
  { label: "Customers", icon: Users },
  { label: "Reports", icon: BarChart3 },
  { label: "Overview", icon: LayoutDashboard },
] as const;

export function AuthHeroVisual() {
  return (
    <div className="relative flex h-full min-h-[220px] w-full flex-col overflow-hidden bg-[linear-gradient(155deg,#0b1f33_0%,#1341a8_48%,#1a56db_100%)] sm:min-h-[260px] lg:min-h-0">
      {/* Atmosphere */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 18% 22%, rgba(255,255,255,0.22) 0%, transparent 42%), radial-gradient(circle at 85% 70%, rgba(232,238,251,0.14) 0%, transparent 45%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.65) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.65) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Brand */}
      <div className="relative z-20 flex items-center gap-2.5 px-5 pt-5 sm:px-7 sm:pt-7 lg:px-8 lg:pt-8">
        <span className="grid h-10 w-10 place-items-center rounded-[11px] bg-white text-[0.95rem] font-bold tracking-tight text-[#1a56db] shadow-[0_8px_24px_rgba(11,31,51,0.25)]">
          U
        </span>
        <div className="min-w-0">
          <p className="text-[1.05rem] font-bold tracking-tight text-white">
            Universal POS
          </p>
          <p className="text-[0.7rem] font-medium tracking-wide text-white/70">
            Sales · rentals · services · memberships
          </p>
        </div>
      </div>

      {/* Capability grid — abstract product language, not industries */}
      <div className="relative z-10 flex flex-1 flex-col justify-center px-5 py-6 sm:px-7 sm:py-8 lg:px-8 lg:py-10">
        <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
          {CAPABILITIES.map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.label}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-white/15 bg-white/10 px-2 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-[2px] sm:py-3.5"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.06 * i }}
              >
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-white">
                  <Icon className="h-4 w-4" strokeWidth={2.25} />
                </span>
                <span className="text-[0.68rem] font-semibold tracking-wide text-white/90">
                  {item.label}
                </span>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          className="mt-7 max-w-sm sm:mt-9"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <p className="text-[1.65rem] font-bold leading-[1.15] tracking-tight text-white sm:text-[1.9rem] lg:text-[2.05rem]">
            One system for every counter
          </p>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-white/72 sm:text-[0.875rem]">
            Catalog, billing, and reporting built for any commerce mode — not a
            single industry template.
          </p>
        </motion.div>
      </div>

      {/* Soft bottom sheen */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0b1f33]/45 to-transparent" />
    </div>
  );
}
