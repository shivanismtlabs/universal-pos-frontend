"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn, mediaUrl } from "@/lib/utils";

type Props = {
  images: string[];
  startIndex?: number;
  label?: string;
  open: boolean;
  onClose: () => void;
};

/** Full-screen product image viewer with prev/next. */
export function ImageLightbox({
  images,
  startIndex = 0,
  label,
  open,
  onClose,
}: Props) {
  const urls = images.map((u) => mediaUrl(u)).filter(Boolean) as string[];
  const [index, setIndex] = useState(startIndex);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) setIndex(Math.min(Math.max(0, startIndex), Math.max(0, urls.length - 1)));
  }, [open, startIndex, urls.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") {
        setIndex((i) => (urls.length ? (i - 1 + urls.length) % urls.length : 0));
      }
      if (e.key === "ArrowRight") {
        setIndex((i) => (urls.length ? (i + 1) % urls.length : 0));
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, urls.length]);

  if (!mounted || !open || !urls.length) return null;

  const src = urls[index]!;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0b1f33]/88 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={label ? `${label} images` : "Product images"}
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
        onClick={onClose}
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      {urls.length > 1 ? (
        <>
          <button
            type="button"
            className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25 sm:left-6"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i - 1 + urls.length) % urls.length);
            }}
            aria-label="Previous image"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25 sm:right-6"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i + 1) % urls.length);
            }}
            aria-label="Next image"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      ) : null}

      <div
        className="flex max-h-[min(88vh,900px)] max-w-[min(96vw,920px)] flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={label ?? "Product"}
          className="max-h-[min(78vh,820px)] max-w-full rounded-xl object-contain shadow-2xl"
        />
        <div className="flex flex-col items-center gap-2">
          {label ? (
            <p className="text-sm font-semibold text-white">{label}</p>
          ) : null}
          {urls.length > 1 ? (
            <p className="text-xs text-white/70">
              {index + 1} / {urls.length}
            </p>
          ) : null}
          {urls.length > 1 ? (
            <div className="flex max-w-full gap-1.5 overflow-x-auto px-2 pb-1">
              {urls.map((u, i) => (
                <button
                  key={`${u}-${i}`}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={cn(
                    "h-12 w-12 shrink-0 overflow-hidden rounded-lg ring-2 transition",
                    i === index ? "ring-white" : "ring-white/30 opacity-80 hover:opacity-100",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
