"use client";

import { useEffect, useRef, useState } from "react";
import { X, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type CategoryOption = { id: string; name: string };

type AddCategoryModalProps = {
  open: boolean;
  onClose: () => void;
  /** Existing categories for Parent Category dropdown */
  categories: CategoryOption[];
  saving?: boolean;
  onSave: (payload: {
    name: string;
    parentId?: string;
    imageFile?: File | null;
  }) => void | Promise<void>;
};

/**
 * Zoho POS–style Add Category dialog (label | control rows, soft Save).
 */
export function AddCategoryModal({
  open,
  onClose,
  categories,
  saving,
  onSave,
}: AddCategoryModalProps) {
  const [categoryName, setCategoryName] = useState("");
  const [parentId, setParentId] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setCategoryName("");
    setParentId("");
    setImage(null);
    setPreviewUrl(null);
    setNameError(null);
    if (fileRef.current) fileRef.current.value = "";
  }, [open]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!open) return null;

  function onFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNameError("Choose an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setNameError("Image not exceeding 5 MB.");
      return;
    }
    setNameError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setImage(file);
  }

  async function handleSave() {
    const name = categoryName.trim();
    if (!name) {
      setNameError("Category name is required");
      return;
    }
    setNameError(null);
    await onSave({
      name,
      parentId: parentId || undefined,
      imageFile: image,
    });
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#0b1f33]/40"
        aria-label="Close overlay"
        onClick={onClose}
        disabled={saving}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-category-title"
        className="relative z-10 flex w-full max-w-[640px] flex-col overflow-hidden rounded-md border border-[#e4e7ec] bg-white shadow-[0_8px_30px_rgba(11,31,51,0.12)]"
      >
        {/* Header — Zoho: title left, red close right */}
        <div className="flex items-center justify-between border-b border-[#eef1f4] px-6 py-[18px]">
          <h2
            id="add-category-title"
            className="text-[1.125rem] font-medium tracking-[-0.01em] text-[#222]"
          >
            Add Category
          </h2>
          <button
            type="button"
            className="rounded p-0.5 text-[#e02424] transition-colors hover:bg-[#fff1f1]"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            <X className="h-[18px] w-[18px] stroke-[2.5]" />
          </button>
        </div>

        {/* Body — label | field rows */}
        <div className="space-y-7 px-6 py-7">
          <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[148px_minmax(0,1fr)] sm:gap-x-4">
            <Label
              htmlFor="cat-name"
              className="text-[0.875rem] font-normal text-[#333]"
            >
              Category Name
              <span className="text-[#e02424]">*</span>
            </Label>
            <Input
              id="cat-name"
              placeholder="Enter a category name"
              value={categoryName}
              onChange={(e) => {
                setCategoryName(e.target.value);
                if (nameError) setNameError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSave();
                }
              }}
              disabled={saving}
              className="h-10 max-w-[420px] rounded-md border-[#cfd8e6]"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[148px_minmax(0,1fr)] sm:gap-x-4">
            <Label
              htmlFor="cat-parent"
              className="text-[0.875rem] font-normal text-[#333]"
            >
              Parent Category
            </Label>
            <div className="max-w-[420px]">
              <Select
                id="cat-parent"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                disabled={saving}
                className="h-10 rounded-md border-[#cfd8e6]"
              >
                <option value="">Select a parent category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[148px_minmax(0,1fr)] sm:gap-x-4">
            <Label className="pt-1 text-[0.875rem] font-normal text-[#333]">
              Category Image
            </Label>
            <div>
              <div
                role="button"
                tabIndex={0}
                className={cn(
                  "flex h-[168px] max-w-[280px] flex-col items-center justify-center rounded-md border border-dashed border-[#c5d0e0] bg-white",
                  "cursor-pointer transition-colors hover:bg-[#fafbfd]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a56db]/25",
                )}
                onClick={() => !saving && fileRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileRef.current?.click();
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (saving) return;
                  onFile(e.dataTransfer.files?.[0] ?? null);
                }}
              >
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="Category preview"
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <>
                    {/* Hand + dashed box (Zoho-style affordance) */}
                    <svg
                      width="44"
                      height="44"
                      viewBox="0 0 48 48"
                      fill="none"
                      className="mb-2 text-[#9aa8b8]"
                      aria-hidden
                    >
                      <rect
                        x="10"
                        y="8"
                        width="22"
                        height="22"
                        rx="2"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeDasharray="3 2.5"
                      />
                      <path
                        d="M28 30c0 0 1.5 5 4 6.5 2 1.2 5 .8 6.5-1.2 1-1.3 1.2-3 .4-4.5L33 22.5c-.6-1.1-2-1.4-2.9-.6l-.8.7"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M22 20.5l3-3 3 3M25 17.5V25"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <p className="text-[0.875rem] text-[#5a6b7d]">
                      Drag image here or
                    </p>
                    <p className="text-[0.875rem] font-medium text-[#1a56db]">
                      Browse image
                    </p>
                    <p className="mt-2.5 flex items-center gap-1 text-[0.72rem] text-[#8b9bb0]">
                      <Info className="h-3.5 w-3.5 shrink-0" />
                      Image not exceeding 5 MB.
                    </p>
                  </>
                )}
              </div>
              {image && previewUrl ? (
                <button
                  type="button"
                  className="mt-2 text-[0.75rem] font-medium text-[#5a6b7d] hover:text-[#e02424] hover:underline"
                  disabled={saving}
                  onClick={() => {
                    if (previewUrl) URL.revokeObjectURL(previewUrl);
                    setPreviewUrl(null);
                    setImage(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                >
                  Remove image
                </button>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={saving}
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
              {nameError ? (
                <p className="mt-2 text-[0.78rem] text-[#e02424]">{nameError}</p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Footer — left-aligned Save (soft blue) + Cancel */}
        <div className="flex items-center gap-3 border-t border-[#eef1f4] bg-white px-6 py-4">
          <Button
            type="button"
            disabled={saving}
            className="h-[38px] min-w-[88px] rounded-md border-0 bg-[#8cb0ff] px-6 font-medium text-white shadow-none hover:bg-[#7aa3ff] active:bg-[#6b97f7]"
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={saving}
            className="h-[38px] min-w-[88px] rounded-md border-[#d0d7e2] bg-[#f4f5f7] px-6 font-normal text-[#222] shadow-none hover:bg-[#eaeaed]"
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
