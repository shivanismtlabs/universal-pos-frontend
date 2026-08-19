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
    /** Zoho New Item: Front / Rear / Other zones — same files as default. */
    variant?: "default" | "item";
  }
>(function ProductImagePicker(
  {
    label = "Product images",
    hint = "Optional · up to eight photos · first image becomes the cover",
    max = 8,
    variant = "default",
  },
  ref,
) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [busy, setBusy] = useState(false);
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
        const target = targetRef.current;
        setSlots((prev) => {
          if (target === 0 || target === 1) {
            const one = added[0];
            if (!one) return prev;
            const next = [...prev];
            if (target === 0) {
              if (next[0]) {
                try {
                  URL.revokeObjectURL(next[0].previewUrl);
                } catch {
                  /* ignore */
                }
              }
              if (!next.length) return [one];
              next[0] = one;
              return next;
            }
            if (next.length === 0) return [one];
            if (next[1]) {
              try {
                URL.revokeObjectURL(next[1].previewUrl);
              } catch {
                /* ignore */
              }
            }
            if (next.length === 1) return [...next, one].slice(0, max);
            next[1] = one;
            return next;
          }
          return [...prev, ...added].slice(0, max);
        });
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function openPicker(mode: "append" | 0 | 1, multiple: boolean) {
    targetRef.current = mode;
    if (inputRef.current) {
      inputRef.current.multiple = multiple;
      inputRef.current.click();
    }
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
    return (
      <button
        type="button"
        disabled={busy}
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
          "relative flex w-full flex-col items-center justify-center rounded-md border border-dashed border-[#c5d0e0] bg-[#fafbfc] px-3 text-center transition hover:border-[#1a56db]/40 hover:bg-[#f4f7ff] disabled:opacity-50",
          tall ? "min-h-[11.5rem]" : "min-h-[5.5rem]",
        ].join(" ")}
      >
        {slot ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slot.previewUrl}
              alt=""
              className="h-full max-h-28 w-full object-contain"
            />
            {onClear ? (
              <span
                role="button"
                tabIndex={0}
                className="absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-[#c81e1e] text-[0.65rem] font-bold text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
              >
                ×
              </span>
            ) : null}
          </>
        ) : (
          <>
            <svg
              width="20"
              height="20"
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
          </>
        )}
      </button>
    );
  }

  if (variant === "item") {
    const extras = slots.slice(2);
    return (
      <div className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-2 rounded-md border border-[#e8edf4] bg-[#fafbfc] p-2 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col gap-2">
          <Zone
            title="Upload Front Image"
            subtitle="Cover"
            slot={slots[0]}
            onPick={() => openPicker(0, false)}
            onClear={slots[0] ? () => removeAt(0) : undefined}
          />
          <Zone
            title="Upload Rear Image"
            subtitle="Optional"
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
          <div className="col-span-2 flex flex-wrap gap-2">
            {extras.map((slot, i) => (
              <div key={slot.id} className="relative h-14 w-14">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slot.previewUrl}
                  alt=""
                  className="h-14 w-14 rounded-md border border-[#d9e0ea] object-cover"
                />
                <button
                  type="button"
                  className="absolute -top-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-[#c81e1e] text-[0.65rem] font-bold text-white"
                  onClick={() => removeAt(i + 2)}
                >
                  ×
                </button>
              </div>
            ))}
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
