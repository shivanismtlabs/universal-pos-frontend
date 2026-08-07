/**
 * Role access matrix — keep aligned with backend `common/roles.ts`.
 *
 * admin    = shop owner (full)
 * manager  = day ops + finance + staff (not SaaS plan)
 * cashier  = counter POS + customers + returns
 * fitter   = fittings + customers + order view
 * inventory = stock / retail / suppliers / returns
 */

export type RoleCode =
  | "admin"
  | "manager"
  | "cashier"
  | "fitter"
  | "inventory";

export const ALL_ROLES: RoleCode[] = [
  "admin",
  "manager",
  "cashier",
  "fitter",
  "inventory",
];

/** Route prefixes → roles that may open them (keep aligned with backend RoleGroup) */
export const ROUTE_ROLES: Record<string, RoleCode[]> = {
  "/dashboard": ALL_ROLES,
  "/pos": ["admin", "manager", "cashier"],
  "/returns": ["admin", "manager", "cashier", "inventory"],
  "/orders": ["admin", "manager", "cashier", "fitter", "inventory"],
  "/appointments": ["admin", "manager", "cashier", "fitter"],
  "/customers": ["admin", "manager", "cashier", "fitter"],
  "/parties": ["admin", "manager", "cashier", "fitter"],
  /** Matches backend RoleGroup.notify */
  "/notify": ["admin", "manager", "cashier", "fitter"],
  "/reports": ["admin", "manager"],
  "/staff": ["admin", "manager"],
  "/inventory": ["admin", "manager", "inventory"],
  "/retail": ["admin", "manager", "inventory"],
  "/catalog": ["admin", "manager", "inventory", "cashier"],
  "/products": ["admin", "manager", "inventory", "cashier"],
  "/transfers": ["admin", "manager", "inventory"],
  "/settings": ["admin", "manager"],
  "/suppliers": ["admin", "manager", "inventory"],
  "/plan": ["admin"],
};

export function hasAnyRole(
  userRoles: string[] | undefined | null,
  allowed: string[],
) {
  if (!userRoles?.length) return false;
  return allowed.some((r) => userRoles.includes(r));
}

export function canAccessPath(
  pathname: string,
  userRoles: string[] | undefined | null,
) {
  const entry = Object.entries(ROUTE_ROLES).find(
    ([prefix]) =>
      pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!entry) return true;
  return hasAnyRole(userRoles, entry[1]);
}

export function defaultHomeForRoles(userRoles: string[] | undefined | null) {
  if (hasAnyRole(userRoles, ["admin", "manager", "cashier"])) return "/dashboard";
  if (hasAnyRole(userRoles, ["fitter"])) return "/appointments";
  // /inventory redirects away — send stock staff to the live products page
  if (hasAnyRole(userRoles, ["inventory"])) return "/catalog";
  return "/dashboard";
}

export function canRefund(userRoles: string[] | undefined | null) {
  return hasAnyRole(userRoles, ["admin", "manager"]);
}

export function canManageStaff(userRoles: string[] | undefined | null) {
  return hasAnyRole(userRoles, ["admin", "manager"]);
}

export function canWriteCatalog(userRoles: string[] | undefined | null) {
  return hasAnyRole(userRoles, ["admin", "manager", "inventory"]);
}

export function canFinance(userRoles: string[] | undefined | null) {
  return hasAnyRole(userRoles, ["admin", "manager"]);
}
