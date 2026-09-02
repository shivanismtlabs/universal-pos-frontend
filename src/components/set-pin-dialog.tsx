"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, X } from "lucide-react";
import { authApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { PinPad } from "@/components/pin-pad";

type PinStep = "current" | "enter" | "confirm";

type SetPinDialogProps = {
  open: boolean;
  title?: string;
  /** When set, manager sets another user's PIN */
  userId?: string;
  /** When true, user must enter existing PIN before choosing a new one */
  requireCurrentPin?: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

function stepMeta(step: PinStep, requireCurrentPin: boolean) {
  if (step === "current") {
    return {
      total: 3,
      index: 1,
      label: "Verify current PIN",
      hint: "Enter your current PIN to continue.",
      submit: "Continue",
    };
  }
  if (step === "enter") {
    return {
      total: requireCurrentPin ? 3 : 2,
      index: requireCurrentPin ? 2 : 1,
      label: "Create PIN",
      hint: "Choose a 4 digit PIN (not 1234 or repeating digits).",
      submit: "Continue",
    };
  }
  return {
    total: requireCurrentPin ? 3 : 2,
    index: requireCurrentPin ? 3 : 2,
    label: "Confirm PIN",
    hint: "Enter the same PIN again to confirm.",
    submit: "Save PIN",
  };
}

export function SetPinDialog({
  open,
  title = "Set PIN",
  userId,
  requireCurrentPin = false,
  onClose,
  onSaved,
}: SetPinDialogProps) {
  const [step, setStep] = useState<PinStep>(
    requireCurrentPin ? "current" : "enter",
  );
  const [currentPin, setCurrentPin] = useState("");
  const [first, setFirst] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(requireCurrentPin ? "current" : "enter");
    setCurrentPin("");
    setFirst("");
    setError(null);
  }, [open, requireCurrentPin]);

  if (!open) return null;

  const meta = stepMeta(step, requireCurrentPin);

  async function save(pin: string) {
    if (step === "current") {
      setCurrentPin(pin);
      setStep("enter");
      setError(null);
      return;
    }
    if (step === "enter") {
      setFirst(pin);
      setStep("confirm");
      setError(null);
      return;
    }
    if (pin !== first) {
      setError("PINs do not match — try again");
      setStep(requireCurrentPin ? "current" : "enter");
      setFirst("");
      if (requireCurrentPin) setCurrentPin("");
      return;
    }
    try {
      if (userId) {
        await authApi.setUserPin(userId, pin);
      } else {
        await authApi.setOwnPin(pin, requireCurrentPin ? currentPin : undefined);
        const s = useAuthStore.getState();
        if (s.user) {
          useAuthStore.setState({
            user: { ...s.user, pinSet: true },
            stationUser:
              s.stationUser?.id === s.user.id
                ? { ...s.stationUser, pinSet: true }
                : s.stationUser,
          });
        }
      }
      toast.success("PIN saved");
      setStep(requireCurrentPin ? "current" : "enter");
      setCurrentPin("");
      setFirst("");
      setError(null);
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.messages.join(", ") : "Could not save PIN");
      setStep(requireCurrentPin ? "current" : "enter");
      setCurrentPin("");
      setFirst("");
    }
  }

  function closeAll() {
    setStep(requireCurrentPin ? "current" : "enter");
    setCurrentPin("");
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
                <p className="text-xs text-[#5a6b7d]">{meta.hint}</p>
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
            {Array.from({ length: meta.total }, (_, i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full ${
                  i < meta.index ? "bg-[#1a56db]" : "bg-[#d9e0ea]"
                }`}
              />
            ))}
          </div>
          <p className="mt-1.5 text-[0.65rem] font-medium uppercase tracking-wide text-[#5a6b7d]">
            Step {meta.index} of {meta.total} · {meta.label}
          </p>
        </div>

        <div className="flex justify-center px-5 py-5">
          <PinPad
            error={error}
            onSubmit={save}
            submitLabel={meta.submit}
          />
        </div>
      </div>
    </div>
  );
}
