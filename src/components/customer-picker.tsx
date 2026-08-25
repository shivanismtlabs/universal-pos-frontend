"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, UserPlus } from "lucide-react";
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

function filterPersonName(raw: string) {
  return raw
    .replace(/[^A-Za-z\u0900-\u097F\s]/g, "")
    .replace(/^\s+/, "")
    .replace(/\s{2,}/g, " ");
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
  /** Flat panel for modals — no nested dropdown / forced scrollbar */
  embedded = false,
  /** Called after a customer (or walk-in) is chosen — close parent modal */
  onPicked,
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
  embedded?: boolean;
  onPicked?: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(embedded);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [compose, setCompose] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (embedded) setOpen(true);
  }, [embedded]);

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
    queryKey: ["customers-picker", debounced, embedded ? "embed" : "drop"],
    queryFn: () =>
      customersApi.list({
        q: debounced || undefined,
        limit: embedded && !debounced ? 8 : 20,
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
        setNewPhone((p) => p || digitsOnly(debounced));
      } else {
        setNewName((n) => n || filterPersonName(debounced));
      }
    }
  }, [open, noMatches, debounced]);

  function openCompose() {
    setCompose(true);
    if (looksLikePhone(q)) setNewPhone(digitsOnly(q));
    else if (q.trim().length >= 2) setNewName(filterPersonName(q));
  }

  async function createAndAttach() {
    const name = newName.trim();
    const phone = digitsOnly(newPhone);
    if (name.length < 2) {
      toast.error("Enter the customer name");
      return;
    }
    if (phone.length < 7) {
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
      if (!embedded) setOpen(false);
      setCompose(false);
      setQ("");
      setNewName("");
      setNewPhone("");
      onPicked?.();
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
    if (embedded) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [embedded]);

  function pickCustomer(c: {
    id: string;
    fullName: string;
    phone: string;
    email?: string | null;
    loyaltyPoints?: number;
    storeCreditBalance?: number;
  }) {
    onChange(c.id, {
      id: c.id,
      fullName: c.fullName,
      phone: c.phone,
      email: c.email,
      loyaltyPoints: c.loyaltyPoints,
      storeCreditBalance:
        c.storeCreditBalance != null ? Number(c.storeCreditBalance) : undefined,
    });
    if (!embedded) {
      setOpen(false);
      setQ("");
    }
    setCompose(false);
    onPicked?.();
  }

  const listBody = (
    <>
      {!compose || !embedded ? (
        <div className={cn(embedded ? "px-0 pb-2" : "border-b border-[#eef2f8] p-3")}>
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[#8b9bb0]" />
            <Input
              autoFocus={!compose}
              className={cn(
                "rounded-md border-[#d9e0ea] pl-8",
                embedded ? "h-9 text-sm" : "h-11 rounded-lg pl-10",
              )}
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
      ) : null}

      {compose && embedded ? (
        <div className="space-y-2.5 rounded-md border border-[#d6e4ff] bg-[#f5f8ff] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[0.7rem] font-semibold tracking-[0.08em] text-[#1a56db] uppercase">
              New customer
            </p>
            <button
              type="button"
              className="text-[0.7rem] font-semibold text-[#5a6b7d] hover:text-[#0b1f33]"
              onClick={() => setCompose(false)}
            >
              Back to list
            </button>
          </div>
          <Input
            autoFocus
            className="h-10 bg-white text-sm"
            placeholder="Full name"
            value={newName}
            onChange={(e) => setNewName(filterPersonName(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void createAndAttach();
              }
            }}
          />
          <Input
            className="h-10 bg-white text-sm"
            placeholder="Phone"
            inputMode="numeric"
            value={newPhone}
            onChange={(e) => setNewPhone(digitsOnly(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void createAndAttach();
              }
            }}
          />
          <div className="flex gap-2 pt-0.5">
            <Button
              type="button"
              size="sm"
              className="h-9 flex-1 text-sm"
              disabled={creating}
              onClick={() => void createAndAttach()}
            >
              {creating ? "Saving…" : "Save & attach"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-9 text-sm"
              disabled={creating}
              onClick={() => setCompose(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <ul
            className={cn(
              embedded
                ? "max-h-[min(14rem,40dvh)] overflow-y-auto rounded-md border border-[#e8edf4]"
                : "max-h-52 overflow-y-auto py-1",
            )}
          >
            {allowWalkIn ? (
              <li>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2.5 text-left transition",
                    embedded
                      ? "border-b border-[#f1f5f9] px-2.5 py-2 hover:bg-[#f8fafc]"
                      : "flex-col px-3.5 py-3 hover:bg-[#f4f6fa]",
                    !value && (embedded ? "bg-[#f0f5ff]" : "bg-[#eef4ff]"),
                  )}
                  onClick={() => {
                    onChange("", null);
                    if (!embedded) setOpen(false);
                    setQ("");
                    setCompose(false);
                    onPicked?.();
                  }}
                >
                  <span
                    className={cn(
                      "grid shrink-0 place-items-center rounded-full bg-[#eef2f8] text-[0.65rem] font-bold text-[#5a6b7d]",
                      embedded ? "h-7 w-7" : "hidden",
                    )}
                  >
                    W
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm font-semibold",
                        !value ? "text-[#1a56db]" : "text-[#0b1f33]",
                      )}
                    >
                      {walkInLabel}
                    </span>
                    <span className="block text-[0.68rem] text-[#8b9bb0]">
                      Guest checkout · no wallet
                    </span>
                  </span>
                  {!value ? (
                    <span className="shrink-0 text-[0.65rem] font-semibold text-[#1a56db]">
                      Selected
                    </span>
                  ) : null}
                </button>
              </li>
            ) : null}

            {items.map((c) => {
              const on = value === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2.5 text-left transition",
                      embedded
                        ? "border-b border-[#f1f5f9] px-2.5 py-2 last:border-b-0 hover:bg-[#f8fafc]"
                        : "flex-col px-3.5 py-3 hover:bg-[#f4f6fa]",
                      on && (embedded ? "bg-[#f0f5ff]" : "bg-[#eef4ff]"),
                    )}
                    onClick={() =>
                      pickCustomer({
                        id: c.id,
                        fullName: c.fullName,
                        phone: c.phone,
                        email: c.email,
                        loyaltyPoints: c.loyaltyPoints,
                        storeCreditBalance:
                          c.storeCreditBalance != null
                            ? Number(c.storeCreditBalance)
                            : undefined,
                      })
                    }
                  >
                    <span
                      className={cn(
                        "grid shrink-0 place-items-center rounded-full bg-[#e8eefb] text-[0.65rem] font-bold text-[#1a56db]",
                        embedded ? "h-7 w-7" : "hidden",
                      )}
                    >
                      {(c.fullName.trim()[0] || "?").toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[#0b1f33]">
                        {c.fullName}
                      </span>
                      <span className="block truncate text-[0.68rem] tabular-nums text-[#5a6b7d]">
                        {c.phone}
                        {c.email ? ` · ${c.email}` : ""}
                      </span>
                    </span>
                    {on ? (
                      <span className="shrink-0 text-[0.65rem] font-semibold text-[#1a56db]">
                        Selected
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}

            {results.isLoading ? (
              <li className="px-3 py-3 text-sm text-[#5a6b7d]">Searching…</li>
            ) : noMatches ? (
              <li className="px-3 py-2.5 text-[0.8rem] text-[#5a6b7d]">
                No match — add a new customer below.
              </li>
            ) : !debounced && items.length === 0 && !results.isLoading ? (
              <li className="px-3 py-2.5 text-[0.8rem] text-[#8b9bb0]">
                Type a name or phone to find a customer.
              </li>
            ) : null}
          </ul>

          {compose ? (
            <div
              className={cn(
                "space-y-2",
                embedded
                  ? "mt-2 rounded-md border border-[#e8edf4] bg-[#f8fafc] p-2.5"
                  : "space-y-2.5 border-t border-[#eef2f8] bg-[#f8fafc] px-3.5 py-3.5",
              )}
            >
              <p className="text-[0.65rem] font-semibold tracking-[0.08em] text-[#8b9bb0] uppercase">
                New customer
              </p>
              <Input
                className="h-9 bg-white text-sm"
                placeholder="Full name"
                value={newName}
                onChange={(e) => setNewName(filterPersonName(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createAndAttach();
                  }
                }}
              />
              <Input
                className="h-9 bg-white text-sm"
                placeholder="Phone"
                inputMode="numeric"
                value={newPhone}
                onChange={(e) => setNewPhone(digitsOnly(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createAndAttach();
                  }
                }}
              />
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 flex-1 text-xs"
                  disabled={creating}
                  onClick={() => void createAndAttach()}
                >
                  {creating ? "Saving…" : "Save & attach"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 text-xs"
                  disabled={creating}
                  onClick={() => setCompose(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={cn(
                "flex w-full items-center justify-center gap-1.5 text-[0.8rem] font-semibold text-[#1a56db] hover:bg-[#f5f8ff]",
                embedded
                  ? "mt-2 rounded-md border border-dashed border-[#c9d7f5] py-1.5"
                  : "border-t border-[#eef2f8] px-3 py-2.5",
              )}
              onClick={openCompose}
            >
              <UserPlus className="h-3.5 w-3.5" />
              New customer
            </button>
          )}

          {debounced || total > 0 ? (
            <p
              className={cn(
                "text-[0.65rem] text-[#8b9bb0]",
                embedded
                  ? "mt-1.5 px-0.5"
                  : "border-t border-[#eef2f8] px-3.5 py-2",
              )}
            >
              {debounced
                ? `${total.toLocaleString()} match${total === 1 ? "" : "es"}`
                : `Showing ${items.length} of ${total.toLocaleString()}`}
            </p>
          ) : null}
        </>
      )}
    </>
  );

  if (embedded) {
    return (
      <div ref={rootRef} className={cn("space-y-2", className)}>
        {value && selected.data ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-[#d6e4ff] bg-[#f5f8ff] px-2.5 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#0b1f33]">
                {selected.data.fullName}
              </p>
              <p className="truncate text-[0.7rem] tabular-nums text-[#5a6b7d]">
                {selected.data.phone}
                {showBalances
                  ? ` · wallet ${fmt(selected.data.storeCreditBalance ?? 0)}`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 text-[0.7rem] font-semibold text-[#5a6b7d] hover:text-[#c81e1e]"
              onClick={() => {
                onChange("", null);
                setQ("");
              }}
            >
              Clear
            </button>
          </div>
        ) : null}
        {listBody}
      </div>
    );
  }

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
      )}

      {open ? (
        <div className="absolute z-40 mt-1.5 w-full overflow-hidden rounded-[12px] border border-[#d9e0ea] bg-white shadow-[0_12px_28px_-12px_rgba(11,31,51,0.28)]">
          {listBody}
        </div>
      ) : null}
    </div>
  );
}
