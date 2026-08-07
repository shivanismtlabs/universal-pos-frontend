"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { customersApi } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type CustomerRow = {
  id: string;
  fullName: string;
  phone: string;
  email?: string | null;
};

/**
 * Scalable customer picker — never dumps the full book into a &lt;select&gt;.
 * Typeahead hits GET /customers?q=… (paged). Works for 10 or 100k contacts.
 */
export function CustomerPicker({
  value,
  onChange,
  allowWalkIn = false,
  walkInLabel = "Walk-in customer",
  placeholder = "Search name or phone…",
  disabled,
  className,
}: {
  value: string;
  onChange: (customerId: string, customer?: CustomerRow | null) => void;
  allowWalkIn?: boolean;
  walkInLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const selected = useQuery({
    queryKey: ["customer", value],
    queryFn: async () => {
      const row = await customersApi.get(value);
      return {
        id: String(row.id),
        fullName: String(row.fullName ?? ""),
        phone: String(row.phone ?? ""),
        email: (row.email as string | null | undefined) ?? null,
      } satisfies CustomerRow;
    },
    enabled: Boolean(value) && value.length > 10,
  });

  const results = useQuery({
    queryKey: ["customers-picker", debounced],
    queryFn: () =>
      customersApi.list({
        q: debounced || undefined,
        limit: 20,
        page: 1,
      }),
    enabled: open,
  });

  const items = results.data?.items ?? [];
  const total = results.data?.meta.total ?? 0;

  const label = useMemo(() => {
    if (!value) return allowWalkIn ? walkInLabel : "Select customer";
    if (selected.data) return `${selected.data.fullName} · ${selected.data.phone}`;
    return "Selected customer";
  }, [value, selected.data, allowWalkIn, walkInLabel]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-[10px] border border-[#cfd8e6] bg-white px-3 text-left text-sm text-[#0b1f33] shadow-[inset_0_1px_2px_rgba(11,31,51,0.04)] transition",
          "hover:border-[#b6c2d4] focus:border-[#1a56db] focus:outline-none focus:ring-[3px] focus:ring-[#1a56db]/20",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <span className="min-w-0 truncate font-medium">{label}</span>
        <Search className="h-4 w-4 shrink-0 text-[#8b9bb0]" />
      </button>

      {open ? (
        <div className="absolute z-40 mt-1.5 w-full overflow-hidden rounded-[12px] border border-[#d9e0ea] bg-white shadow-[0_12px_28px_-12px_rgba(11,31,51,0.28)]">
          <div className="border-b border-[#eef2f8] p-2">
            <label className="relative block">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[#8b9bb0]" />
              <Input
                autoFocus
                className="h-10 pl-8"
                placeholder={placeholder}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
          </div>

          <ul className="max-h-56 overflow-y-auto py-1">
            {allowWalkIn ? (
              <li>
                <button
                  type="button"
                  className={cn(
                    "flex w-full px-3 py-2.5 text-left text-sm hover:bg-[#f4f6fa]",
                    !value && "bg-[#e8eefb] font-semibold text-[#1341a8]",
                  )}
                  onClick={() => {
                    onChange("", null);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  {walkInLabel}
                </button>
              </li>
            ) : null}

            {items.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full flex-col px-3 py-2.5 text-left hover:bg-[#f4f6fa]",
                    value === c.id && "bg-[#e8eefb]",
                  )}
                  onClick={() => {
                    onChange(c.id, c);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <span className="truncate text-sm font-semibold text-[#0b1f33]">
                    {c.fullName}
                  </span>
                  <span className="text-[0.75rem] tabular-nums text-[#5a6b7d]">
                    {c.phone}
                    {c.email ? ` · ${c.email}` : ""}
                  </span>
                </button>
              </li>
            ))}

            {results.isLoading ? (
              <li className="px-3 py-4 text-sm text-[#5a6b7d]">Searching…</li>
            ) : null}
            {!results.isLoading && !items.length ? (
              <li className="px-3 py-4 text-sm text-[#5a6b7d]">
                No matches — try another name or phone
              </li>
            ) : null}
          </ul>

          <div className="flex items-center justify-between border-t border-[#eef2f8] px-3 py-2 text-[0.7rem] text-[#8b9bb0]">
            <span>
              {debounced
                ? `${total.toLocaleString()} match${total === 1 ? "" : "es"}`
                : `${total.toLocaleString()} in book · type to filter`}
            </span>
            {value ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 font-semibold text-[#5a6b7d] hover:text-[#c81e1e]"
                onClick={() => {
                  onChange("", null);
                  setQ("");
                }}
              >
                <X className="h-3 w-3" /> Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
