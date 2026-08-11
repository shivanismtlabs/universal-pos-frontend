/**
 * Role access matrix — keep aligned with backend `common/roles.ts` + `common/rbac.ts`.
 *
 * admin       = shop owner (full)
 * manager     = store manager — day ops + finance + staff (not SaaS plan)
 * cashier     = counter POS + customers + returns
 * fitter      = fittings + customers + order view
 * inventory   = inventory manager — stock / retail / suppliers
 * accountant  = reports, expenses, order read
 */

export type RoleCode =
  | "admin"
  | "manager"
  | "cashier"
  | "fitter"
  | "inventory"
  | "accountant";

export const ALL_ROLES: RoleCode[] = [
  "admin",
  "manager",
  "cashier",
  "fitter",
  "inventory",
  "accountant",
];

/** Route prefixes → roles that may open them */
export const ROUTE_ROLES: Record<string, RoleCode[]> = {
  "/dashboard": ALL_ROLES,
  "/counter": ["admin", "manager", "cashier"],
  "/pos": ["admin", "manager", "cashier"],
  "/returns": ["admin", "manager", "cashier", "inventory"],
  "/orders": ["admin", "manager", "cashier", "fitter", "inventory", "accountant"],
  "/appointments": ["admin", "manager", "cashier", "fitter"],
  "/customers": ["admin", "manager", "cashier", "fitter"],
  "/parties": ["admin", "manager", "cashier", "fitter"],
  "/notify": ["admin", "manager", "cashier", "fitter"],
  "/reports": ["admin", "manager", "accountant"],
  "/staff": ["admin", "manager"],
  "/roles": ["admin", "manager"],
  "/attendance": ALL_ROLES,
  "/shifts": ["admin", "manager"],
  "/inventory": ["admin", "manager", "inventory"],
  "/adjustments": ["admin", "manager", "inventory"],
  "/retail": ["admin", "manager", "inventory"],
  "/catalog": ["admin", "manager", "inventory", "cashier"],
  "/products": ["admin", "manager", "inventory", "cashier"],
  "/transfers": ["admin", "manager", "inventory"],
  "/settings": ["admin", "manager"],
  "/suppliers": ["admin", "manager", "inventory"],
  "/expenses": ["admin", "manager", "accountant"],
  "/loyalty": ["admin", "manager"],
  "/plan": ["admin"],
};

/** Permission codes that also unlock a route (custom roles). */
export const ROUTE_PERMISSIONS: Record<string, string[]> = {
  "/reports": ["reports.read"],
  "/expenses": ["expenses.manage"],
  "/staff": ["users.manage"],
  "/roles": ["roles.manage"],
  "/shifts": ["shifts.manage"],
  "/attendance": ["attendance.self", "attendance.manage"],
  "/counter": ["pos.checkout"],
  "/pos": ["pos.checkout"],
  "/catalog": ["catalog.read", "catalog.write"],
  "/inventory": ["inventory.read", "inventory.write"],
  "/suppliers": ["suppliers.manage"],
  "/settings": ["settings.manage"],
  "/plan": ["plan.manage"],
};

export function hasAnyRole(
  userRoles: string[] | undefined | null,
  allowed: string[],
) {
  if (!userRoles?.length) return false;
  return allowed.some((r) => userRoles.includes(r));
}

export function hasAnyPermission(
  userPerms: string[] | undefined | null,
  needed: string[],
) {
  if (!userPerms?.length || !needed.length) return false;
  if (userPerms.includes("*")) return true;
  return needed.some((p) => userPerms.includes(p));
}

export function canAccessPath(
  pathname: string,
  userRoles: string[] | undefined | null,
  userPerms?: string[] | undefined | null,
) {
  if (userRoles?.includes("admin")) return true;
  const entry = Object.entries(ROUTE_ROLES).find(
    ([prefix]) =>
      pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!entry) return true;
  const [prefix, roles] = entry;
  if (hasAnyRole(userRoles, roles)) return true;
  const perms = ROUTE_PERMISSIONS[prefix];
  return hasAnyPermission(userPerms, perms ?? []);
}

export function defaultHomeForRoles(userRoles: string[] | undefined | null) {
  if (hasAnyRole(userRoles, ["admin", "manager", "cashier"])) return "/dashboard";
  if (hasAnyRole(userRoles, ["accountant"])) return "/reports";
  if (hasAnyRole(userRoles, ["fitter"])) return "/appointments";
  if (hasAnyRole(userRoles, ["inventory"])) return "/inventory";
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
  return hasAnyRole(userRoles, ["admin", "manager", "accountant"]);
}
