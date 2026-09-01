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
  | "accountant"
  | "staff"
  | "captain"
  | "kitchen";

export const ALL_ROLES: RoleCode[] = [
  "admin",
  "manager",
  "cashier",
  "fitter",
  "inventory",
  "accountant",
  "staff",
  "captain",
  "kitchen",
];

/** Route prefixes → roles that may open them */
export const ROUTE_ROLES: Record<string, RoleCode[]> = {
  "/dashboard": ALL_ROLES,
  "/counter": ["admin", "manager", "cashier", "captain"],
  "/pos": ["admin", "manager", "cashier", "captain"],
  "/returns": ["admin", "manager", "cashier", "inventory", "accountant"],
  "/orders": ["admin", "manager", "cashier", "fitter", "inventory", "accountant"],
  "/appointments": ["admin", "manager", "cashier", "fitter"],
  "/customers": ["admin", "manager", "cashier", "fitter"],
  "/customers/[id]": ["admin", "manager", "cashier", "fitter"],
  "/parties": ["admin", "manager", "cashier", "fitter"],
  "/group": ["admin", "manager", "accountant"],
  "/notify": ["admin", "manager", "cashier", "fitter"],
  "/notifications": ALL_ROLES,
  "/reports": ["admin", "manager", "accountant"],
  "/reports/daily": ["admin", "manager", "accountant"],
  "/reports/monthly": ["admin", "manager", "accountant"],
  "/reports/pnl": ["admin", "manager", "accountant"],
  "/reports/top-products": ["admin", "manager", "accountant"],
  "/reports/slow-moving": ["admin", "manager", "accountant"],
  "/reports/customers": ["admin", "manager", "accountant"],
  "/reports/employees": ["admin", "manager", "accountant"],
  "/reports/finance": ["admin", "manager", "accountant"],
  "/reports/inventory": ["admin", "manager", "accountant"],
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
  "/stores": ["admin", "manager", "inventory", "accountant", "cashier"],
  "/multi-store": ["admin", "manager", "inventory", "accountant"],
  "/multi-store/dashboard": ["admin", "manager", "inventory", "accountant"],
  "/settings": ["admin", "manager"],
  "/settings/locations": [
    "admin",
    "manager",
    "inventory",
    "accountant",
    "cashier",
  ],
  "/settings/offline": ["admin", "manager", "cashier", "inventory"],
  "/settings/security": ["admin", "manager", "cashier"],
  "/settings/accounting": ["admin", "manager", "accountant"],
  "/accounting": ["admin", "manager", "accountant"],
  "/accounting/accounts": ["admin", "manager", "accountant"],
  "/accounting/journals": ["admin", "manager", "accountant"],
  "/accounting/ledger": ["admin", "manager", "accountant"],
  "/accounting/trial-balance": ["admin", "manager", "accountant"],
  "/accounting/profit-loss": ["admin", "manager", "accountant"],
  "/accounting/balance-sheet": ["admin", "manager", "accountant"],
  "/accounting/gst": ["admin", "manager", "accountant"],
  "/accounting/periods": ["admin", "manager", "accountant"],
  "/accounting/mappings": ["admin", "manager", "accountant"],
  "/accounting/integrations": ["admin", "manager", "accountant"],
  "/suppliers": ["admin", "manager", "inventory"],
  "/expenses": ["admin", "manager", "accountant", "cashier"],
  "/loyalty": ["admin", "manager"],
  "/plan": ["admin"],
  "/restaurant": ["admin", "manager", "cashier", "captain"],
  "/restaurant/tables": ["admin", "manager", "cashier", "captain"],
  "/restaurant/menu": ["admin", "manager", "cashier", "captain"],
  "/restaurant/setup": ["admin", "manager"],
  "/restaurant/recipes": ["admin", "manager", "inventory", "captain", "kitchen"],
  "/restaurant/wastage": ["admin", "manager", "inventory"],
  "/restaurant/food-cost": ["admin", "manager", "accountant"],
  "/restaurant/reservations": ["admin", "manager", "cashier", "captain"],
  "/restaurant/tokens": ["admin", "manager", "cashier", "captain", "kitchen"],
  "/kitchen": ["admin", "manager", "cashier", "captain", "kitchen"],
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
  "/restaurant": ["dining.floor"],
  "/restaurant/tables": ["dining.floor"],
  "/restaurant/menu": ["dining.floor", "catalog.read"],
  "/restaurant/recipes": ["catalog.read", "catalog.write", "kitchen.view"],
  "/restaurant/wastage": ["inventory.write", "inventory.adjust"],
  "/restaurant/food-cost": ["catalog.cost.read", "reports.profit.read"],
  "/restaurant/reservations": ["dining.floor"],
  "/restaurant/tokens": ["dining.floor", "kitchen.view"],
  "/kitchen": ["kitchen.view"],
  "/catalog": ["catalog.read", "catalog.write"],
  "/inventory": ["inventory.read", "inventory.write"],
  "/suppliers": ["suppliers.manage"],
  "/settings": ["settings.manage"],
  "/settings/locations": ["settings.manage"],
  "/accounting": [
    "accounting.view",
    "accounting.create",
    "accounting.edit",
    "accounting.post",
  ],
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
  const entry = Object.entries(ROUTE_ROLES)
    .filter(
      ([prefix]) =>
        pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
    .sort((a, b) => b[0].length - a[0].length)[0];
  if (!entry) return true;
  const [prefix, roles] = entry;
  if (hasAnyRole(userRoles, roles)) return true;
  const perms = ROUTE_PERMISSIONS[prefix];
  if (perms?.length && hasAnyPermission(userPerms, perms)) return true;
  // Custom roles aren't in ALL_ROLES — dashboard is a safe home if they hold any permission
  if (
    prefix === "/dashboard" &&
    ((userPerms?.length ?? 0) > 0 || (userRoles?.length ?? 0) > 0)
  ) {
    return true;
  }
  return false;
}

export function defaultHomeForRoles(
  userRoles: string[] | undefined | null,
  userPerms?: string[] | undefined | null,
) {
  if (hasAnyRole(userRoles, ["admin", "manager", "cashier"])) return "/dashboard";
  if (hasAnyRole(userRoles, ["captain"])) return "/restaurant/tables";
  if (hasAnyRole(userRoles, ["kitchen"])) return "/kitchen";
  if (hasAnyRole(userRoles, ["accountant"])) return "/accounting";
  if (hasAnyRole(userRoles, ["fitter"])) return "/appointments";
  if (hasAnyRole(userRoles, ["staff"])) return "/attendance";
  if (hasAnyRole(userRoles, ["inventory"])) return "/inventory";
  if (hasAnyPermission(userPerms, ["attendance.self", "attendance.manage"])) {
    return "/attendance";
  }
  if (hasAnyPermission(userPerms, ["pos.checkout"])) return "/counter";
  if (hasAnyPermission(userPerms, ["reports.read"])) return "/reports";
  if (hasAnyPermission(userPerms, ["inventory.read", "inventory.write"])) {
    return "/inventory";
  }
  return "/dashboard";
}

export function canRefund(userRoles: string[] | undefined | null) {
  return hasAnyRole(userRoles, [
    "admin",
    "manager",
    "cashier",
    "inventory",
    "accountant",
  ]);
}

export function canApproveRefund(userRoles: string[] | undefined | null) {
  return hasAnyRole(userRoles, ["admin", "manager", "accountant"]);
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

/** Bank / AP fields on suppliers — same gate as finance reports. */
export function canViewFinance(userRoles: string[] | undefined | null) {
  return canFinance(userRoles);
}
