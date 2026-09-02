"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Sparkles, Trash2, X, RefreshCw, Plus } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  prepareProductImage,
  prepareProductImageFromDataUrl,
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
    /** Zoho New Item: Front / Rear / Other zones — same files as default. */
    variant?: "default" | "item";
    /** Product name for Openverse real-photo search. */
    productName?: string;
    /** Optional extra search detail (e.g. short description). */
    productHint?: string;
  }
>(function ProductImagePicker(
  {
    label = "Product images",
    hint = "Optional · up to eight photos · first image becomes the cover",
    max = 8,
    variant = "default",
    productName,
    productHint,
  },
  ref,
) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const slotsRef = useRef<Slot[]>([]);
  slotsRef.current = slots;
  const inputRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<"append" | 0 | 1>("append");

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

  function clearAll() {
    revokeAll(slotsRef.current);
    slotsRef.current = [];
    setSlots([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function pushPrepared(
    prepared: PreparedImage,
    mode: "append" | 0 | 1 = "append",
  ) {
    const one: Slot = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...prepared,
    };
    setSlots((prev) => {
      if (mode === 0) {
        if (prev[0]) {
          try {
            URL.revokeObjectURL(prev[0].previewUrl);
          } catch {
            /* ignore */
          }
        }
        if (!prev.length) return [one];
        const next = [...prev];
        next[0] = one;
        return next;
      }
      if (mode === 1) {
        if (prev.length === 0) return [one];
        if (prev[1]) {
          try {
            URL.revokeObjectURL(prev[1].previewUrl);
          } catch {
            /* ignore */
          }
        }
        if (prev.length === 1) return [...prev, one].slice(0, max);
        const next = [...prev];
        next[1] = one;
        return next;
      }
      return [...prev, one].slice(0, max);
    });
  }

  async function onFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    setBusy(true);
    try {
      const room = max - slotsRef.current.length;
      const target = targetRef.current;
      let first = true;
      for (const file of files.slice(0, Math.max(0, room))) {
        try {
          const prepared = await prepareProductImage(file);
          pushPrepared(prepared, first ? target : "append");
          first = false;
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : `Could not read ${file.name}`,
          );
        }
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function applyImageDataUrl(dataUrl: string, successMsg: string) {
    const prepared = await prepareProductImageFromDataUrl(dataUrl);
    pushPrepared(prepared, slotsRef.current.length === 0 ? 0 : "append");
    toast.success(successMsg);
  }

  async function findRealPhoto() {
    const name = productName?.trim() ?? "";
    if (name.length < 2) {
      toast.error("Enter the product name first (e.g. Pani Kofta / Malai Kofta)");
      return;
    }
    if (slotsRef.current.length >= max) {
      toast.error(`Maximum ${max} images`);
      return;
    }
    setAiBusy(true);
    try {
      // Next.js route — no Nest / Pollinations AI required
      const res = await fetch("/api/catalog/find-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          hint: productHint?.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        message?: string;
        imageBase64?: string;
      };
      if (!res.ok || !data.imageBase64) {
        throw new Error(data.message || "No real photo found");
      }
      await applyImageDataUrl(
        data.imageBase64,
        "Real photo found — save the item to keep it",
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "No real photo found",
      );
    } finally {
      setAiBusy(false);
    }
  }

  function openPicker(mode: "append" | 0 | 1, multiple: boolean) {
    targetRef.current = mode;
    if (inputRef.current) {
      inputRef.current.multiple = multiple;
      inputRef.current.click();
    }
  }

  function AiGenerateBar() {
    return (
      <div className="space-y-2 rounded-lg border border-[#d9e0ea] bg-[#f8fafc] p-3">
        <p className="text-[0.72rem] font-medium text-[#0b1f33]">
          Free real photos from product name
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy || aiBusy}
            onClick={() => void findRealPhoto()}
            className="gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {aiBusy ? "Searching…" : "Find real photo"}
          </Button>
        </div>
        <p className="text-[0.65rem] leading-snug text-[#8b9bb0]">
          Uses Openverse (real Creative Commons photos) — not AI art. Or upload
          your own photo below.
        </p>
      </div>
    );
  }

  function Zone({
    title,
    subtitle,
    slot,
    tall,
    droppable,
    onPick,
    onClear,
  }: {
    title: string;
    subtitle: string;
    slot?: Slot;
    tall?: boolean;
    droppable?: boolean;
    onPick: () => void;
    onClear?: () => void;
  }) {
    if (slot) {
      return (
        <div
          className={[
            "group relative flex w-full flex-col items-center justify-center overflow-hidden rounded-lg border border-[#d9e0ea] bg-white p-2 text-center shadow-xs transition hover:border-[#1a56db]/40",
            tall ? "min-h-[11.5rem]" : "min-h-[7.5rem]",
          ].join(" ")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slot.previewUrl}
            alt={title}
            className="h-full max-h-32 w-full rounded object-contain bg-[#f8fafc]"
          />

          {/* Action overlay bar */}
          <div className="mt-2 flex w-full items-center justify-between gap-1.5 border-t border-[#f1f5f9] pt-1.5">
            <span className="truncate text-left text-[0.65rem] font-semibold text-[#5a6b7d]">
              {title}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                title="Replace with another image"
                className="inline-flex items-center gap-1 rounded bg-[#f1f5f9] px-2 py-0.5 text-[0.68rem] font-medium text-[#0b1f33] hover:bg-[#e2e8f0] transition"
                onClick={onPick}
              >
                <RefreshCw className="size-3 text-[#5a6b7d]" />
                <span>Change</span>
              </button>
              {onClear ? (
                <button
                  type="button"
                  title="Remove this image"
                  className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-[0.68rem] font-semibold text-rose-600 hover:bg-rose-100 transition"
                  onClick={onClear}
                >
                  <Trash2 className="size-3 text-rose-600" />
                  <span>Remove</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      );
    }

    return (
      <button
        type="button"
        disabled={busy || aiBusy}
        onClick={onPick}
        onDragOver={
          droppable
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
              }
            : undefined
        }
        onDrop={
          droppable
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                targetRef.current = "append";
                void onFiles(e.dataTransfer.files);
              }
            : undefined
        }
        className={[
          "relative flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-[#c5d0e0] bg-[#fafbfc] px-3 py-4 text-center transition hover:border-[#1a56db]/50 hover:bg-[#f4f7ff] disabled:opacity-50 cursor-pointer",
          tall ? "min-h-[11.5rem]" : "min-h-[7.5rem]",
        ].join(" ")}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          className="text-[#1a56db]"
          aria-hidden
        >
          <path
            d="M12 16V8M8.5 11.5 12 8l3.5 3.5M5 19h14"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="mt-1.5 text-[0.75rem] font-semibold text-[#1a56db]">
          {title}
        </p>
        <p className="mt-0.5 max-w-[14rem] text-[0.65rem] leading-snug text-[#8b9bb0]">
          {subtitle}
        </p>
      </button>
    );
  }

  if (variant === "item") {
    const extras = slots.slice(2);
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold text-[#0b1f33]">
            {label || "Product images"}
          </Label>
          {slots.length > 0 ? (
            <button
              type="button"
              className="text-[0.72rem] font-semibold text-rose-600 hover:text-rose-700 hover:underline inline-flex items-center gap-1"
              onClick={clearAll}
            >
              <Trash2 className="size-3" />
              Remove all ({slots.length})
            </button>
          ) : null}
        </div>
        <AiGenerateBar />
        <div className="grid grid-cols-2 gap-2.5">
          <Zone
            title="Front Image"
            subtitle="Cover photo"
            slot={slots[0]}
            onPick={() => openPicker(0, false)}
            onClear={slots[0] ? () => removeAt(0) : undefined}
          />
          <Zone
            title="Rear Image"
            subtitle="Optional back view"
            slot={slots[1]}
            onPick={() => openPicker(1, false)}
            onClear={slots[1] ? () => removeAt(1) : undefined}
          />
        </div>
        <Zone
          tall
          droppable
          title="Drag & Drop Images"
          subtitle={`You can add up to ${max} images, each prepared automatically.`}
          slot={undefined}
          onPick={() => openPicker("append", true)}
        />
        {extras.length ? (
          <div className="space-y-1.5">
            <p className="text-[0.7rem] font-semibold text-[#5a6b7d]">
              Additional images ({extras.length})
            </p>
            <div className="flex flex-wrap gap-2.5">
              {extras.map((slot, i) => (
                <div key={slot.id} className="group relative h-16 w-16">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slot.previewUrl}
                    alt=""
                    className="h-16 w-16 rounded-lg border border-[#d9e0ea] object-cover bg-white shadow-2xs"
                  />
                  <button
                    type="button"
                    title="Remove this photo"
                    aria-label="Remove photo"
                    className="absolute -top-1.5 -right-1.5 grid h-6 w-6 place-items-center rounded-full bg-rose-600 text-white shadow-md hover:bg-rose-700 transition"
                    onClick={() => removeAt(i + 2)}
                  >
                    <X className="size-3.5 stroke-[2.5]" />
                  </button>
                </div>
              ))}
            </div>
          </div>
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
    );
  }

  return (
    <div className="field-shell">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {slots.length > 0 ? (
          <button
            type="button"
            className="text-[0.72rem] font-semibold text-rose-600 hover:text-rose-700 hover:underline inline-flex items-center gap-1"
            onClick={clearAll}
          >
            <Trash2 className="size-3" />
            Remove all
          </button>
        ) : null}
      </div>
      <p className="mb-2 text-[0.7rem] text-[#8b9bb0]">{hint}</p>
      <div className="mb-2">
        <AiGenerateBar />
      </div>
      <div className="flex flex-wrap gap-2.5">
        {slots.map((slot, idx) => (
          <div key={slot.id} className="group relative h-16 w-16 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slot.previewUrl}
              alt=""
              className="h-16 w-16 rounded-lg border border-[#d9e0ea] object-cover bg-[#f4f6fa] shadow-2xs"
            />
            <button
              type="button"
              className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-rose-600 text-white shadow-md hover:bg-rose-700 transition"
              onClick={() => removeAt(idx)}
              aria-label="Remove photo"
              title="Remove photo"
            >
              <X className="size-3.5 stroke-[2.5]" />
            </button>
          </div>
        ))}
        {slots.length < max ? (
          <button
            type="button"
            disabled={busy || aiBusy}
            onClick={() => inputRef.current?.click()}
            className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-[#cfd8e6] text-sm font-semibold text-[#1a56db] hover:border-[#1a56db] hover:bg-[#e8eefb] transition disabled:opacity-50 cursor-pointer"
            title="Add photo"
          >
            {busy || aiBusy ? "…" : <Plus className="size-5" />}
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
      {busy || aiBusy ? (
        <p className="mt-1.5 text-[0.7rem] text-[#5a6b7d]">
          {aiBusy ? "Generating AI image…" : "Preparing photo…"}
        </p>
      ) : (
        <p className="mt-1.5 text-[0.7rem] text-[#8b9bb0]">
          {slots.length
            ? `${slots.length} photo${slots.length === 1 ? "" : "s"} ready`
            : "JPEG, PNG, WebP, or GIF · resized automatically"}
        </p>
      )}
    </div>
  );
});

