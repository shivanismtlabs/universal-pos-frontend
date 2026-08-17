import type { PortalSessionResponse } from "@/lib/api";
import { authApi } from "@/lib/api";
import { applyPortalResponse } from "@/lib/auth-portal";
import { is2faChallenge } from "@/components/totp-challenge-form";

/**
 * After signup/login: one shop → enter it; none → bootstrap; many → org picker.
 */
export async function continueAfterPortalAuth(
  data: PortalSessionResponse,
  on2fa?: (totpToken: string) => void,
): Promise<"app" | "orgs" | "2fa"> {
  const dest = applyPortalResponse(data);
  if (dest === "app") return "app";

  const orgs = data.organizations ?? [];
  if (orgs.length === 1) {
    const entered = await authApi.selectOrganization(orgs[0].tenantId);
    if (is2faChallenge(entered)) {
      on2fa?.(entered.totpToken);
      return "2fa";
    }
    applyPortalResponse(entered);
    return "app";
  }

  if (orgs.length === 0) {
    const raw = data.identity?.fullName?.trim() || "My organization";
    const organizationName = raw.length >= 2 ? raw.slice(0, 100) : "My organization";
    const created = await authApi.createOrganization({
      organizationName,
      businessType: "retail",
      currencyCode: "INR",
      locale: "en-IN",
      storeName: "Main Store",
    });
    if (is2faChallenge(created)) {
      on2fa?.(created.totpToken);
      return "2fa";
    }
    applyPortalResponse(created);
    return "app";
  }

  return "orgs";
}
