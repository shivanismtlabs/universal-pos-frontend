"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { aiApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
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

/** Load Pollinations image in the browser (fetch, then img+canvas if CORS is picky). */
async function loadPollinationsImageAsDataUrl(url: string): Promise<string> {
  try {
    const imgRes = await fetch(url, {
      method: "GET",
      mode: "cors",
      cache: "no-store",
    });
    if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
    const blob = await imgRes.blob();
    if (blob.size < 500) throw new Error("empty image");
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(blob);
    });
  } catch {
    // Canvas path
    return await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const timer = window.setTimeout(
        () => reject(new Error("AI image timed out")),
        60_000,
      );
      img.onload = () => {
        window.clearTimeout(timer);
        try {
          const canvas = document.createElement("canvas");
          const max = 1024;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("canvas unavailable"));
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        } catch (e) {
          reject(e instanceof Error ? e : new Error("canvas failed"));
        }
      };
      img.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("image load failed"));
      };
      img.src = url;
    });
  }
}

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
    /** When set, shows “Generate with AI” from product name (Pollinations). */
    productName?: string;
    /** Optional extra prompt detail (e.g. short description). */
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

  async function generateWithAi() {
    const name = productName?.trim() ?? "";
    if (name.length < 2) {
      toast.error("Enter the product name first, then generate an image");
      return;
    }
    if (slotsRef.current.length >= max) {
      toast.error(`Maximum ${max} images`);
      return;
    }
    setAiBusy(true);
    try {
      let dataUrl: string | null = null;
      try {
        const res = await aiApi.generateProductImage({
          name,
          hint: productHint?.trim() || undefined,
        });
        dataUrl = res.imageBase64;
      } catch (serverErr) {
        // Server TLS/network fail — load Pollinations from the browser
        toast.message("Server AI busy — trying from your browser…");
        let url: string;
        try {
          const fb = await aiApi.productImageFallbackUrl({
            name,
            hint: productHint?.trim() || undefined,
          });
          url = fb.url;
        } catch {
          // Build URL locally if fallback endpoint missing / old API
          const prompt = [
            `Photorealistic food and product photograph of ${name.slice(0, 100)}`,
            "authentic Indian restaurant style plating if it is a dish",
            productHint?.trim()?.slice(0, 120) || null,
            "real edible food on a clean white or marble surface",
            "natural colors appetizing professional food photography",
            "no text no watermark no illustration no cartoon no surreal art",
          ]
            .filter(Boolean)
            .join(", ");
          const qs = new URLSearchParams({
            width: "1024",
            height: "1024",
            model: "flux",
            nologo: "true",
            enhance: "true",
            seed: String(Math.floor(Math.random() * 1_000_000_000)),
          });
          url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${qs}`;
        }
        try {
          dataUrl = await loadPollinationsImageAsDataUrl(url);
        } catch {
          throw serverErr instanceof ApiError
            ? serverErr
            : new Error(
                "Could not generate image. Try again or upload a photo.",
              );
        }
      }

      if (!dataUrl) throw new Error("No image returned");
      const prepared = await prepareProductImageFromDataUrl(dataUrl);
      pushPrepared(prepared, slotsRef.current.length === 0 ? 0 : "append");
      toast.success("AI image ready — save the item to keep it");
    } catch (e) {
      toast.error(
        e instanceof ApiError
          ? e.messages.join(", ")
          : e instanceof Error
            ? e.message
            : "Could not generate image",
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
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || aiBusy}
          onClick={() => void generateWithAi()}
          className="gap-1.5 border-[#c5d0e0] text-[#1a56db] hover:bg-[#eef3fb]"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {aiBusy ? "Generating…" : "Generate image from name"}
        </Button>
        <p className="text-[0.7rem] text-[#8b9bb0]">
          Free AI · real dish name use karo (e.g. Pani Kofta) · 15–40 sec
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
      <div className="space-y-2">
        <Label>{label}</Label>
        <AiGenerateBar />
        <div className="grid grid-cols-2 gap-2">
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
          <div className="flex flex-wrap gap-2">
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
      <div className="mb-2">
        <AiGenerateBar />
      </div>
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
            disabled={busy || aiBusy}
            onClick={() => inputRef.current?.click()}
            className="grid h-14 w-14 place-items-center rounded-lg border border-dashed border-[#cfd8e6] text-xs font-semibold text-[#1a56db] hover:bg-[#e8eefb] disabled:opacity-50"
          >
            {busy || aiBusy ? "…" : "+"}
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
        <p className="mt-1 text-[0.7rem] text-[#5a6b7d]">
          {aiBusy ? "Generating AI image…" : "Preparing photo…"}
        </p>
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
