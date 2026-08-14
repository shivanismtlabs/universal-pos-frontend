"use client";

import { useState } from "react";
import { authApi, type PortalSessionResponse } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function is2faChallenge(
  data: PortalSessionResponse,
): data is PortalSessionResponse & { requires2fa: true; totpToken: string } {
  return Boolean(data.requires2fa && data.totpToken);
}

export function TotpChallengeForm({
  totpToken,
  onVerified,
  onCancel,
}: {
  totpToken: string;
  onVerified: (data: PortalSessionResponse) => Promise<void> | void;
  onCancel?: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = code.replace(/\s/g, "");
    if (trimmed.length < 6) {
      toast.error("Enter the 6-digit authenticator code");
      return;
    }
    setBusy(true);
    try {
      const data = await authApi.login2fa({ totpToken, code: trimmed });
      await onVerified(data);
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Invalid code",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#5a6b7d]">
        Enter the 6-digit code from your authenticator app (or a backup code).
      </p>
      <div>
        <Label htmlFor="totp">Authentication code</Label>
        <Input
          id="totp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={16}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          className="mt-1 tracking-[0.2em]"
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" disabled={busy} onClick={() => void submit()}>
          {busy ? "Verifying…" : "Verify"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Back
          </Button>
        ) : null}
      </div>
    </div>
  );
}
