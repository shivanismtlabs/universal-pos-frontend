"use client";

import { RequireAuth } from "@/components/require-auth";
import { AppShell } from "@/components/app-shell";
import { BootstrapProvider } from "@/lib/bootstrap";
import { CommerceModeGate } from "@/components/commerce-mode-gate";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth>
      <BootstrapProvider>
        <CommerceModeGate>
          <AppShell>{children}</AppShell>
        </CommerceModeGate>
      </BootstrapProvider>
    </RequireAuth>
  );
}
