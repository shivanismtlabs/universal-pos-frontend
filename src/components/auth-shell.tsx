"use client";

import Link from "next/link";
import { motion } from "motion/react";

/**
 * Enterprise login/signup frame — full-bleed boutique counter photo,
 * navy overlay, left marketing copy, white form card.
 */
function RegisterMark({
  className = "h-6 w-6",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect
        x="4"
        y="8"
        width="16"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M7 8V6.5A2.5 2.5 0 0 1 9.5 4h5A2.5 2.5 0 0 1 17 6.5V8"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M8 13h3M8 16h8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function AuthShell({
  children,
  title,
  subtitle,
  wide = false,
}: {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  wide?: boolean;
}) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#050b1c] text-white">
      <div
        className="pointer-events-none absolute inset-0 scale-105 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/auth/counter-bg.png')" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,rgba(5,11,28,0.88)_0%,rgba(10,22,48,0.78)_46%,rgba(5,11,28,0.82)_100%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_40%,rgba(26,86,219,0.18),transparent_55%)]"
        aria-hidden
      />

      <div className="relative z-10 flex min-h-dvh flex-col">
        <header className="flex items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
          <Link
            href="/login"
            className="flex items-center gap-2.5 text-white"
          >
            <RegisterMark className="h-[22px] w-[22px]" />
            <span className="text-[0.98rem] font-semibold tracking-tight">
              Universal POS
            </span>
          </Link>
          <nav className="hidden items-center gap-8 text-[0.8125rem] font-medium text-white/90 sm:flex">
            <a href="#product" className="transition hover:text-white">
              Product
            </a>
            <a href="#help" className="transition hover:text-white">
              Help Center
            </a>
            <a href="#contact" className="transition hover:text-white">
              Contact Sales
            </a>
          </nav>
        </header>

        <main className={`mx-auto grid w-full max-w-[1280px] flex-1 items-center gap-8 px-5 py-6 sm:px-8 lg:py-8 ${wide ? "lg:grid-cols-[1fr_500px] lg:gap-10 lg:pl-12 lg:pr-16 xl:pr-20" : "lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,420px)] lg:gap-14 lg:px-12"}`}>
          <motion.section
            className="max-w-xl lg:hidden"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-3 py-1 text-[0.62rem] font-semibold tracking-[0.14em] text-white/90">
              <span className="h-1.5 w-1.5 rounded-full bg-[#7dd3fc]" />
              ENTERPRISE GRADE PLATFORM
            </p>
            <h1 className="mt-4 text-[1.85rem] font-bold leading-tight tracking-tight text-white">
              One system for every counter.
            </h1>
          </motion.section>
          <motion.section
            id="product"
            className="hidden max-w-xl lg:block"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-3 py-1 text-[0.65rem] font-semibold tracking-[0.14em] text-white/90">
              <span className="h-1.5 w-1.5 rounded-full bg-[#7dd3fc]" />
              ENTERPRISE GRADE PLATFORM
            </p>
            <h1 className="mt-6 text-[2.65rem] font-bold leading-[1.12] tracking-tight text-white xl:text-[3.05rem]">
              One system for every counter.
            </h1>
            <p className="mt-4 max-w-md text-[1rem] leading-relaxed text-white/80">
              Catalog, billing, and reporting built for any commerce mode. Unify
              your entire business operations in a single, powerful platform.
            </p>
            <div className="mt-10 flex items-stretch gap-8">
              <div>
                <p className="text-[1.65rem] font-bold tracking-tight">99.99%</p>
                <p className="mt-1 text-[0.65rem] font-semibold tracking-[0.14em] text-white/55">
                  UPTIME SLA
                </p>
              </div>
              <div className="w-px bg-white/20" />
              <div>
                <p className="text-[1.65rem] font-bold tracking-tight">50k+</p>
                <p className="mt-1 text-[0.65rem] font-semibold tracking-[0.14em] text-white/55">
                  ACTIVE TERMINALS
                </p>
              </div>
            </div>
          </motion.section>

          <motion.section
            className={`mx-auto w-full ${wide ? "max-w-[500px] lg:ml-auto lg:mr-0" : "max-w-[420px] lg:mx-0"}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, delay: 0.08 }}
          >
            <div className="overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)]">
              <div className="h-[3px] bg-[#1a56db]" />
              <div className="px-6 py-7 sm:px-8 sm:py-8">
                <h2 className="text-[1.45rem] font-bold tracking-tight text-[#111827]">
                  {title}
                </h2>
                <p className="mt-1.5 text-[0.875rem] leading-relaxed text-[#6b7280]">
                  {subtitle}
                </p>
                <div className="mt-6">{children}</div>
              </div>
            </div>
          </motion.section>
        </main>

        <footer
          id="help"
          className="flex flex-col gap-3 px-5 py-4 text-[0.7rem] text-white/50 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12"
        >
          <p className="flex items-center gap-2">
            <RegisterMark className="h-3.5 w-3.5" />
            <span>© {new Date().getFullYear()} Universal POS Inc. All rights reserved.</span>
          </p>
          <nav
            id="contact"
            className="flex flex-wrap gap-x-6 gap-y-1 font-medium tracking-[0.08em] uppercase"
          >
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
            <span>System Status</span>
          </nav>
        </footer>
      </div>
    </div>
  );
}

export { AuthShell };
