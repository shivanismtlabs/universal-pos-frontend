"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  GETTING_STARTED_PATH,
  readReturnToParam,
  resolveSetupReturnTo,
} from "@/lib/setup-return";

/**
 * Setup-flow redirect helper.
 * Only redirects after Save when `returnTo` is present (Home checklist links).
 * Sidebar / direct navigation has no returnTo → default page behavior.
 */
export function useSetupReturn() {
  const router = useRouter();
  const search = useSearchParams();
  const returnTo = readReturnToParam(search);

  const redirectAfterSetupSave = useCallback(
    (fallbackHref?: string) => {
      if (returnTo) {
        router.push(resolveSetupReturnTo(returnTo, GETTING_STARTED_PATH));
        return true;
      }
      if (fallbackHref) {
        router.push(fallbackHref);
        return true;
      }
      return false;
    },
    [returnTo, router],
  );

  return {
    /** True only when opened from Getting Started (or another setup returnTo). */
    fromSetupFlow: Boolean(returnTo),
    returnTo,
    redirectAfterSetupSave,
  };
}
