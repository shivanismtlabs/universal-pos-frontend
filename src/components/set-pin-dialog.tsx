"use client";

import { useState } from "react";
import { toast } from "sonner";
import { authApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { PinPad } from "@/components/pin-pad";
import { Button } from "@/components/ui/button";

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

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0b1f33]/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-[#d9e0ea] bg-white p-5 shadow-xl">
        <h2 className="text-lg font-bold text-[#0b1f33]">{title}</h2>
        <p className="mt-1 text-sm text-[#5a6b7d]">
          {step === "enter"
            ? "Choose a 4–6 digit PIN (not 1234 or repeating digits)."
            : "Enter the same PIN again to confirm."}
        </p>
        <div className="mt-4 flex justify-center">
          <PinPad error={error} onSubmit={save} onCancel={onClose} />
        </div>
        <Button
          type="button"
          variant="secondary"
          className="mt-3 w-full"
          onClick={() => {
            setStep("enter");
            setFirst("");
            setError(null);
            onClose();
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
