"use client";

import { motion } from "motion/react";

/**
 * Animated left-panel visual for auth pages (no external video asset required).
 * Drop `public/auth-hero.mp4` later to replace with a real loop.
 */
export function AuthHeroVisual() {
  return (
    <div className="relative h-full min-h-[280px] w-full overflow-hidden rounded-[18px] bg-[#0b1f33] lg:min-h-0 lg:rounded-none">
      {/* Soft animated backdrop (add /public/auth-hero.mp4 later for real footage) */}
      <div className="absolute inset-0 bg-[radial-gradient(90%_70%_at_20%_10%,rgba(26,86,219,0.55),transparent_55%),radial-gradient(70%_50%_at_90%_80%,rgba(232,238,251,0.12),transparent_50%)]" />
      <motion.div
        className="absolute -left-1/4 top-1/4 h-[420px] w-[420px] rounded-full bg-[#1a56db]/25 blur-3xl"
        animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-1/4 bottom-0 h-[360px] w-[360px] rounded-full bg-[#5b8def]/20 blur-3xl"
        animate={{ x: [0, -30, 0], y: [0, 25, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(160deg,rgba(11,31,51,0.2)_0%,rgba(11,31,51,0.75)_100%)]" />

      {/* Floating counter cards */}
      <motion.div
        className="absolute left-[10%] top-[18%] w-[58%] max-w-[280px] rounded-2xl border border-white/15 bg-white/10 p-4 shadow-2xl backdrop-blur-md"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wide text-white/80">
            Today&apos;s counter
          </span>
          <span className="rounded-md bg-[#1a56db] px-2 py-0.5 text-[0.65rem] font-bold text-white">
            LIVE
          </span>
        </div>
        <p className="mt-3 text-2xl font-bold tracking-tight text-white">
          ₹24,680
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
          <motion.div
            className="h-full rounded-full bg-[#5b8def]"
            initial={{ width: "35%" }}
            animate={{ width: ["35%", "78%", "55%", "78%"] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
        <div className="mt-3 flex gap-2">
          {["Cash", "UPI", "Card"].map((t, i) => (
            <motion.span
              key={t}
              className="rounded-md bg-white/10 px-2 py-1 text-[0.65rem] font-medium text-white/85"
              animate={{ opacity: [0.55, 1, 0.55] }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                delay: i * 0.35,
              }}
            >
              {t}
            </motion.span>
          ))}
        </div>
      </motion.div>

      <motion.div
        className="absolute bottom-[16%] right-[8%] w-[48%] max-w-[220px] rounded-2xl border border-white/15 bg-white p-3.5 shadow-2xl"
        animate={{ y: [0, 12, 0] }}
        transition={{ duration: 6.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-[#8b9bb0]">
          Last sale
        </p>
        <p className="mt-1 text-sm font-bold text-[#0b1f33]">Basmati rice · 2.5 kg</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-[#5a6b7d]">Qty weighed</span>
          <span className="text-sm font-bold text-[#1a56db]">₹312</span>
        </div>
        <motion.div
          className="mt-3 h-8 rounded-lg bg-[#e8eefb]"
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2.8, repeat: Infinity }}
        />
      </motion.div>

      <div className="absolute bottom-6 left-6 right-6 lg:bottom-10 lg:left-10 lg:right-10">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-white/55">
          Universal POS
        </p>
        <h2 className="mt-2 max-w-md text-2xl font-bold tracking-tight text-white sm:text-3xl">
          One counter for every kind of shop
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/70">
          Grocery kilos, retail packs, rentals — sell faster with a clean counter
          built for real shops.
        </p>
      </div>
    </div>
  );
}
