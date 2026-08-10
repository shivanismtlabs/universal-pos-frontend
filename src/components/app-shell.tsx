"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  Users,
  ClipboardList,
  CreditCard,
  LogOut,
  Menu,
  X,
  UsersRound,
  CalendarDays,
  PackageCheck,
  MessageCircle,
  BarChart3,
  UserCog,
  Truck,
  Box,
  Settings,
  Package,
  ArrowRightLeft,
  Wallet,
  TicketPercent,
  ChevronDown,
  Home,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";
import { authApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { StationPinLock } from "@/components/station-pin-lock";
import { SetPinDialog } from "@/components/set-pin-dialog";
import { toast } from "sonner";
import {
  canAccessPath,
  defaultHomeForRoles,
  ROUTE_ROLES,
} from "@/lib/roles";

type NavLeaf = {
  href: string;
  label: string;
  icon: LucideIcon;
  module?: string;
  commerce?: string;
};

type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Single link when no children */
  href?: string;
  children?: NavLeaf[];
};

/** Zoho-style groups: Home · Inventory · Sales · Purchases · Customers · … */
const NAV_GROUPS: NavGroup[] = [
  {
    id: "home",
    label: "Home",
    icon: Home,
    href: "/dashboard",
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: Package,
    children: [
      {
        href: "/catalog",
        label: "Items",
        icon: Box,
        module: "catalog",
      },
      {
        href: "/catalog?panel=categories",
        label: "Categories",
        icon: Box,
        module: "catalog",
      },
      {
        href: "/adjustments",
        label: "Adjustments",
        icon: PackageCheck,
        module: "inventory",
        commerce: "sale",
      },
      {
        href: "/inventory",
        label: "Stock levels",
        icon: Package,
        module: "inventory",
        commerce: "sale",
      },
      {
        href: "/transfers",
        label: "Stock transfer",
        icon: ArrowRightLeft,
        module: "catalog",
      },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    icon: CreditCard,
    children: [
      {
        href: "/counter",
        label: "Counter (POS)",
        icon: CreditCard,
        module: "pos",
      },
      {
        href: "/orders",
        label: "All orders",
        icon: ClipboardList,
        module: "orders",
      },
      {
        href: "/returns",
        label: "Returns desk",
        icon: PackageCheck,
        module: "orders",
      },
    ],
  },
  {
    id: "purchases",
    label: "Purchases",
    icon: Truck,
    children: [
      {
        href: "/suppliers",
        label: "Suppliers & POs",
        icon: Truck,
        commerce: "sale",
        module: "inventory",
      },
      {
        href: "/expenses",
        label: "Expenses",
        icon: Wallet,
      },
    ],
  },
  {
    id: "customers",
    label: "Customers & Perks",
    icon: Users,
    children: [
      {
        href: "/customers",
        label: "Customers",
        icon: Users,
        module: "orders",
      },
      {
        href: "/loyalty",
        label: "Coupons",
        icon: TicketPercent,
      },
      {
        href: "/parties",
        label: "Customer groups",
        icon: UsersRound,
        module: "rental",
        commerce: "rental",
      },
      {
        href: "/appointments",
        label: "Appointments",
        icon: CalendarDays,
        module: "appointments",
        commerce: "service",
      },
    ],
  },
  {
    id: "people",
    label: "Team",
    icon: UserCog,
    children: [
      {
        href: "/staff",
        label: "Staff accounts",
        icon: UserCog,
        module: "iam",
      },
      {
        href: "/notify",
        label: "WhatsApp",
        icon: MessageCircle,
        module: "notify",
      },
    ],
  },
  {
    id: "docs",
    label: "Reports",
    icon: BarChart3,
    children: [
      {
        href: "/reports",
        label: "Reports & CSV",
        icon: BarChart3,
        module: "reports",
      },
    ],
  },
  {
    id: "setup",
    label: "Settings",
    icon: Settings,
    children: [
      { href: "/settings", label: "Shop settings", icon: Settings },
      { href: "/plan", label: "Software plan", icon: CreditCard },
    ],
  },
];

function flatCatalog(): NavLeaf[] {
  const out: NavLeaf[] = [];
  for (const g of NAV_GROUPS) {
    if (g.href) {
      out.push({ href: g.href, label: g.label, icon: g.icon });
    }
    for (const c of g.children ?? []) out.push(c);
  }
  return out;
}

const NAV_CATALOG = flatCatalog();

function leafAllowed(
  item: NavLeaf,
  roles: string[],
  hasModule: (code: string) => boolean,
  hasMode: (code: string) => boolean,
) {
  if (item.module && !hasModule(item.module)) return false;
  if (item.commerce && !hasMode(item.commerce)) return false;
  const allowed = ROUTE_ROLES[item.href as keyof typeof ROUTE_ROLES];
  if (!allowed) return true;
  return allowed.some((r) => roles.includes(r));
}

function isPathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function ZohoNav({
  onNavigate,
  roles,
  hasModule,
  hasMode,
}: {
  onNavigate?: () => void;
  roles: string[];
  hasModule: (code: string) => boolean;
  hasMode: (code: string) => boolean;
}) {
  const pathname = usePathname();

  const groups = useMemo(() => {
    return NAV_GROUPS.map((g) => {
      const children = (g.children ?? []).filter((c) =>
        leafAllowed(c, roles, hasModule, hasMode),
      );
      if (g.href) {
        const leaf: NavLeaf = { href: g.href, label: g.label, icon: g.icon };
        if (!leafAllowed(leaf, roles, hasModule, hasMode)) return null;
        return { ...g, children: [] as NavLeaf[] };
      }
      if (!children.length) return null;
      return { ...g, children };
    }).filter(Boolean) as Array<NavGroup & { children: NavLeaf[] }>;
  }, [roles, hasModule, hasMode]);

  const defaultOpen = useMemo(() => {
    const open = new Set<string>();
    for (const g of groups) {
      if (g.href && isPathActive(pathname, g.href)) continue;
      if (g.children.some((c) => isPathActive(pathname, c.href))) {
        open.add(g.id);
      }
    }
    // Expand first useful groups for new shops
    if (open.size === 0) {
      open.add("inventory");
      open.add("sales");
    }
    return open;
  }, [groups, pathname]);

  const [openIds, setOpenIds] = useState<Set<string>>(defaultOpen);

  useEffect(() => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      for (const id of defaultOpen) next.add(id);
      return next;
    });
  }, [defaultOpen]);

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-2 [scrollbar-width:thin]">
      <ul className="space-y-0.5">
        {groups.map((g) => {
          const Icon = g.icon;
          const isLeaf = Boolean(g.href);
          const childActive = g.children.some((c) =>
            isPathActive(pathname, c.href),
          );
          const selfActive = g.href
            ? isPathActive(pathname, g.href)
            : childActive;
          const expanded = openIds.has(g.id) || childActive;

          if (isLeaf && g.href) {
            return (
              <li key={g.id}>
                <Link
                  href={g.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[0.8125rem] font-medium transition",
                    selfActive
                      ? "bg-[#212b36] text-white"
                      : "text-[#c4ccd6] hover:bg-[#1e2733] hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-90" strokeWidth={1.75} />
                  <span className="truncate">{g.label}</span>
                </Link>
              </li>
            );
          }

          return (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => toggle(g.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[0.8125rem] font-medium transition",
                  selfActive
                    ? "bg-[#212b36] text-white"
                    : "text-[#c4ccd6] hover:bg-[#1e2733] hover:text-white",
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-90" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate">{g.label}</span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 opacity-70 transition",
                    expanded ? "rotate-0" : "-rotate-90",
                  )}
                />
              </button>
              {expanded ? (
                <ul className="mt-0.5 ml-2 space-y-0.5 border-l border-white/10 pl-2">
                  {g.children.map((c) => {
                    const CIcon = c.icon;
                    const active = isPathActive(pathname, c.href);
                    return (
                      <li key={c.href}>
                        <Link
                          href={c.href}
                          onClick={onNavigate}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.78rem] transition",
                            active
                              ? "bg-[#1a56db] font-semibold text-white"
                              : "text-[#9aa6b2] hover:bg-[#1e2733] hover:text-white",
                          )}
                        >
                          <CIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                          <span className="truncate">{c.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function modeBadge(modes: string[]) {
  if (!modes.length) return "Setup";
  const labels: Record<string, string> = {
    sale: "Sale",
    rental: "Rent",
    service: "Service",
    subscription: "Members",
  };
  return modes.map((m) => labels[m] ?? m).join(" + ");
}

function SidebarBody({
  onNavigate,
  onLogout,
  onSwitchOrg,
  userName,
  userEmail,
  roles,
  productName,
  tagline,
  hasModule,
  hasMode,
  commerceModes,
  modeLabel,
}: {
  onNavigate?: () => void;
  onLogout: () => void;
  onSwitchOrg?: () => void;
  userName?: string;
  userEmail?: string;
  roles: string[];
  productName: string;
  tagline: string;
  hasModule: (code: string) => boolean;
  hasMode: (code: string) => boolean;
  commerceModes: string[];
  modeLabel: string;
}) {
  const initial = (productName.trim()[0] || "P").toUpperCase();
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#131920] text-[#e8edf4]">
      <div className="shrink-0 px-4 pb-3 pt-4">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-[#1a56db] text-sm font-bold text-white">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-[0.7rem] font-bold tracking-[0.14em] text-white uppercase">
              POS
            </p>
            <p className="truncate text-[0.78rem] text-[#9aa6b2]">
              {productName}
            </p>
          </div>
        </div>
        <p className="mt-2 truncate text-[0.65rem] text-[#6b7785]">
          {tagline || modeLabel} · {modeBadge(commerceModes)}
        </p>
      </div>

      <div className="mx-3 shrink-0 border-t border-white/10" />

      <ZohoNav
        onNavigate={onNavigate}
        roles={roles}
        hasModule={hasModule}
        hasMode={hasMode}
      />

      <div className="shrink-0 border-t border-white/10 px-3 py-3">
        <div className="rounded-md bg-[#1a222c] px-3 py-2.5">
          <p className="truncate text-[0.8rem] font-semibold text-white">
            {userName ?? "Staff"}
          </p>
          <p className="truncate text-[0.68rem] text-[#8b9bb0]">{userEmail}</p>
          {roles.length ? (
            <p className="mt-1 truncate text-[0.58rem] font-medium tracking-[0.08em] text-[#7aa2ff] uppercase">
              {roles.join(" · ")}
            </p>
          ) : null}
        </div>
        {onSwitchOrg ? (
          <button
            type="button"
            className="mt-2 w-full rounded-md border border-white/15 bg-transparent px-3 py-2 text-[0.78rem] font-medium text-[#c4ccd6] transition hover:bg-[#1e2733] hover:text-white"
            onClick={onSwitchOrg}
          >
            Switch organization
          </button>
        ) : null}
        <button
          type="button"
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-white/15 bg-transparent px-3 py-2 text-[0.78rem] font-medium text-[#c4ccd6] transition hover:bg-[#1e2733] hover:text-white"
          onClick={onLogout}
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const stationUser = useAuthStore((s) => s.stationUser);
  const pinLocked = useAuthStore((s) => s.pinLocked);
  const stationToken = useAuthStore((s) => s.stationToken);
  const identityToken = useAuthStore((s) => s.identityToken);
  const clear = useAuthStore((s) => s.clear);
  const {
    productName,
    tagline,
    hasModule,
    hasMode,
    commerceModes,
    isLoading,
    isError,
    data: boot,
  } = useBootstrap();
  const [open, setOpen] = useState(false);
  const [showSetPin, setShowSetPin] = useState(false);
  const wide =
    pathname === "/counter" ||
    pathname.startsWith("/counter/") ||
    pathname === "/pos" ||
    pathname.startsWith("/pos/");
  const roles = user?.roles ?? stationUser?.roles ?? [];
  const modeLabel = modeBadge(commerceModes) || "POS";
  const pinSwitchEnabled =
    (boot?.tenant?.settings as { pos?: { pinSwitchEnabled?: boolean } } | null)
      ?.pos?.pinSwitchEnabled !== false;

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (pinLocked || !user || !pinSwitchEnabled) return;
    if (user.pinSet === false) {
      setShowSetPin(true);
    }
  }, [user, pinLocked, pinSwitchEnabled]);

  useEffect(() => {
    if (pinLocked || !roles.length || isLoading) return;
    if (!canAccessPath(pathname, roles)) {
      const home = defaultHomeForRoles(roles);
      toast.error("You don’t have access to that page");
      router.replace(home);
      return;
    }
    const item = NAV_CATALOG.find(
      (n) => pathname === n.href || pathname.startsWith(`${n.href}/`),
    );
    if (item?.module && !hasModule(item.module)) {
      toast.message("Module not enabled for this shop");
      router.replace("/dashboard");
      return;
    }
    if (item?.commerce && !hasMode(item.commerce)) {
      toast.message("Not enabled for this shop’s commerce modes");
      router.replace("/dashboard");
    }
  }, [pathname, roles, router, hasModule, hasMode, isLoading, pinLocked]);

  useEffect(() => {
    const html = document.documentElement;
    const prevHtml = html.style.overflow;
    const prevBody = document.body.style.overflow;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function logout() {
    try {
      await authApi.logout();
    } catch {
      /* still clear local session */
    } finally {
      clear();
      qc.removeQueries({ queryKey: ["tenant-bootstrap"] });
      toast.success("Signed out");
      router.replace("/login");
    }
  }

  function switchOrganization() {
    useAuthStore.getState().clearTenantSession();
    router.replace("/organizations");
  }

  if (isLoading) {
    return (
      <div className="grid h-dvh place-items-center bg-[#f4f6fa] text-sm text-[#5a6b7d]">
        Loading shop…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="grid h-dvh place-items-center bg-[#f4f6fa] px-4 text-center">
        <div>
          <p className="text-sm font-medium text-[#0b1f33]">
            Couldn’t load shop configuration
          </p>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const initial = (productName.trim()[0] || "P").toUpperCase();

  const acting = user ?? stationUser;
  const sidebarProps = {
    onLogout: () => void logout(),
    onSwitchOrg: identityToken
      ? () => switchOrganization()
      : undefined,
    userName: acting?.fullName,
    userEmail: acting?.email,
    roles,
    productName,
    tagline,
    hasModule,
    hasMode,
    commerceModes,
    modeLabel,
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-[#eef1f5] text-[#0b1f33]">
      {pinLocked && stationToken ? (
        <StationPinLock open locationId={acting?.storeId} />
      ) : null}
      <SetPinDialog
        open={showSetPin && !pinLocked}
        title="Set your counter PIN"
        onClose={() => setShowSetPin(false)}
        onSaved={() => {
          if (user) {
            useAuthStore.setState({
              user: { ...user, pinSet: true },
              stationUser: stationUser
                ? { ...stationUser, pinSet: true }
                : stationUser,
            });
          }
          setShowSetPin(false);
        }}
      />
      {/* Dark Zoho secondary nav */}
      <aside className="hidden h-dvh w-[15.25rem] shrink-0 flex-col md:flex">
        <SidebarBody {...sidebarProps} />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between border-b border-[#d9e0ea] bg-white px-4 py-3 md:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#1a56db] text-xs font-semibold text-white">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight text-[#0b1f33]">
                {productName}
              </p>
              <p className="mt-0.5 truncate text-[0.6rem] font-medium tracking-wide text-[#5a6b7d] uppercase">
                {modeLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg border border-[#d9e0ea] p-2 text-[#2c3e50]"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>

        <AnimatePresence>
          {open ? (
            <motion.div
              className="fixed inset-0 z-50 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <button
                type="button"
                className="absolute inset-0 bg-[#0b1f33]/50"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              />
              <motion.aside
                className="absolute top-0 left-0 flex h-full w-[min(17rem,88vw)] flex-col shadow-xl"
                initial={{ x: -28, opacity: 0.85 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -20, opacity: 0 }}
              >
                <div className="absolute top-2 right-2 z-10">
                  <button
                    type="button"
                    className="rounded-md border border-white/20 bg-[#1e2733] p-2 text-white"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-h-0 flex-1">
                  <SidebarBody
                    {...sidebarProps}
                    onNavigate={() => setOpen(false)}
                  />
                </div>
              </motion.aside>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <main
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#eef1f5]",
            "[scrollbar-gutter:stable]",
          )}
        >
          <div
            className={cn(
              "px-4 py-5 sm:px-6 sm:py-6 lg:px-8",
              wide ? "max-w-none" : "mx-auto w-full max-w-[72rem]",
            )}
          >
            {canAccessPath(pathname, roles) ? children : null}
          </div>
        </main>
      </div>
    </div>
  );
}
