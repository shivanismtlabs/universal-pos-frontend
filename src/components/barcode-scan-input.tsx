"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MutableRefObject,
  type Ref,
} from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type BarcodeDetectorLike = {
  detect: (
    source: ImageBitmapSource,
  ) => Promise<Array<{ rawValue?: string; rawValueText?: string }>>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: {
      formats?: string[];
    }) => BarcodeDetectorLike;
  }
}

const SCAN_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "qr_code",
  "itf",
  "codabar",
] as const;

export function supportsCameraBarcode(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.BarcodeDetector === "function" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  onScan: (code: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  /** When true, USB/keyboard wedge scanners auto-submit after a short pause */
  autoSubmitWedge?: boolean;
  /** POS receiving uses Add; catalog forms usually hide it (default true). */
  showSubmitButton?: boolean;
  /** USB scanner hint under the field (default true). */
  showHint?: boolean;
  /** Tight POS toolbar (h-9, no oversized Add). */
  compact?: boolean;
  inputRef?: Ref<HTMLInputElement>;
};

/**
 * Live-retail scan field: hardware barcode wedge + optional camera reader.
 */
export function BarcodeScanInput({
  value,
  onChange,
  onScan,
  label = "Scan barcode",
  placeholder = "Scan or type SKU / barcode",
  disabled,
  className,
  inputClassName,
  autoFocus,
  autoSubmitWedge = true,
  showSubmitButton = true,
  showHint = true,
  compact = false,
  inputRef,
}: Props) {
  const id = useId();
  const innerRef = useRef<HTMLInputElement | null>(null);
  const wedgeTimer = useRef<number | null>(null);
  const lastKeyAt = useRef(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const cameraOk = supportsCameraBarcode();

  const setRefs = useCallback(
    (node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (!inputRef) return;
      if (typeof inputRef === "function") inputRef(node);
      else (inputRef as MutableRefObject<HTMLInputElement | null>).current = node;
    },
    [inputRef],
  );

  const fire = useCallback(
    (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      onScan(code);
    },
    [onScan],
  );

  /** USB wedge: rapid keystrokes then silence → submit */
  function handleChange(next: string) {
    onChange(next);
    if (!autoSubmitWedge) return;
    if (wedgeTimer.current) window.clearTimeout(wedgeTimer.current);
    const now = Date.now();
    const gap = now - lastKeyAt.current;
    lastKeyAt.current = now;
    // Human typing is slow; scanners dump 8–20 chars in <50ms each
    const looksLikeWedge = next.length >= 6 && gap < 80;
    if (!looksLikeWedge) return;
    wedgeTimer.current = window.setTimeout(() => {
      if (innerRef.current?.value.trim() === next.trim() && next.trim().length >= 4) {
        fire(next);
      }
    }, 120);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (wedgeTimer.current) window.clearTimeout(wedgeTimer.current);
      fire(value);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    fire(value);
  }

  useEffect(() => {
    return () => {
      if (wedgeTimer.current) window.clearTimeout(wedgeTimer.current);
    };
  }, []);

  const fieldH = compact ? "h-9" : showSubmitButton ? "h-12" : "h-10";

  return (
    <div className={cn(compact ? "space-y-0" : "space-y-1.5", className)}>
      {label && !compact ? (
        <Label htmlFor={id} className="text-[#5a6b7d]">
          {label}
        </Label>
      ) : null}
      <form onSubmit={handleSubmit} className="flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#8b9bb0]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M2 4h2M2 8h3M2 12h2M7 4h7M10 8h4M7 12h7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <Input
            id={id}
            ref={setRefs}
            value={value}
            disabled={disabled}
            autoFocus={autoFocus}
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            enterKeyHint="done"
            placeholder={placeholder}
            aria-label={label || placeholder}
            className={cn(
              "font-mono",
              fieldH,
              compact ? "pl-9 text-[0.8125rem]" : "pl-10 text-[0.95rem]",
              inputClassName,
            )}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        {showSubmitButton ? (
          <Button
            type="submit"
            className={cn(
              "shrink-0",
              fieldH,
              compact ? "min-w-[3.5rem] px-3" : "min-w-[5.25rem] px-4",
            )}
            disabled={disabled || !value.trim()}
          >
            Add
          </Button>
        ) : null}
        {cameraOk ? (
          <Button
            type="button"
            variant="secondary"
            className={cn("shrink-0 px-3", fieldH)}
            disabled={disabled}
            title="Camera barcode scan"
            onClick={() => setCameraOpen(true)}
          >
            <span className="sr-only">Camera scan</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </Button>
        ) : null}
      </form>
      {showHint ? (
        <p className="text-[0.7rem] text-[#8b9bb0]">
          USB scanner: keep focus here · Enter submits
          {cameraOk ? " · Camera available" : ""}
        </p>
      ) : null}

      {cameraOpen ? (
        <CameraBarcodeModal
          onClose={() => {
            setCameraOpen(false);
            window.setTimeout(() => innerRef.current?.focus(), 50);
          }}
          onDetected={(code) => {
            onChange(code);
            fire(code);
            setCameraOpen(false);
            window.setTimeout(() => innerRef.current?.focus(), 50);
          }}
        />
      ) : null}
    </div>
  );
}

function CameraBarcodeModal({
  onClose,
  onDetected,
}: {
  onClose: () => void;
  onDetected: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState("Point at a barcode…");
  const handled = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let detector: BarcodeDetectorLike | null = null;

    async function start() {
      try {
        if (!window.BarcodeDetector) {
          setError("Camera barcode not supported in this browser");
          return;
        }
        detector = new window.BarcodeDetector({
          formats: [...SCAN_FORMATS],
        });
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setHint("Scanning…");

        const tick = async () => {
          if (cancelled || handled.current || !detector || !video) return;
          if (video.readyState >= 2) {
            try {
              const codes = await detector.detect(video);
              const raw =
                codes[0]?.rawValue ||
                (codes[0] as { rawValueText?: string } | undefined)?.rawValueText;
              if (raw?.trim()) {
                handled.current = true;
                onDetected(raw.trim());
                return;
              }
            } catch {
              /* keep scanning */
            }
          }
          raf = window.requestAnimationFrame(() => {
            void tick();
          });
        };
        raf = window.requestAnimationFrame(() => {
          void tick();
        });
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Could not open camera — allow permission and retry",
        );
      }
    }

    void start();
    return () => {
      cancelled = true;
      if (raf) window.cancelAnimationFrame(raf);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [onDetected]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0b1f33]/70 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Camera barcode scanner"
    >
      <div className="w-full max-w-md overflow-hidden rounded-[14px] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#e8edf4] px-4 py-3">
          <h3 className="text-sm font-semibold text-[#0b1f33]">Scan barcode</h3>
          <button
            type="button"
            className="text-sm font-medium text-[#1a56db]"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="relative aspect-[4/3] bg-black">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-28 w-[80%] rounded-md border-2 border-[#1a56db] shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
          </div>
        </div>
        <div className="space-y-1 px-4 py-3">
          <p className="text-sm text-[#5a6b7d]">
            {error ?? hint}
          </p>
          <p className="text-[0.7rem] text-[#8b9bb0]">
            Works best on Chrome/Edge (desktop or Android). iOS Safari may need OS barcode features.
          </p>
        </div>
      </div>
    </div>
  );
}
