"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/accounting", label: "Overview" },
  { href: "/accounting/accounts", label: "Chart of Accounts" },
  { href: "/accounting/journals", label: "Journal Entries" },
  { href: "/accounting/ledger", label: "Ledger" },
  { href: "/accounting/trial-balance", label: "Trial Balance" },
  { href: "/accounting/profit-loss", label: "Profit & Loss" },
  { href: "/accounting/balance-sheet", label: "Balance Sheet" },
  { href: "/accounting/gst", label: "GST Reports" },
  { href: "/accounting/periods", label: "Periods" },
  { href: "/accounting/mappings", label: "Account Mapping" },
  { href: "/accounting/integrations", label: "Integrations" },
];

export function AccountingNav() {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-[#e5e7eb] pb-2">
      {LINKS.map((l) => {
        const active =
          l.href === "/accounting"
            ? path === "/accounting"
            : path === l.href || path.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "rounded px-2.5 py-1 text-[13px] font-medium",
              active
                ? "bg-[#1a56db] text-white"
                : "text-[#4b5563] hover:bg-[#f3f4f6]",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
