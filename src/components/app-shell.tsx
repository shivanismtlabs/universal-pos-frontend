"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  LayoutDashboard,
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

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  section: string;
  module?: string;
  /** Required commerce mode code (sale|rental|service|…) */
  commerce?: string;
};

const NAV_CATALOG: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    section: "Daily work",
  },
  {
    href: "/counter",
    label: "Counter",
    icon: CreditCard,
    section: "Daily work",
    module: "pos",
  },
  {
    href: "/catalog",
    label: "Products",
    icon: Box,
    section: "Daily work",
    module: "catalog",
  },
  {
    href: "/returns",
    label: "Returns desk",
    icon: PackageCheck,
    section: "Daily work",
    module: "orders",
    commerce: "rental",
  },
  {
    href: "/orders",
    label: "All orders",
    icon: ClipboardList,
    section: "Daily work",
    module: "orders",
  },
  {
    href: "/customers",
    label: "Customers",
    icon: Users,
    section: "People",
    module: "orders",
  },
  {
    href: "/parties",
    label: "Customer groups",
    icon: UsersRound,
    section: "People",
    module: "rental",
    commerce: "rental",
  },
  {
    href: "/appointments",
    label: "Appointments",
    icon: CalendarDays,
    section: "People",
    module: "appointments",
    commerce: "service",
  },
  {
    href: "/staff",
    label: "Staff accounts",
    icon: UserCog,
    section: "People",
    module: "iam",
  },
  {
    href: "/notify",
    label: "WhatsApp",
    icon: MessageCircle,
    section: "People",
    module: "notify",
  },
  {
    href: "/reports",
    label: "Reports",
    icon: BarChart3,
    section: "People",
    module: "reports",
  },
  {
    href: "/suppliers",
    label: "Suppliers",
    icon: Truck,
    section: "Shop setup",
    commerce: "sale" as const,
    module: "inventory",
  },
  {
    href: "/transfers",
    label: "Stock transfer",
    icon: ArrowRightLeft,
    section: "Shop setup",
    module: "catalog",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    section: "Shop setup",
    // Always available for admin/manager — not gated on optional modules
  },
  {
    href: "/plan",
    label: "Subscription plan",
    icon: CreditCard,
    section: "Shop setup",
  },
];

function filterNav(
  items: NavItem[],
  roles: string[],
  hasModule: (code: string) => boolean,
  hasMode: (code: string) => boolean,
) {
  return items.filter((item) => {
    if (item.module && !hasModule(item.module)) return false;
    if (item.commerce && !hasMode(item.commerce)) return false;
    const allowed = ROUTE_ROLES[item.href as keyof typeof ROUTE_ROLES];
    if (!allowed) return true;
    return allowed.some((r) => roles.includes(r));
  });
}

