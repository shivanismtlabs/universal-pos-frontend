"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type PinPadProps = {
  maxLength?: number;
  disabled?: boolean;
  error?: string | null;
  /** Show remaining attempts only when low (≤2) */
  remainingAttempts?: number | null;
  onSubmit: (pin: string) => void | Promise<void>;
  onCancel?: () => void;
  className?: string;
};

export function PinPad({
  maxLength = 6,
  disabled,
  error,
  remainingAttempts,
  onSubmit,
  onCancel,
  className,
}: PinPadProps) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!error) return;
    setShake(true);
    setPin("");
    const t = window.setTimeout(() => setShake(false), 450);
    return () => window.clearTimeout(t);
  }, [error]);

  async function commit(next: string) {
    if (next.length < 4 || busy || disabled) return;
    setBusy(true);
    try {
      await onSubmit(next);
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  function press(digit: string) {
    if (busy || disabled) return;
    setPin((prev) => {
      if (prev.length >= maxLength) return prev;
      const next = prev + digit;
      if (next.length >= 4 && next.length === maxLength) {
        void commit(next);
      }
      return next;
    });
  }

  function backspace() {
    if (busy || disabled) return;
    setPin((p) => p.slice(0, -1));
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

  return (
    <div className={cn("w-full max-w-[280px]", className)}>
      <motion.div
        animate={shake ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
        className={cn(
          "mb-4 flex h-12 items-center justify-center gap-2 rounded-xl border border-[#cfd8e6] bg-white px-3 shadow-[inset_0_1px_2px_rgba(11,31,51,0.06)]",
          error && "border-[#c81e1e]",
        )}
      >
        {Array.from({ length: Math.max(pin.length, 4) }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              i < pin.length ? "bg-[#0b1f33]" : "bg-[#d9e0ea]",
            )}
          />
        ))}
      </motion.div>

      {error ? (
        <p className="mb-3 text-center text-sm font-medium text-[#c81e1e]">
          {error}
          {remainingAttempts != null && remainingAttempts <= 2 ? (
            <span className="mt-0.5 block text-xs font-normal text-[#5a6b7d]">
              {remainingAttempts} attempt{remainingAttempts === 1 ? "" : "s"} left
            </span>
          ) : null}
        </p>
      ) : (
        <p className="mb-3 text-center text-xs text-[#5a6b7d]">
          Enter 4–6 digit PIN
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        {keys.map((k, idx) => {
          if (k === "") {
            return <div key={`empty-${idx}`} />;
          }
          if (k === "⌫") {
            return (
              <button
                key="back"
                type="button"
                disabled={busy || disabled}
                onClick={backspace}
                className="flex h-14 items-center justify-center rounded-xl border border-[#cfd8e6] bg-white text-[#0b1f33] shadow-sm transition hover:bg-[#e8eefb] disabled:opacity-50"
                aria-label="Backspace"
              >
                <Delete className="h-5 w-5" />
              </button>
            );
          }
          return (
            <button
              key={k}
              type="button"
              disabled={busy || disabled}
              onClick={() => press(k)}
              className="flex h-14 items-center justify-center rounded-xl border border-[#cfd8e6] bg-white text-xl font-semibold text-[#0b1f33] shadow-sm transition hover:bg-[#e8eefb] active:bg-[#d9e0ea] disabled:opacity-50"
            >
              {k}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        {pin.length >= 4 ? (
          <Button
            type="button"
            className="h-11 flex-1"
            disabled={busy || disabled}
            onClick={() => void commit(pin)}
          >
            {busy ? "Checking…" : "Unlock"}
          </Button>
        ) : null}
        {onCancel ? (
          <Button
            type="button"
            variant="secondary"
            className="h-11 flex-1"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
        ) : null}
      </div>

    </div>
  );
}
