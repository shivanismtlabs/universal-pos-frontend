"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { suppliersApi, type SupplierRow } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TablePager } from "@/components/table-pager";

const STATUSES = [
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "on_hold", label: "On hold" },
  { id: "blocked", label: "Blocked" },
  { id: "archived", label: "Archived" },
] as const;

/** Supplier directory table only — edit opens `/suppliers/edit?id=…`. */
export function SupplierMasterPanel() {
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const list = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => suppliersApi.list(),
  });

  const rows = useMemo(() => {
    const all = (list.data ?? []) as SupplierRow[];
    const q = filter.trim().toLowerCase();
    return all.filter((s) => {
      if (statusFilter !== "all" && (s.status ?? "active") !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return [s.name, s.code, s.phone, s.contact, s.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [list.data, filter, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [filter, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section className="rounded-2xl border border-[#e5e7eb] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5e7eb] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-[#111827]">
            All suppliers
          </h2>
          <p className="text-xs text-[#6b7280]">
            One master list for any shop — goods, services, or both.
          </p>
        </div>
        <Button type="button" size="sm" asChild>
          <Link href="/suppliers/new">+ New supplier</Link>
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 px-4 py-2">
        <Input
          className="min-w-[12rem] flex-1"
          placeholder="Search name, code, phone…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <Select
          className="w-40"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#f9fafb] text-xs uppercase tracking-wide text-[#6b7280]">
            <tr>
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Terms</th>
              <th className="px-4 py-2 font-medium"> </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((s) => (
              <tr key={s.id} className="border-t border-[#f3f4f6]">
                <td className="px-4 py-2 font-mono text-xs">{s.code ?? "—"}</td>
                <td className="px-4 py-2">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-[#6b7280]">
                    {[s.contact, s.phone].filter(Boolean).join(" · ") || "—"}
                  </p>
                </td>
                <td className="px-4 py-2 capitalize">
                  {(s.status ?? "active").replaceAll("_", " ")}
                </td>
                <td className="px-4 py-2 text-xs text-[#6b7280]">
                  {(s.paymentTerm ?? "—").replaceAll("_", " ")}
                </td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/suppliers/edit?id=${encodeURIComponent(s.id)}`}
                    className="text-xs font-medium text-[#1a56db] hover:underline"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {!pageRows.length ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-[#6b7280]"
                >
                  {list.isLoading ? "Loading…" : "No suppliers yet"}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <TablePager
        page={page}
        totalPages={pageCount}
        total={rows.length}
        pageSize={PAGE_SIZE}
        onPage={setPage}
      />
    </section>
  );
}
