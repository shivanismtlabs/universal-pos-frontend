"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronDown, Plus, Search, Tag, X } from "lucide-react";
import { catalogApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BrandItem = {
  id: string;
  name: string;
};

type Props = {
  value: string;
  onChange: (brandId: string) => void;
  brands: BrandItem[];
  className?: string;
  placeholder?: string;
  /** When the selected id is not in `brands` yet (edit hydrate) */
  selectedLabel?: string | null;
};

export function BrandSelectCombobox({
  value,
  onChange,
  brands,
  className,
  placeholder = "Select or type brand…",
  selectedLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
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

  const brandsWithSelected = useMemo(() => {
    if (!value) return brands;
    if (brands.some((b) => b.id === value)) return brands;
    if (!selectedLabel?.trim()) return brands;
    return [{ id: value, name: selectedLabel.trim() }, ...brands];
  }, [brands, value, selectedLabel]);

  const selected = useMemo(
    () => brandsWithSelected.find((b) => b.id === value),
    [brandsWithSelected, value],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return brandsWithSelected;
    return brandsWithSelected.filter((b) =>
      b.name.toLowerCase().includes(q),
    );
  }, [brandsWithSelected, search]);

  const exactMatchExists = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return brandsWithSelected.some((b) => b.name.trim().toLowerCase() === q);
  }, [brandsWithSelected, search]);

  const createBrand = useMutation({
    mutationFn: (name: string) =>
      catalogApi.createBrand({ name: name.trim() }) as Promise<{
        id: string;
        name: string;
      }>,
    onSuccess: (res) => {
      toast.success(`Brand “${res.name}” created`);
      void qc.invalidateQueries({ queryKey: ["catalog-brands"] });
      onChange(res.id);
      setOpen(false);
      setSearch("");
      setCreateModalOpen(false);
      setNewBrandName("");
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Failed to create brand",
      ),
  });

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-[#d9e0ea] bg-white px-3 text-sm text-[#0b1f33] shadow-sm transition hover:border-[#1a56db] focus:outline-none focus:ring-1 focus:ring-[#1a56db]",
          className,
        )}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={cn("truncate", !selected && "text-[#8b9bb0]")}>
          {selected?.name ?? placeholder}
        </span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-[#8b9bb0]" />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 flex max-h-64 w-full flex-col overflow-hidden rounded-lg border border-[#d9e0ea] bg-white shadow-xl">
          <div className="flex items-center gap-1.5 border-b border-[#eef1f4] bg-[#fafbfc] p-2">
            <Search className="h-4 w-4 shrink-0 text-[#8b9bb0]" />
            <input
              type="text"
              className="w-full bg-transparent text-xs text-[#0b1f33] outline-none placeholder:text-[#8b9bb0]"
              placeholder="Search brand or type new name…"
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

          <div className="max-h-44 divide-y divide-[#f1f5f9] overflow-y-auto text-xs">
            <button
              type="button"
              className={cn(
                "flex w-full items-center justify-between px-3 py-2 text-left transition-colors",
                !value
                  ? "bg-[#e8eefb] font-semibold text-[#1a56db]"
                  : "text-[#5a6b7d] hover:bg-[#f8fafc]",
              )}
              onClick={() => {
                onChange("");
                setOpen(false);
                setSearch("");
              }}
            >
              None
              {!value ? <Check className="h-3.5 w-3.5 text-[#1a56db]" /> : null}
            </button>

            {filtered.map((b) => {
              const isSelected = b.id === value;
              return (
                <button
                  key={b.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2 text-left transition-colors",
                    isSelected
                      ? "bg-[#e8eefb] font-semibold text-[#1a56db]"
                      : "text-[#0b1f33] hover:bg-[#f8fafc]",
                  )}
                  onClick={() => {
                    onChange(b.id);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <span className="truncate">{b.name}</span>
                  {isSelected ? (
                    <Check className="h-3.5 w-3.5 text-[#1a56db]" />
                  ) : null}
                </button>
              );
            })}

            {!filtered.length && search.trim() ? (
              <div className="p-3 text-center text-xs text-[#5a6b7d]">
                No brand matching &ldquo;{search.trim()}&rdquo;
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-1 border-t border-[#eef1f4] bg-[#f8fafc] p-1.5">
            {search.trim() && !exactMatchExists ? (
              <button
                type="button"
                disabled={createBrand.isPending}
                className="flex w-full items-center gap-1.5 rounded-md bg-[#e8eefb] px-2.5 py-1.5 text-xs font-semibold text-[#1a56db] transition hover:bg-[#d4e2fa]"
                onClick={() => createBrand.mutate(search.trim())}
              >
                <Plus className="h-3.5 w-3.5" />
                Add &ldquo;{search.trim()}&rdquo; as new brand
              </button>
            ) : null}

            <button
              type="button"
              className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-[#5a6b7d] transition hover:bg-[#eef2f8] hover:text-[#0b1f33]"
              onClick={() => {
                setNewBrandName(search.trim());
                setCreateModalOpen(true);
                setOpen(false);
              }}
            >
              <Tag className="h-3.5 w-3.5" />
              + Create new brand
            </button>
          </div>
        </div>
      ) : null}

      {createModalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-xl border border-[#d9e0ea] bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#0b1f33]">
                Add new brand
              </h3>
              <button
                type="button"
                className="text-[#8b9bb0] hover:text-[#0b1f33]"
                onClick={() => setCreateModalOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#0b1f33]">
                Brand name *
              </label>
              <Input
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                placeholder="e.g. Amul, Nike, Samsung"
                className="h-8 text-xs"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newBrandName.trim()) {
                    e.preventDefault();
                    createBrand.mutate(newBrandName.trim());
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
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
                disabled={!newBrandName.trim() || createBrand.isPending}
                onClick={() => createBrand.mutate(newBrandName.trim())}
              >
                {createBrand.isPending ? "Creating…" : "Create & select"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
