import type { BootstrapTenant } from "./bootstrap-types";

export function isStoreProfileComplete(
  tenant: BootstrapTenant | null | undefined,
): boolean {
  if (!tenant) return false;
  const settings =
    tenant.settings && typeof tenant.settings === "object"
      ? (tenant.settings as Record<string, unknown>)
      : {};
  if (settings.storeSetupComplete === true) return true;
  const profile =
    settings.organizationProfile &&
    typeof settings.organizationProfile === "object"
      ? (settings.organizationProfile as Record<string, unknown>)
      : null;
  if (!profile) return false;
  return Boolean(
    String(profile.addressLine1 ?? "").trim() &&
      String(profile.city ?? "").trim() &&
      String(profile.state ?? "").trim() &&
      String(profile.postalCode ?? "").trim(),
  );
}
