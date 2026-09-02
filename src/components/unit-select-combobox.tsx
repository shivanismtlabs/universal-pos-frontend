"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronDown, Plus, Scale, Search, X } from "lucide-react";
import { tenantsApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type UnitOption = {
  code: string;
  name: string;
};

type Props = {
  value: string;
  onChange: (unitCode: string) => void;
  unitOptions: UnitOption[];
  className?: string;
  placeholder?: string;
  compact?: boolean;
  allowAdd?: boolean;
};

export function UnitSelectCombobox({
  value,
  onChange,
  unitOptions,
  className,
  placeholder = "Select unit…",
  compact = false,
  allowAdd = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newUnitCode, setNewUnitCode] = useState("");
  const [newUnitName, setNewUnitName] = useState("");
  const [decimalQty, setDecimalQty] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unitsWithSelected = useMemo(() => {
    if (!value) return unitOptions;
    if (unitOptions.some((u) => u.code.toLowerCase() === value.toLowerCase())) {
      return unitOptions;
    }
    return [{ code: value, name: value }, ...unitOptions];
  }, [unitOptions, value]);

  const selectedUnit = useMemo(
    () =>
      unitsWithSelected.find(
        (u) => u.code.toLowerCase() === (value || "").toLowerCase(),
      ),
    [unitsWithSelected, value],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return unitsWithSelected;
    return unitsWithSelected.filter(
      (u) =>
        u.code.toLowerCase().includes(q) || u.name.toLowerCase().includes(q),
    );
  }, [unitsWithSelected, search]);

  const exactMatchExists = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return unitsWithSelected.some(
      (u) =>
        u.code.trim().toLowerCase() === q || u.name.trim().toLowerCase() === q,
    );
  }, [unitsWithSelected, search]);

  const createUnitMutation = useMutation({
    mutationFn: (data: { code: string; name: string; decimalQty?: boolean }) =>
      tenantsApi.createUnit({
        code: data.code.trim(),
        name: data.name.trim() || data.code.trim(),
        decimalQty: data.decimalQty ?? false,
      }),
    onSuccess: async (_, vars) => {
      const createdCode = vars.code.trim();
      toast.success(`Unit “${vars.name || createdCode}” (${createdCode}) added!`);
      await qc.invalidateQueries({ queryKey: ["measure-units"] });
      await qc.invalidateQueries({ queryKey: ["catalog-unit-groups"] });
      onChange(createdCode);
      setOpen(false);
      setSearch("");
      setCreateModalOpen(false);
      setNewUnitCode("");
      setNewUnitName("");
      setDecimalQty(false);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError
          ? e.messages?.join(", ") || e.message
          : e instanceof Error
            ? e.message
            : "Failed to create unit",
      ),
  });

  function handleQuickCreate(query: string) {
    const clean = query.trim();
    if (!clean) return;
    const isDecimal = /(kg|kilo|gram|gm|ltr|liter|litre|meter|metre|hour|day|ml)/i.test(
      clean,
    );
    createUnitMutation.mutate({
      code: clean.toLowerCase().slice(0, 16),
      name: clean.charAt(0).toUpperCase() + clean.slice(1),
      decimalQty: isDecimal,
    });
  }

  function openCreateModalWithSearch() {
    const clean = search.trim();
    setNewUnitCode(clean.toLowerCase().slice(0, 16));
    setNewUnitName(clean.charAt(0).toUpperCase() + clean.slice(1));
    setDecimalQty(false);
    setCreateModalOpen(true);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={cn("relative", compact ? "w-auto" : "w-full")}>
      <button
        type="button"
        className={cn(
          "flex items-center justify-between rounded-lg border border-[#d9e0ea] bg-white text-[#0b1f33] shadow-xs transition hover:border-[#1a56db] focus:outline-none focus:ring-1 focus:ring-[#1a56db]",
          compact ? "h-10 px-2.5 min-w-[5.5rem] text-sm font-semibold" : "h-10 w-full px-3 text-sm",
          className,
        )}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="truncate">
          {selectedUnit
            ? compact
              ? selectedUnit.code
              : `${selectedUnit.name} (${selectedUnit.code})`
            : placeholder}
        </span>
        <ChevronDown className="ml-1.5 h-4 w-4 shrink-0 text-[#8b9bb0]" />
      </button>

      {open ? (
        <div
          className={cn(
            "absolute top-full z-50 mt-1 flex max-h-64 flex-col overflow-hidden rounded-lg border border-[#d9e0ea] bg-white shadow-xl",
            compact ? "right-0 w-64" : "left-0 w-full",
          )}
        >
          {/* Search Header */}
          <div className="flex items-center gap-1.5 border-b border-[#eef1f4] bg-[#fafbfc] p-2">
            <Search className="h-4 w-4 shrink-0 text-[#8b9bb0]" />
            <input
              type="text"
              className="w-full bg-transparent text-xs text-[#0b1f33] outline-none placeholder:text-[#8b9bb0]"
              placeholder="Search or type unit symbol…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            {search ? (
              <button
                type="button"
                className="text-[#8b9bb0] hover:text-[#0b1f33]"
                onClick={() => setSearch("")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          {/* Unit List */}
          <div className="max-h-44 divide-y divide-[#f1f5f9] overflow-y-auto text-xs">
            {filtered.map((u) => {
              const isSelected =
                u.code.toLowerCase() === (value || "").toLowerCase();
              return (
                <button
                  key={u.code}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2 text-left transition-colors",
                    isSelected
                      ? "bg-[#e8eefb] font-semibold text-[#1a56db]"
                      : "text-[#0b1f33] hover:bg-[#f8fafc]",
                  )}
                  onClick={() => {
                    onChange(u.code);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <div className="flex items-baseline gap-2 truncate">
                    <span className="font-mono font-semibold text-[#0b1f33]">
                      {u.code}
                    </span>
                    <span className="text-[0.72rem] text-[#5a6b7d] truncate">
                      {u.name}
                    </span>
                  </div>
                  {isSelected ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-[#1a56db]" />
                  ) : null}
                </button>
              );
            })}

            {!filtered.length && search.trim() ? (
              <div className="p-3 text-center text-xs text-[#5a6b7d]">
                No unit matching &ldquo;{search.trim()}&rdquo;
              </div>
            ) : null}
          </div>

          {/* Inline Add Footer */}
          {allowAdd ? (
            <div className="flex flex-col gap-1 border-t border-[#eef1f4] bg-[#f8fafc] p-1.5">
              {search.trim() && !exactMatchExists ? (
                <button
                  type="button"
                  disabled={createUnitMutation.isPending}
                  className="flex w-full items-center gap-1.5 rounded-md bg-[#e8eefb] px-2.5 py-1.5 text-xs font-semibold text-[#1a56db] transition hover:bg-[#d4e2fa]"
                  onClick={() => handleQuickCreate(search)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add &ldquo;{search.trim()}&rdquo; as new unit
                </button>
              ) : null}

              <button
                type="button"
                className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-[#5a6b7d] transition hover:bg-[#eef2f8] hover:text-[#0b1f33]"
                onClick={openCreateModalWithSearch}
              >
                <Scale className="h-3.5 w-3.5" />
                + Create new unit
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Modal for detailed unit creation */}
      {createModalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-xl border border-[#d9e0ea] bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#0b1f33]">
                Add new unit
              </h3>
              <button
                type="button"
                className="text-[#8b9bb0] hover:text-[#0b1f33]"
                onClick={() => setCreateModalOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="mb-1 block font-medium text-[#0b1f33]">
                  Unit name *
                </label>
                <Input
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  placeholder="e.g. Packet, Bundle, Strip"
                  className="h-8 text-xs"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1 block font-medium text-[#0b1f33]">
                  Symbol / Code *
                </label>
                <Input
                  value={newUnitCode}
                  onChange={(e) => setNewUnitCode(e.target.value)}
                  placeholder="e.g. pkt, bdl, strip"
                  maxLength={16}
                  className="h-8 font-mono text-xs"
                />
                <p className="mt-1 text-[0.65rem] text-[#8b9bb0]">
                  Short code shown on receipts and tickets.
                </p>
              </div>

              <label className="flex items-center gap-2 pt-1 font-medium text-[#0b1f33] cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-[#1a56db]"
                  checked={decimalQty}
                  onChange={(e) => setDecimalQty(e.target.checked)}
                />
                Allow decimal quantities (e.g. 1.5 kg, 0.25 L)
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setCreateModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={
                  !newUnitCode.trim() ||
                  !newUnitName.trim() ||
                  createUnitMutation.isPending
                }
                onClick={() =>
                  createUnitMutation.mutate({
                    code: newUnitCode.trim(),
                    name: newUnitName.trim(),
                    decimalQty,
                  })
                }
              >
                {createUnitMutation.isPending ? "Creating…" : "Create & select"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
