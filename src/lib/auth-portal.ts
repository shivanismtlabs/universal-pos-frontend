/** Apply portal (identity) or tenant session from auth API responses. */
import type { PortalSessionResponse } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

export function applyPortalResponse(data: PortalSessionResponse): "orgs" | "app" {
  if (
    data.requiresOrganizationSelection ||
    data.stage === "select_org" ||
    (data.identityToken && !data.accessToken)
  ) {
    if (data.identityToken && data.identity) {
      useAuthStore.getState().setIdentitySession({
        identityToken: data.identityToken,
        identityRefreshToken: data.identityRefreshToken,
        identity: data.identity,
      });
    }
    return "orgs";
  }

  if (data.accessToken && data.refreshToken && data.user) {
    useAuthStore.getState().setSession({
      accessToken: data.accessToken,
      stationToken: data.stationToken ?? data.accessToken,
      refreshToken: data.refreshToken,
      user: {
        id: data.user.id,
        email: data.user.email,
        fullName: data.user.fullName,
        roles: data.user.roles ?? ["admin"],
        permissions: data.user.permissions,
        storeId: data.user.storeId,
        tenantId: data.user.tenantId,
        pinSet: data.user.pinSet,
      },
      tenantSlug: data.tenant?.slug ?? "",
    });
    return "app";
  }

  // Fallback if identity tokens only
  if (data.identityToken && data.identity) {
    useAuthStore.getState().setIdentitySession({
      identityToken: data.identityToken,
      identityRefreshToken: data.identityRefreshToken,
      identity: data.identity,
    });
    return "orgs";
  }

  throw new Error("Unexpected auth response");
}