function NavSection({
  title,
  items,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  if (!items.length) return null;

  return (
    <div className="mt-5 first:mt-0">
      <p className="px-3 pb-2 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[#8b9bb0]">
        {title}
      </p>
      <div className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[0.8125rem] font-semibold tracking-[-0.01em] transition-colors",
                active
                  ? "text-white"
                  : "text-[#2c3e50] hover:bg-[#eef3fb] hover:text-[#0b1f33]",
              )}
            >
              {active ? (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-[10px] bg-[#1a56db] shadow-[0_1px_2px_rgba(26,86,219,0.25)]"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              ) : null}
              <Icon
                className={cn(
                  "relative z-10 h-[1.05rem] w-[1.05rem] shrink-0",
                  active ? "opacity-95" : "opacity-70 group-hover:opacity-90",
                )}
                strokeWidth={1.75}
              />
              <span className="relative z-10 truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function NavLinks({
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
  const sections = useMemo(() => {
    const items = filterNav(NAV_CATALOG, roles, hasModule, hasMode);
    const order = ["Daily work", "People", "Shop setup"];
    return order.map((title) => ({
      title,
      items: items.filter((i) => i.section === title),
    }));
  }, [roles, hasModule, hasMode]);

  return (
    <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-1 [scrollbar-width:thin]">
      {sections.map((s) => (
        <NavSection
          key={s.title}
          title={s.title}
          items={s.items}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

function modeBadge(modes: string[]) {
  if (!modes.length) return "Setup";
  const labels: Record<string, string> = {
    sale: "Sale",
    rental: "Rent",
    service: "Service",
    subscription: "Sub",
  };
  return modes.map((m) => labels[m] ?? m).join(" + ");
}

function SidebarBody({
  onNavigate,
  onLogout,
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pb-4 pt-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-[10px] bg-[#1a56db] text-sm font-semibold tracking-tight text-white shadow-[0_1px_2px_rgba(26,86,219,0.28)]">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.95rem] font-semibold tracking-tight text-[#0b1f33]">
              {productName}
            </p>
            <p className="mt-0.5 truncate text-[0.68rem] text-[#5a6b7d]">
              {tagline || modeLabel}
            </p>
          </div>
        </div>
        <div className="mt-3 inline-flex items-center rounded-md border border-[#d9e0ea] bg-[#f4f6fa] px-2 py-0.5 text-[0.62rem] font-bold tracking-[0.1em] text-[#5a6b7d] uppercase">
          {modeBadge(commerceModes)}
        </div>
      </div>

      <div className="mx-4 shrink-0 border-t border-[#e8ebf0]" />

      <NavLinks
        onNavigate={onNavigate}
        roles={roles}
        hasModule={hasModule}
        hasMode={hasMode}
      />

      <div className="shrink-0 border-t border-[#e8ebf0] bg-[#fafbfc] px-3 py-3">
        <div className="rounded-lg border border-[#e8ebf0] bg-white px-3 py-2.5">
          <p className="truncate text-[0.8125rem] font-semibold text-[#0b1f33]">
            {userName ?? "Staff"}
          </p>
          <p className="truncate text-[0.68rem] text-[#5a6b7d]">{userEmail}</p>
          {roles.length ? (
            <p className="mt-1 truncate text-[0.6rem] font-medium tracking-[0.08em] text-[#1a56db] uppercase">
              {roles.join(" · ")}
            </p>
          ) : null}
        </div>
        <Button
          variant="secondary"
          className="mt-2.5 h-9 w-full text-[0.8125rem]"
          onClick={onLogout}
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </Button>
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
    // App shell owns scrolling — keep document from scrolling under the fixed sidebar
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
    <div className="flex h-dvh overflow-hidden bg-[#f4f6fa] text-[#0b1f33]">
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
      {/* Desktop sidebar — fixed to viewport, never scrolls with page */}
      <aside className="hidden h-dvh w-[15.5rem] shrink-0 flex-col border-r border-[#d9e0ea] bg-white md:flex">
        <SidebarBody {...sidebarProps} />
      </aside>

      {/* Right column: mobile header + scrollable content only */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between border-b border-[#d9e0ea] bg-white/95 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[#1a56db] text-xs font-semibold text-white">
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
                className="absolute inset-0 bg-[#0b1f33]/40"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              />
              <motion.aside
                className="absolute top-0 left-0 flex h-full w-[min(17rem,88vw)] flex-col border-r border-[#d9e0ea] bg-white shadow-xl"
                initial={{ x: -28, opacity: 0.85 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -20, opacity: 0 }}
              >
                <div className="flex shrink-0 justify-end border-b border-[#e8ebf0] p-2.5">
                  <button
                    type="button"
                    className="rounded-lg border border-[#d9e0ea] p-2"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
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
            "min-h-0 flex-1 overflow-y-auto overscroll-contain",
            "[scrollbar-gutter:stable]",
          )}
        >
          <div
            className={cn(
              "px-4 py-5 sm:px-6 sm:py-6 lg:px-8",
              wide ? "max-w-none" : "mx-auto w-full max-w-6xl",
            )}
          >
            {canAccessPath(pathname, roles) ? children : null}
          </div>
        </main>
      </div>
    </div>
  );
}
