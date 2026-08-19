"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { customersApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function digitsOnly(v: string) {
  return v.replace(/\D/g, "");
}

function maskPhone(phone: string) {
  const d = digitsOnly(phone);
  if (d.length < 4) return "••••";
  return `••••••${d.slice(-4)}`;
}

function looksLikePhone(q: string) {
  return digitsOnly(q).length >= 7;
}

type CustomerRow = {
  id: string;
  fullName: string;
  phone: string;
  email?: string | null;
  loyaltyPoints?: number;
  storeCreditBalance?: number;
  openDueTotal?: number;
  availableCredit?: number | null;
  creditLimit?: number | null;
};

/**
 * Counter customer picker — search existing, or add a new contact on this ticket
 * without leaving POS (name + phone, like a real register).
 */
export function CustomerPicker({
  value,
  onChange,
  allowWalkIn = false,
  walkInLabel = "Walk-in customer",
  placeholder = "Search name or phone…",
  disabled,
  className,
  showBalances = false,
  money,
}: {
  value: string;
  onChange: (customerId: string, customer?: CustomerRow | null) => void;
  allowWalkIn?: boolean;
  walkInLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  showBalances?: boolean;
  money?: (n: string | number) => string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [compose, setCompose] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [creating, setCreating] = useState(false);
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
        loyaltyPoints: row.summary?.loyaltyPoints ?? row.loyaltyPoints ?? 0,
        storeCreditBalance: Number(
          row.summary?.storeCreditBalance ?? row.storeCreditBalance ?? 0,
        ),
        openDueTotal: row.summary?.openDueTotal ?? 0,
        availableCredit: row.summary?.availableCredit ?? null,
        creditLimit: row.summary?.creditLimit ?? row.creditLimit ?? null,
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
  const noMatches =
    Boolean(debounced) && !results.isLoading && items.length === 0;

  useEffect(() => {
    if (!open) return;
    if (noMatches) {
      setCompose(true);
      if (looksLikePhone(debounced)) {
        setNewPhone((p) => p || debounced);
      } else {
        setNewName((n) => n || debounced);
      }
    }
  }, [open, noMatches, debounced]);

  function openCompose() {
    setCompose(true);
    if (looksLikePhone(q)) setNewPhone(q.trim());
    else if (q.trim().length >= 2) setNewName(q.trim());
  }

  async function createAndAttach() {
    const name = newName.trim();
    const phone = newPhone.trim();
    if (name.length < 2) {
      toast.error("Enter the customer name");
      return;
    }
    if (digitsOnly(phone).length < 7) {
      toast.error("Enter a valid phone number");
      return;
    }
    setCreating(true);
    try {
      const created = await customersApi.create({
        fullName: name,
        phone,
        returnExisting: true,
      });
      await qc.invalidateQueries({ queryKey: ["customers-picker"] });
      onChange(created.id, {
        id: created.id,
        fullName: created.fullName,
        phone: created.phone,
      });
      toast.success(`${created.fullName} added to this ticket`);
      setOpen(false);
      setCompose(false);
      setQ("");
      setNewName("");
      setNewPhone("");
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Could not add customer",
      );
    } finally {
      setCreating(false);
    }
  }

  const label = useMemo(() => {
    if (!value) return allowWalkIn ? walkInLabel : "Select customer";
    if (selected.data) return `${selected.data.fullName} · ${selected.data.phone}`;
    return "Selected customer";
  }, [value, selected.data, allowWalkIn, walkInLabel]);

  const fmt = money ?? ((n: string | number) => String(n));

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {value && selected.data ? (
        <div className="rounded-[10px] border border-[#d9e0ea] bg-white px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#0b1f33]">
                {selected.data.fullName}
              </p>
              <p className="font-mono text-[0.75rem] tabular-nums text-[#5a6b7d]">
                {maskPhone(selected.data.phone)}
              </p>
              {showBalances ? (
                <p className="mt-1 text-[0.7rem] text-[#5a6b7d]">
                  Due:{" "}
                  <strong
                    className={
                      (selected.data.openDueTotal ?? 0) > 0
                        ? "text-[#b45309]"
                        : "text-[#0b1f33]"
                    }
                  >
                    {fmt(selected.data.openDueTotal ?? 0)}
                  </strong>
                  {selected.data.loyaltyPoints
                    ? ` · Pts ${selected.data.loyaltyPoints}`
                    : ""}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={disabled}
              className="shrink-0 text-[0.7rem] font-semibold text-[#1a56db] hover:underline"
              onClick={() => {
                onChange("", null);
                setOpen(true);
                setQ("");
              }}
            >
              Change
            </button>
          </div>
        </div>
      ) : (
        <>
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

          {showBalances && selected.data && value ? (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.7rem] text-[#5a6b7d]">
              <span>
                Pts{" "}
                <strong className="text-[#0b1f33]">
                  {selected.data.loyaltyPoints ?? 0}
                </strong>
              </span>
              <span>
                Wallet{" "}
                <strong className="text-[#0b1f33]">
                  {fmt(selected.data.storeCreditBalance ?? 0)}
                </strong>
              </span>
              <span>
                Due{" "}
                <strong
                  className={
                    (selected.data.openDueTotal ?? 0) > 0
                      ? "text-[#b45309]"
                      : "text-[#0b1f33]"
                  }
                >
                  {fmt(selected.data.openDueTotal ?? 0)}
                </strong>
              </span>
              <span>
                Credit{" "}
                <strong className="text-[#0b1f33]">
                  {selected.data.availableCredit == null
                    ? "∞"
                    : fmt(selected.data.availableCredit)}
                </strong>
              </span>
            </div>
          ) : null}
        </>
      )}

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
                onKeyDown={(e) => {
                  if (e.key === "Enter" && noMatches) {
                    e.preventDefault();
                    openCompose();
                  }
                }}
              />
            </label>
          </div>

          <ul className="max-h-52 overflow-y-auto py-1">
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
                    setCompose(false);
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
                    onChange(c.id, {
                      id: c.id,
                      fullName: c.fullName,
                      phone: c.phone,
                      email: c.email,
                      loyaltyPoints: c.loyaltyPoints,
                      storeCreditBalance:
                        c.storeCreditBalance != null
                          ? Number(c.storeCreditBalance)
                          : undefined,
                    });
                    setOpen(false);
                    setQ("");
                    setCompose(false);
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
            ) : noMatches ? (
              <li className="px-3 py-3 text-sm text-[#5a6b7d]">
                No match — add them below on this ticket.
              </li>
            ) : null}
          </ul>

          {compose ? (
            <div className="space-y-2 border-t border-[#eef2f8] bg-[#f8fafc] px-3 py-3">
              <p className="text-[0.7rem] font-semibold tracking-[0.08em] text-[#8b9bb0] uppercase">
                New customer
              </p>
              <Input
                className="h-9 bg-white"
                placeholder="Full name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createAndAttach();
                  }
                }}
              />
              <Input
                className="h-9 bg-white"
                placeholder="Phone"
                inputMode="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createAndAttach();
                  }
                }}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="flex-1"
                  disabled={creating}
                  onClick={() => void createAndAttach()}
                >
                  {creating ? "Saving…" : "Save & attach"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={creating}
                  onClick={() => setCompose(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="border-t border-[#eef2f8] px-2 py-2">
              <button
                type="button"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-[#1a56db] hover:bg-[#e8eefb]"
                onClick={openCompose}
              >
                <UserPlus className="h-4 w-4" />
                New customer
              </button>
            </div>
          )}

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
