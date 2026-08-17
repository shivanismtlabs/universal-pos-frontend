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
  className?: string;
  /** Primary action label when PIN length ≥ 4 */
  submitLabel?: string;
};

export function PinPad({
  maxLength = 6,
  disabled,
  error,
  remainingAttempts,
  onSubmit,
  className,
  submitLabel = "Unlock",
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
  const slots = Math.max(pin.length, 4);

  return (
    <div className={cn("w-full max-w-[300px]", className)}>
      <motion.div
        animate={shake ? { x: [0, -7, 7, -5, 5, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-3 flex items-center justify-center gap-3 py-1"
        aria-live="polite"
      >
        {Array.from({ length: slots }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-3 w-3 rounded-full border-2 transition-colors duration-150",
              i < pin.length
                ? error
                  ? "border-[#c81e1e] bg-[#c81e1e]"
                  : "border-[#1a56db] bg-[#1a56db]"
                : "border-[#c5d0e0] bg-transparent",
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

      <div className="grid grid-cols-3 gap-2.5">
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
                className="flex h-14 items-center justify-center rounded-xl border border-[#d5dde8] bg-[#f8fafc] text-[#0b1f33] transition hover:border-[#c5d0e0] hover:bg-[#eef3fb] active:scale-[0.97] disabled:opacity-50"
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
              className="flex h-14 items-center justify-center rounded-xl border border-[#d5dde8] bg-white text-[1.35rem] font-semibold tabular-nums text-[#0b1f33] shadow-[0_1px_0_rgba(11,31,51,0.04)] transition hover:border-[#1a56db]/35 hover:bg-[#f0f4fc] active:scale-[0.97] active:bg-[#e8eefb] disabled:opacity-50"
            >
              {k}
            </button>
          );
        })}
      </div>

      {pin.length >= 4 ? (
        <Button
          type="button"
          className="mt-3.5 h-11 w-full"
          disabled={busy || disabled}
          onClick={() => void commit(pin)}
        >
          {busy ? "Checking…" : submitLabel}
        </Button>
      ) : null}
    </div>
  );
}
