"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, ShieldCheck, X } from "lucide-react";
import { authApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { useBootstrap } from "@/lib/bootstrap";
import { PinPad } from "@/components/pin-pad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type StationPinLockProps = {
  open: boolean;
  locationId?: string | null;
  /** When true, overlay can be dismissed without unlocking (manual switch cancel) */
  dismissible?: boolean;
  onDismiss?: () => void;
  onUnlocked?: () => void;
};

export function StationPinLock({
  open,
  locationId: locationIdProp,
  dismissible,
  onDismiss,
  onUnlocked,
}: StationPinLockProps) {
  const { data: boot } = useBootstrap();
  const setActingSession = useAuthStore((s) => s.setActingSession);
  const clear = useAuthStore((s) => s.clear);
  const stationUser = useAuthStore((s) => s.stationUser);
  const lastPinUserId = useAuthStore((s) => s.lastPinUserId);
  const stationToken = useAuthStore((s) => s.stationToken);

  const locationId =
    locationIdProp ||
    boot?.locations?.find((l) => l.isActive !== false)?.id ||
    boot?.locations?.[0]?.id ||
    null;

  const pinEnabled =
    (boot?.tenant?.settings as { pos?: { pinSwitchEnabled?: boolean } } | null)
      ?.pos?.pinSwitchEnabled !== false;

  const staffQ = useQuery({
    queryKey: ["pin-staff", locationId],
    queryFn: () => authApi.listPinStaff(locationId!),
    enabled: open && Boolean(locationId) && Boolean(stationToken) && pinEnabled,
  });

  const staff = useMemo(
    () => (staffQ.data ?? []).filter((s) => s.pinSet),
    [staffQ.data],
  );

  const preferredId =
    lastPinUserId && staff.some((s) => s.id === lastPinUserId)
      ? lastPinUserId
      : staff[0]?.id ?? null;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fails, setFails] = useState(0);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const [newPin, setNewPin] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedId(preferredId);
      setError(null);
      setFails(0);
      setForgotOpen(false);
      setOtpSent(false);
      setOtp("");
      setNewPin("");
      setDevCode(null);
      setMaskedEmail(null);
    }
  }, [open, preferredId]);

  const selected = staff.find((s) => s.id === selectedId) ?? null;

  async function onPin(pin: string) {
    if (!locationId || !selectedId) {
      setError("Select a staff member first");
      return;
    }
    try {
      const data = await authApi.pinLogin({
        locationId,
        userId: selectedId,
        pin,
      });
      setActingSession({
        accessToken: data.accessToken,
        user: {
          id: data.user.id,
          email: data.user.email,
          fullName: data.user.fullName,
          roles: data.user.roles ?? [],
          storeId: data.user.storeId,
          tenantId: data.user.tenantId,
          pinSet: true,
        },
      });
      setError(null);
      setFails(0);
      toast.success(`Signed in as ${data.user.fullName}`);
      onUnlocked?.();
    } catch (e) {
      const nextFails = fails + 1;
      setFails(nextFails);
      setError(
        e instanceof ApiError ? e.messages.join(", ") : "Invalid PIN",
      );
    }
  }

  async function sendPinOtp() {
    if (!selectedId) {
      toast.error("Select your name first");
      return;
    }
    setForgotBusy(true);
    try {
      const res = await authApi.forgotPin(selectedId);
      setOtpSent(true);
      setDevCode(res.devCode ?? null);
      setMaskedEmail(res.maskedEmail ?? null);
      toast.success(res.message);
      if (res.devCode) {
        toast.message("Dev OTP", { description: res.devCode });
      }
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Could not send OTP",
      );
    } finally {
      setForgotBusy(false);
    }
  }

  async function resetPinWithOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    const code = otp.trim();
    const pin = newPin.trim();
    if (!/^\d{6}$/.test(code)) {
      toast.error("Enter the 6-digit OTP");
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      toast.error("New PIN must be 4–6 digits");
      return;
    }
    setForgotBusy(true);
    try {
      const res = await authApi.resetPinOtp({
        userId: selectedId,
        otp: code,
        newPin: pin,
      });
      toast.success(res.message);
      setForgotOpen(false);
      setOtpSent(false);
      setOtp("");
      setNewPin("");
      setError(null);
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.messages.join(", ")
          : "Could not reset PIN",
      );
    } finally {
      setForgotBusy(false);
    }
  }

  if (!open) return null;

  if (!pinEnabled) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0b1f33]/75 p-4 backdrop-blur-[2px]">
        <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-[#d9e0ea] bg-white shadow-[0_24px_64px_rgba(11,31,51,0.28)]">
          <div className="border-b border-[#e8eef5] bg-[#f8fafc] px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8eefb] text-[#1a56db]">
                <Lock className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-[#0b1f33]">
                  PIN switch off
                </h2>
                <p className="text-xs text-[#5a6b7d]">Staff PIN is disabled</p>
              </div>
            </div>
          </div>
          <div className="space-y-4 p-5">
            <p className="text-sm text-[#5a6b7d]">
              This shop has PIN staff-switch disabled. Sign in again with email
              and password.
            </p>
            <Button
              className="w-full"
              onClick={() => {
                clear();
                window.location.href = "/login";
              }}
            >
              Full sign-in
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0b1f33]/75 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[#d9e0ea] bg-white shadow-[0_24px_64px_rgba(11,31,51,0.28)]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#e8eef5] bg-[#f8fafc] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1a56db] text-white shadow-[0_2px_8px_rgba(26,86,219,0.35)]">
              {forgotOpen ? (
                <ShieldCheck className="h-5 w-5" />
              ) : (
                <Lock className="h-5 w-5" />
              )}
            </span>
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-[#5a6b7d]">
                Universal POS · Counter
              </p>
              <h2 className="text-lg font-semibold tracking-tight text-[#0b1f33]">
                {forgotOpen ? "Reset PIN" : "Switch staff"}
              </h2>
              <p className="mt-0.5 text-sm text-[#5a6b7d]">
                {forgotOpen
                  ? "We’ll email a 6-digit OTP to your staff account."
                  : "Select your name, then enter your PIN. Cart stays on screen."}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            {stationUser ? (
              <p className="hidden rounded-lg border border-[#e4e9f0] bg-white px-2.5 py-1.5 text-right text-[0.7rem] text-[#5a6b7d] sm:block">
                Station by
                <span className="mt-0.5 block font-medium text-[#0b1f33]">
                  {stationUser.fullName}
                </span>
              </p>
            ) : null}
            {dismissible ? (
              <button
                type="button"
                onClick={onDismiss}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#e4e9f0] bg-white text-[#5a6b7d] transition hover:bg-[#eef3fb] hover:text-[#0b1f33]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {!locationId ? (
            <p className="text-center text-sm text-[#c81e1e]">
              No store location available for PIN switch.
            </p>
          ) : staffQ.isLoading ? (
            <p className="py-10 text-center text-sm text-[#5a6b7d]">
              Loading staff…
            </p>
          ) : staff.length === 0 ? (
            <div className="space-y-3 py-6 text-center">
              <p className="text-sm text-[#5a6b7d]">
                No staff with a PIN at this location yet. Ask a manager to set
                PINs under Staff.
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  clear();
                  window.location.href = "/login";
                }}
              >
                Full sign-in
              </Button>
            </div>
          ) : forgotOpen ? (
            <form
              onSubmit={resetPinWithOtp}
              className="mx-auto max-w-sm space-y-3"
            >
              <div className="rounded-xl border border-[#e4e9f0] bg-[#f8fafc] px-3.5 py-3">
                <p className="text-xs text-[#5a6b7d]">Resetting PIN for</p>
                <p className="font-semibold text-[#0b1f33]">
                  {selected?.fullName ?? "Select staff"}
                </p>
                {maskedEmail ? (
                  <p className="text-xs text-[#5a6b7d]">Email: {maskedEmail}</p>
                ) : null}
                {devCode ? (
                  <p className="mt-2 rounded-md border border-[#c5d4f5] bg-[#eef3fc] px-2.5 py-2 text-xs text-[#0b1f33]">
                    On-screen OTP (demo mailboxes cannot receive email):{" "}
                    <span className="font-semibold tracking-widest text-[#1a56db]">
                      {devCode}
                    </span>
                  </p>
                ) : null}
              </div>
              {!otpSent ? (
                <Button
                  type="button"
                  className="w-full"
                  disabled={forgotBusy || !selectedId}
                  onClick={() => void sendPinOtp()}
                >
                  {forgotBusy ? "Sending…" : "Send OTP"}
                </Button>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="pin-otp">6-digit OTP</Label>
                    <Input
                      id="pin-otp"
                      inputMode="numeric"
                      maxLength={6}
                      value={otp}
                      onChange={(ev) =>
                        setOtp(ev.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pin-new">New PIN (4–6 digits)</Label>
                    <Input
                      id="pin-new"
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={newPin}
                      onChange={(ev) =>
                        setNewPin(
                          ev.target.value.replace(/\D/g, "").slice(0, 6),
                        )
                      }
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={forgotBusy}>
                    {forgotBusy ? "Saving…" : "Set new PIN"}
                  </Button>
                  <button
                    type="button"
                    className="w-full text-center text-xs font-medium text-[#1a56db] hover:underline"
                    disabled={forgotBusy}
                    onClick={() => void sendPinOtp()}
                  >
                    Resend OTP
                  </button>
                </>
              )}
              <button
                type="button"
                className="w-full text-center text-xs font-medium text-[#5a6b7d] hover:underline"
                onClick={() => {
                  setForgotOpen(false);
                  setOtpSent(false);
                  setOtp("");
                  setNewPin("");
                }}
              >
                Back to PIN unlock
              </button>
            </form>
          ) : (
            <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(260px,300px)] sm:gap-6">
              {/* Staff list */}
              <div>
                <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-[#5a6b7d]">
                  Staff at this counter
                </p>
                <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-0.5 sm:max-h-[320px]">
                  {staff.map((s) => {
                    const initial =
                      s.fullName.trim().charAt(0).toUpperCase() || "?";
                    const active = s.id === selectedId;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(s.id);
                            setError(null);
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                            active
                              ? "border-[#1a56db] bg-[#e8eefb] shadow-[0_0_0_1px_#1a56db]"
                              : "border-[#e4e9f0] bg-white hover:border-[#c5d0e0] hover:bg-[#f8fafc]",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                              active
                                ? "bg-[#1a56db] text-white"
                                : "bg-[#0b1f33] text-white",
                            )}
                          >
                            {initial}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-[#0b1f33]">
                              {s.fullName}
                            </span>
                            <span className="block truncate text-xs text-[#5a6b7d]">
                              {(s.roles ?? []).join(", ") || "staff"}
                            </span>
                          </span>
                          {active ? (
                            <span className="ml-auto shrink-0 text-[0.65rem] font-semibold uppercase tracking-wide text-[#1a56db]">
                              Selected
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* PIN pad panel */}
              <div className="rounded-xl border border-[#e4e9f0] bg-[#f8fafc] p-4 sm:p-5">
                <div className="mb-3 text-center">
                  <p className="text-xs text-[#5a6b7d]">Signing in as</p>
                  <p className="truncate text-sm font-semibold text-[#0b1f33]">
                    {selected?.fullName ?? "Select staff"}
                  </p>
                </div>
                <div className="flex justify-center">
                  <PinPad
                    error={error}
                    remainingAttempts={
                      fails >= 3 ? Math.max(0, 5 - fails) : null
                    }
                    onSubmit={onPin}
                  />
                </div>
                <div className="mt-3 text-center">
                  <button
                    type="button"
                    className="text-xs font-medium text-[#1a56db] hover:underline"
                    onClick={() => {
                      if (!selectedId) {
                        toast.error("Select your name first");
                        return;
                      }
                      setForgotOpen(true);
                    }}
                  >
                    Forgot PIN?
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center border-t border-[#e8eef5] bg-[#f8fafc] px-5 py-3">
          <button
            type="button"
            className="text-xs font-medium text-[#5a6b7d] underline-offset-2 hover:text-[#0b1f33] hover:underline"
            onClick={() => {
              clear();
              window.location.href = "/login";
            }}
          >
            End station · full sign-in
          </button>
        </div>
      </div>
    </div>
  );
}
