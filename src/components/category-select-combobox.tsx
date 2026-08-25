"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Plus, Search, Check, FolderPlus, X } from "lucide-react";
import { catalogApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CategoryItem = {
  id: string;
  name: string;
  parent?: { id: string; name: string } | null;
  parentId?: string | null;
};

type Props = {
  value: string;
  onChange: (categoryId: string) => void;
  categories: CategoryItem[];
  className?: string;
  placeholder?: string;
  /** When the selected id is not in `categories` yet (edit hydrate), show this label */
  selectedLabel?: string | null;
};

export function CategorySelectCombobox({
  value,
  onChange,
  categories,
  className,
  placeholder = "Select or search category...",
  selectedLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const categoriesWithSelected = useMemo(() => {
    if (!value) return categories;
    if (categories.some((c) => c.id === value)) return categories;
    if (!selectedLabel?.trim()) return categories;
    return [
      {
        id: value,
        name: selectedLabel.trim(),
        parentId: null,
        parent: null,
      },
      ...categories,
    ];
  }, [categories, value, selectedLabel]);

  const selectedCategory = useMemo(
    () => categoriesWithSelected.find((c) => c.id === value),
    [categoriesWithSelected, value],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categoriesWithSelected;
    return categoriesWithSelected.filter((c) => {
      const full = c.parent ? `${c.parent.name} / ${c.name}` : c.name;
      return full.toLowerCase().includes(q);
    });
  }, [categoriesWithSelected, search]);

  const exactMatchExists = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return categoriesWithSelected.some(
      (c) => c.name.trim().toLowerCase() === q,
    );
  }, [categoriesWithSelected, search]);

  const createCategoryMutation = useMutation({
    mutationFn: (data: { name: string; parentId?: string }) =>
      catalogApi.createCategory({
        name: data.name.trim(),
        parentId: data.parentId || undefined,
      }),
    onSuccess: (res: { id: string; name: string }) => {
      toast.success(`Category "${res.name}" created!`);
      void qc.invalidateQueries({ queryKey: ["catalog-categories"] });
      onChange(res.id);
      setOpen(false);
      setSearch("");
      setCreateModalOpen(false);
      setNewCategoryName("");
      setNewParentId("");
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Failed to create category",
      ),
  });

  function handleQuickCreate(nameToCreate: string) {
    if (!nameToCreate.trim()) return;
    createCategoryMutation.mutate({ name: nameToCreate.trim() });
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Combobox Trigger / Button */}
      <button
        type="button"
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-[#d9e0ea] bg-white px-3 text-sm text-[#0b1f33] shadow-sm transition hover:border-[#1a56db] focus:outline-none focus:ring-1 focus:ring-[#1a56db]",
          className,
        )}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="truncate">
          {selectedCategory
            ? selectedCategory.parent
              ? `${selectedCategory.parent.name} / ${selectedCategory.name}`
              : selectedCategory.name
            : placeholder}
        </span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-[#8b9bb0]" />
      </button>

      {/* Dropdown Panel */}
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-full overflow-hidden rounded-lg border border-[#d9e0ea] bg-white shadow-xl flex flex-col">
          {/* Search Header Input */}
          <div className="p-2 border-b border-[#eef1f4] bg-[#fafbfc] flex items-center gap-1.5">
            <Search className="h-4 w-4 text-[#8b9bb0] shrink-0" />
            <input
              type="text"
              className="w-full bg-transparent text-xs text-[#0b1f33] outline-none placeholder:text-[#8b9bb0]"
              placeholder="Search category or type new name..."
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

          {/* List Options */}
          <div className="overflow-y-auto max-h-44 divide-y divide-[#f1f5f9] text-xs">
            {filtered.map((cat) => {
              const isSelected = cat.id === value;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2 text-left transition-colors",
                    isSelected ? "bg-[#e8eefb] font-semibold text-[#1a56db]" : "hover:bg-[#f8fafc] text-[#0b1f33]",
                  )}
                  onClick={() => {
                    onChange(cat.id);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <span className="truncate">
                    {cat.parent ? `${cat.parent.name} / ` : ""}
                    {cat.name}
                  </span>
                  {isSelected ? <Check className="h-3.5 w-3.5 text-[#1a56db]" /> : null}
                </button>
              );
            })}

            {!filtered.length && search.trim() ? (
              <div className="p-3 text-center text-xs text-[#5a6b7d]">
                No existing category found matching &ldquo;{search}&rdquo;
              </div>
            ) : null}
          </div>

          {/* Inline Add Option Footer */}
          <div className="border-t border-[#eef1f4] bg-[#f8fafc] p-1.5 flex flex-col gap-1">
            {search.trim() && !exactMatchExists ? (
              <button
                type="button"
                disabled={createCategoryMutation.isPending}
                className="flex w-full items-center gap-1.5 rounded-md bg-[#e8eefb] px-2.5 py-1.5 text-xs font-semibold text-[#1a56db] hover:bg-[#d4e2fa] transition"
                onClick={() => handleQuickCreate(search)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add &ldquo;{search.trim()}&rdquo; as new category
              </button>
            ) : null}

            <button
              type="button"
              className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-[#5a6b7d] hover:bg-[#eef2f8] hover:text-[#0b1f33] transition"
              onClick={() => {
                setNewCategoryName(search.trim());
                setCreateModalOpen(true);
                setOpen(false);
              }}
            >
              <FolderPlus className="h-3.5 w-3.5" />
              + Create Category with Parent Option
            </button>
          </div>
        </div>
      ) : null}

      {/* Mini Modal for Custom Category Creation */}
      {createModalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl border border-[#d9e0ea] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#0b1f33]">Add New Category</h3>
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
                <label className="block font-medium text-[#0b1f33] mb-1">
                  Category Name *
                </label>
                <Input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g. Beverages, Electronics"
                  className="h-8 text-xs"
                />
              </div>

              <div>
                <label className="block font-medium text-[#0b1f33] mb-1">
                  Parent Category (Optional)
                </label>
                <select
                  value={newParentId}
                  onChange={(e) => setNewParentId(e.target.value)}
                  className="h-8 w-full rounded-md border border-[#d9e0ea] bg-white px-2 text-xs text-[#0b1f33] outline-none"
                >
                  <option value="">— None (Top Level) —</option>
                  {categories
                    .filter((c) => !c.parentId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
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
                disabled={!newCategoryName.trim() || createCategoryMutation.isPending}
                onClick={() =>
                  createCategoryMutation.mutate({
                    name: newCategoryName,
                    parentId: newParentId,
                  })
                }
              >
                Create & Select
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
