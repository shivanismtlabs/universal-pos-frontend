"use client";

import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, X } from "lucide-react";
import { authApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { PinPad } from "@/components/pin-pad";

type SetPinDialogProps = {
  open: boolean;
  title?: string;
  /** When set, manager sets another user's PIN */
  userId?: string;
  onClose: () => void;
  onSaved?: () => void;
};

export function SetPinDialog({
  open,
  title = "Set PIN",
  userId,
  onClose,
  onSaved,
}: SetPinDialogProps) {
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [first, setFirst] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function save(pin: string) {
    if (step === "enter") {
      setFirst(pin);
      setStep("confirm");
      setError(null);
      return;
    }
    if (pin !== first) {
      setError("PINs do not match — try again");
      setStep("enter");
      setFirst("");
      return;
    }
    try {
      if (userId) {
        await authApi.setUserPin(userId, pin);
      } else {
        await authApi.setOwnPin(pin);
      }
      toast.success("PIN saved");
      setStep("enter");
      setFirst("");
      setError(null);
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.messages.join(", ") : "Could not save PIN");
      setStep("enter");
      setFirst("");
    }
  }

  function closeAll() {
    setStep("enter");
    setFirst("");
    setError(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 backdrop-blur-[2px]">
      <button
        type="button"
        className="absolute inset-0 bg-[#0b1f33]/65"
        aria-label="Close"
        onClick={closeAll}
      />
      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-[#d9e0ea] bg-white shadow-[0_24px_64px_rgba(11,31,51,0.28)]">
        <div className="border-b border-[#e8eef5] bg-[#f8fafc] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1a56db] text-white">
                <KeyRound className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-[#0b1f33]">{title}</h2>
                <p className="text-xs text-[#5a6b7d]">
                  {step === "enter"
                    ? "Choose a 4–6 digit PIN (not 1234 or repeating digits)."
                    : "Enter the same PIN again to confirm."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeAll}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#5a6b7d] transition hover:bg-[#eef3fb] hover:text-[#0b1f33]"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex gap-1.5">
            <span className="h-1 flex-1 rounded-full bg-[#1a56db]" />
            <span
              className={`h-1 flex-1 rounded-full ${
                step === "confirm" ? "bg-[#1a56db]" : "bg-[#d9e0ea]"
              }`}
            />
          </div>
          <p className="mt-1.5 text-[0.65rem] font-medium uppercase tracking-wide text-[#5a6b7d]">
            Step {step === "enter" ? "1" : "2"} of 2 ·{" "}
            {step === "enter" ? "Create PIN" : "Confirm PIN"}
          </p>
        </div>

        <div className="flex justify-center px-5 py-5">
          <PinPad
            error={error}
            onSubmit={save}
            submitLabel={step === "enter" ? "Continue" : "Save PIN"}
          />
        </div>
      </div>
    </div>
  );
}
