"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { authApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { useBootstrap } from "@/lib/bootstrap";
import { PinPad } from "@/components/pin-pad";
import { Button } from "@/components/ui/button";
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

  useEffect(() => {
    if (open) {
      setSelectedId(preferredId);
      setError(null);
      setFails(0);
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

  if (!open) return null;

  if (!pinEnabled) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0b1f33]/70 p-4 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
          <h2 className="text-lg font-bold text-[#0b1f33]">PIN switch off</h2>
          <p className="mt-2 text-sm text-[#5a6b7d]">
            This shop has PIN staff-switch disabled. Sign in again with email
            and password.
          </p>
          <Button
            className="mt-4 w-full"
            onClick={() => {
              clear();
              window.location.href = "/login";
            }}
          >
            Full sign-in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0b1f33]/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[#d9e0ea] bg-[#f4f6fa] p-5 shadow-xl sm:p-6">
        <div className="mb-4 text-center">
          <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[#5a6b7d]">
            Counter locked
          </p>
          <h2 className="mt-1 text-xl font-bold text-[#0b1f33]">
            Switch staff
          </h2>
          <p className="mt-1 text-sm text-[#5a6b7d]">
            Pick your name, then enter your PIN. Cart stays on screen.
          </p>
          {stationUser ? (
            <p className="mt-2 text-xs text-[#5a6b7d]">
              Station unlocked by {stationUser.fullName}
            </p>
          ) : null}
        </div>

        {!locationId ? (
          <p className="text-center text-sm text-[#c81e1e]">
            No store location available for PIN switch.
          </p>
        ) : staffQ.isLoading ? (
          <p className="text-center text-sm text-[#5a6b7d]">Loading staff…</p>
        ) : staff.length === 0 ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-[#5a6b7d]">
              No staff with a PIN at this location yet. Ask a manager to set PINs
              under Staff.
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
        ) : (
          <>
            <ul className="mb-4 max-h-40 space-y-1.5 overflow-y-auto">
              {staff.map((s) => {
                const initial = s.fullName.trim().charAt(0).toUpperCase() || "?";
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
                          ? "border-[#1a56db] bg-[#e8eefb]"
                          : "border-[#d9e0ea] bg-white hover:bg-white/80",
                      )}
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0b1f33] text-sm font-bold text-white">
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
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex justify-center">
              <PinPad
                error={error}
                remainingAttempts={
                  fails >= 3 ? Math.max(0, 5 - fails) : null
                }
                onSubmit={onPin}
                onCancel={dismissible ? onDismiss : undefined}
              />
            </div>
          </>
        )}

        <div className="mt-4 flex justify-center">
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
