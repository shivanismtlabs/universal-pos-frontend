"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SettingsWorkspace } from "./settings-workspace";

/** Old Settings tab strip used `?tab=` — send those URLs to real pages. */
const TAB_REDIRECT: Record<string, string> = {
  tax: "/settings/tax",
  receipt: "/settings/receipt",
  counter: "/settings/counter",
  returns: "/settings/returns",
  expenses: "/settings/expenses",
  notifications: "/settings/notifications",
};

function LegacyTabRedirect() {
  const router = useRouter();
  const search = useSearchParams();
  const tab = search.get("tab");
  const dest = tab ? TAB_REDIRECT[tab] : null;

  useEffect(() => {
    if (dest) router.replace(dest);
  }, [dest, router]);

  if (dest) {
    return (
      <p className="py-10 text-center text-sm text-[#6b7280]">Opening…</p>
    );
  }

  return <SettingsWorkspace section="branding" />;
}

export default function SettingsProfilePage() {
  return (
    <Suspense
      fallback={
        <p className="py-10 text-center text-sm text-[#6b7280]">Loading…</p>
      }
    >
      <LegacyTabRedirect />
    </Suspense>
  );
}
