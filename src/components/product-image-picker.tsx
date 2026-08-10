"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import {
  prepareProductImage,
  type PreparedImage,
} from "@/lib/image-prepare";

export type ProductImagePickerHandle = {
  /** Compact data URLs for API upload (not blob previews). */
  getUploadDataUrls: () => string[];
  clear: () => void;
};

type Slot = PreparedImage & { id: string };

/**
 * Local-only image picker — previews use short blob: URLs.
 * Upload payloads stay in a ref and never enter parent form state
 * (avoids blank/crash from multi‑MB React re-renders).
 */
export const ProductImagePicker = forwardRef<
  ProductImagePickerHandle,
  {
    label?: string;
    hint?: string;
    max?: number;
  }
>(function ProductImagePicker(
  {
    label = "Product images",
    hint = "Optional · up to eight photos · first image becomes the cover",
    max = 8,
  },
  ref,
) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [busy, setBusy] = useState(false);
  const slotsRef = useRef<Slot[]>([]);
  slotsRef.current = slots;
  const inputRef = useRef<HTMLInputElement>(null);

  const revokeAll = useCallback((list: Slot[]) => {
    for (const s of list) {
      try {
        URL.revokeObjectURL(s.previewUrl);
      } catch {
        /* ignore */
      }
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      getUploadDataUrls: () => slotsRef.current.map((s) => s.uploadDataUrl),
      clear: () => {
        revokeAll(slotsRef.current);
        slotsRef.current = [];
        setSlots([]);
        if (inputRef.current) inputRef.current.value = "";
      },
    }),
    [revokeAll],
  );

  function removeAt(index: number) {
    setSlots((prev) => {
      const target = prev[index];
      if (target) {
        try {
          URL.revokeObjectURL(target.previewUrl);
        } catch {
          /* ignore */
        }
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  async function onFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    setBusy(true);
    try {
      const added: Slot[] = [];
      const room = max - slotsRef.current.length;
      for (const file of files.slice(0, Math.max(0, room))) {
        try {
          const prepared = await prepareProductImage(file);
          added.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            ...prepared,
          });
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : `Could not read ${file.name}`,
          );
        }
      }
      if (added.length) {
        setSlots((prev) => [...prev, ...added].slice(0, max));
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="field-shell">
      <Label>{label}</Label>
      <p className="mb-2 text-[0.7rem] text-[#8b9bb0]">{hint}</p>
      <div className="flex flex-wrap gap-2">
        {slots.map((slot, idx) => (
          <div key={slot.id} className="relative h-14 w-14 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slot.previewUrl}
              alt=""
              className="h-14 w-14 rounded-lg border border-[#d9e0ea] object-cover bg-[#f4f6fa]"
            />
            <button
              type="button"
              className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[#c81e1e] text-[0.65rem] font-bold text-white"
              onClick={() => removeAt(idx)}
              aria-label="Remove photo"
            >
              ×
            </button>
          </div>
        ))}
        {slots.length < max ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="grid h-14 w-14 place-items-center rounded-lg border border-dashed border-[#cfd8e6] text-xs font-semibold text-[#1a56db] hover:bg-[#e8eefb] disabled:opacity-50"
          >
            {busy ? "…" : "+"}
          </button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => void onFiles(e.target.files)}
        />
      </div>
      {busy ? (
        <p className="mt-1 text-[0.7rem] text-[#5a6b7d]">Preparing photo…</p>
      ) : (
        <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
          {slots.length
            ? `${slots.length} photo${slots.length === 1 ? "" : "s"} ready`
            : "JPEG, PNG, WebP, or GIF · resized automatically"}
        </p>
      )}
    </div>
  );
});
