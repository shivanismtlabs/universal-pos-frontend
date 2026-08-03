"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

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
    <div className="relative min-h-dvh overflow-hidden bg-[#0b1220] text-[#111827]">
      {/* Animated atmosphere */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#134e4a_0%,_transparent_55%),radial-gradient(ellipse_at_bottom_right,_#1e293b_0%,_#0b1220_60%)]" />
        <motion.div
          className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-[#0f766e]/35 blur-3xl"
          animate={{ x: [0, 40, 0], y: [0, 24, 0], opacity: [0.35, 0.55, 0.35] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-[#334155]/50 blur-3xl"
          animate={{ x: [0, -30, 0], y: [0, -20, 0], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute left-1/3 top-1/2 h-56 w-56 -translate-y-1/2 rounded-full bg-[#0d9488]/20 blur-3xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.35) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-6xl flex-col justify-center gap-10 px-4 py-10 sm:px-6 lg:flex-row lg:items-center lg:gap-16 lg:py-16">
        <motion.div
          className="max-w-md text-white lg:flex-1"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Link href="/login" className="inline-flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#0f766e] text-lg font-bold shadow-lg shadow-[#0f766e]/30">
              T
            </span>
            <span>
              <span className="display block text-2xl leading-none">Tuxedo</span>
              <span className="mt-1 block text-[0.7rem] tracking-[0.18em] text-white/55 uppercase">
                Formal rental POS
              </span>
            </span>
          </Link>

          <h1 className="display mt-10 text-3xl leading-tight sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/65">
            {subtitle}
          </p>

          <ul className="mt-8 space-y-3 text-sm text-white/70">
            {[
              "Secure staff access with short-lived tokens",
              "Tenant-isolated shop data",
              "Counter, fittings, and returns in one place",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2dd4bf]" />
                {item}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          className={cn(
            "w-full max-w-md rounded-2xl border border-white/10 bg-white/95 p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-8",
          )}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
