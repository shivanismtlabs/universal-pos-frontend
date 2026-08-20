"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { appsApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";

/** Product + customer hits for the shell search box (light sidebar). */
export function ShellEntitySearch({
  query,
  onNavigate,
}: {
  query: string;
  onNavigate?: () => void;
}) {
  const { money } = useBootstrap();
  const q = query.trim();
  const search = useQuery({
    queryKey: ["global-search", q],
    queryFn: () => appsApi.search(q, 6),
    enabled: q.length >= 2,
    staleTime: 15_000,
  });

  if (q.length < 2) return null;

  const products = search.data?.products ?? [];
  const customers = search.data?.customers ?? [];
  const empty =
    !search.isLoading && products.length === 0 && customers.length === 0;

  return (
    <div className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-[#e2e8f0] bg-white p-2 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.25)] [scrollbar-width:thin]">
      {search.isLoading ? (
        <p className="px-1 py-2 text-[0.7rem] font-medium text-[#64748b]">
          Searching…
        </p>
      ) : null}
      {empty ? (
        <p className="px-1 py-2 text-[0.7rem] font-medium text-[#64748b]">
          No products or customers match “{q}”
        </p>
      ) : null}

      {products.length ? (
        <div>
          <p className="px-1 pb-1 text-[0.58rem] font-bold tracking-[0.12em] text-[#94a3b8] uppercase">
            Products
          </p>
          <ul className="space-y-0.5">
            {products.map((p) => (
              <li key={p.id}>
                <Link
                  href={p.href}
                  onClick={onNavigate}
                  className="block rounded-md px-2 py-1.5 hover:bg-[#f1f5f9]"
                >
                  <p className="truncate text-[0.78rem] font-semibold text-[#0b1f33]">
                    {p.name}
                  </p>
                  <p className="truncate text-[0.65rem] font-medium text-[#64748b]">
                    {p.sku}
                    {p.category ? ` · ${p.category}` : ""} · {money(p.price)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {customers.length ? (
        <div>
          <p className="px-1 pb-1 text-[0.58rem] font-bold tracking-[0.12em] text-[#94a3b8] uppercase">
            Customers
          </p>
          <ul className="space-y-0.5">
            {customers.map((c) => (
              <li key={c.id}>
                <Link
                  href={c.href}
                  onClick={onNavigate}
                  className="block rounded-md px-2 py-1.5 hover:bg-[#f1f5f9]"
                >
                  <p className="truncate text-[0.78rem] font-semibold text-[#0b1f33]">
                    {c.fullName}
                  </p>
                  <p className="truncate text-[0.65rem] font-medium text-[#64748b]">
                    {c.phone}
                    {c.email ? ` · ${c.email}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
