"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  FileLineChart,
  FileSpreadsheet,
  CalendarRange,
  TrendingUp,
  TrendingDown,
  Landmark,
  User,
  UserCog,
  Truck,
  Box,
  Settings,
  Package,
  ArrowRightLeft,
  Wallet,
  TicketPercent,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Home,
  Building2,
  Search,
  Bell,
  LayoutGrid,
  Folder,
  Tag,
  BookOpen,
  NotebookPen,
  ScrollText,
  Scale,
  Sheet,
  Receipt,
  Plug,
  Link2,
  Library,
  MapPin,
  Percent,
  Repeat,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { authApi, notifyApi } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { useBootstrap } from "@/lib/bootstrap";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { StationPinLock } from "@/components/station-pin-lock";
import { SetPinDialog } from "@/components/set-pin-dialog";
import { ShellEntitySearch } from "@/components/shell-entity-search";
import { BranchSelector } from "@/components/branch-selector";
import { OfflineStatusBanner } from "@/components/offline-status-banner";
import { SessionIdleWatcher } from "@/components/session-idle-watcher";
import { InboxPopupListener } from "@/components/inbox-popup-listener";
import { toast } from "sonner";
import {
  getDeviceId,
  startConnectivityMonitor,
  unlockOfflineCrypto,
  pullOfflineSnapshot,
  isServerReachable,
} from "@/lib/offline";
import {
  flushOfflineQueue,
  hydrateOfflinePendingCount,
} from "@/lib/offline-queue";
import { useBranchStore } from "@/lib/branch-store";
import {
  canAccessPath,
  defaultHomeForRoles,
} from "@/lib/roles";

type NavLeaf = {
  href: string;
  label: string;
  icon: LucideIcon;
  module?: string;
  commerce?: string;
  /** Capability code — prefer over businessType gates */
  capability?: string;
  /** Zoho nested folder under secondary panel (e.g. Business → Profile) */
  folder?: string;
};

type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Single link when no children */
  href?: string;
  children?: NavLeaf[];
  /** Zoho secondary section subtitle */
  section?: string;
  /** Short rail caption (default: first word of label) */
  railLabel?: string;
  /** Hide whole group unless this commerce mode is on */
  commerce?: string;
  /** Hide unless bootstrap.group exists and is not hideLayer */
  groupOnly?: boolean;
};

/** Zoho dual-nav groups — rail icons + secondary panel lists */
const NAV_GROUPS: NavGroup[] = [
  {
    id: "home",
    label: "Home",
    icon: Home,
    href: "/dashboard",
    section: "Workspace",
  },
  {
    id: "group",
    label: "All Businesses",
    icon: Building2,
    href: "/group",
    section: "Workspace",
    groupOnly: true,
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: Package,
    section: "Catalog",
    children: [
      {
        href: "/catalog",
        label: "Items",
        icon: Box,
        module: "catalog",
      },
      {
        href: "/catalog/new",
        label: "New Item",
        icon: Package,
        module: "catalog",
      },
      {
        href: "/catalog?tab=categories",
        label: "Categories",
        icon: Folder,
        module: "catalog",
      },
      {
        href: "/catalog?tab=brands",
        label: "Brands",
        icon: Tag,
        module: "catalog",
      },
      {
        href: "/inventory",
        label: "Stock levels",
        icon: Package,
        module: "inventory",
        commerce: "sale",
      },
      {
        href: "/inventory?tab=alerts",
        label: "Low stock",
        icon: Bell,
        module: "inventory",
        commerce: "sale",
      },
      {
        href: "/inventory?tab=damage",
        label: "Damaged stock",
        icon: PackageCheck,
        module: "inventory",
        commerce: "sale",
      },
      {
        href: "/adjustments",
        label: "Adjustments",
        icon: PackageCheck,
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
    railLabel: "Sales",
    icon: CreditCard,
    section: "Commerce",
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
    section: "Commerce",
    commerce: "sale",
    children: [
      {
        href: "/suppliers",
        label: "Suppliers & POs",
        icon: Truck,
        commerce: "sale",
        module: "inventory",
      },
      {
        href: "/purchases",
        label: "GRN & payables",
        icon: Truck,
        commerce: "sale",
        module: "inventory",
      },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    icon: Users,
    section: "People",
    children: [
      {
        href: "/customers",
        label: "Customers",
        icon: Users,
        module: "orders",
      },
      {
        href: "/loyalty",
        label: "Loyalty",
        icon: TicketPercent,
      },
      {
        href: "/parties",
        label: "Customer groups",
        icon: UsersRound,
        module: "orders",
      },
      {
        href: "/appointments",
        label: "Appointments",
        icon: CalendarDays,
        module: "appointments",
        capability: "BOOKING",
        commerce: "service",
      },
      {
        href: "/resources",
        label: "Resources",
        icon: LayoutGrid,
        capability: "RESOURCE",
      },
      {
        href: "/kitchen",
        label: "Kitchen / KOT",
        icon: ClipboardList,
        capability: "KOT",
      },
      {
        href: "/jobs",
        label: "Jobs",
        icon: ClipboardList,
        module: "jobs",
        capability: "REPAIR_JOB",
      },
      {
        href: "/customers?tab=memberships",
        label: "Memberships",
        icon: TicketPercent,
        capability: "MEMBERSHIP",
      },
      {
        href: "/check-in",
        label: "Check-in",
        icon: CalendarDays,
        capability: "CHECK_IN",
      },
    ],
  },
  {
    id: "people",
    label: "Team",
    icon: UserCog,
    section: "People",
    children: [
      {
        href: "/staff",
        label: "Staff accounts",
        icon: UserCog,
        module: "iam",
      },
      {
        href: "/roles",
        label: "Roles & permissions",
        icon: Settings,
        module: "iam",
      },
      {
        href: "/attendance",
        label: "Attendance",
        icon: CalendarDays,
        module: "iam",
      },
      {
        href: "/shifts",
        label: "Shift management",
        icon: ClipboardList,
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
    icon: FileLineChart,
    section: "Insights",
    children: [
      {
        href: "/reports/daily",
        label: "Daily Sales",
        icon: CalendarDays,
        module: "reports",
      },
      {
        href: "/reports/monthly",
        label: "Monthly Sales",
        icon: CalendarRange,
        module: "reports",
      },
      {
        href: "/reports/pnl",
        label: "Profit & Loss",
        icon: Landmark,
        module: "reports",
      },
      {
        href: "/reports/top-products",
        label: "Top-Selling Products",
        icon: TrendingUp,
        module: "reports",
      },
      {
        href: "/reports/slow-moving",
        label: "Slow-Moving Stock",
        icon: TrendingDown,
        module: "reports",
        capability: "INVENTORY",
      },
      {
        href: "/reports/customers",
        label: "Customer Reports",
        icon: Users,
        module: "reports",
      },
      {
        href: "/reports/employees",
        label: "Employee Sales",
        icon: User,
        module: "reports",
      },
      {
        href: "/reports/finance",
        label: "Finance Reports",
        icon: Wallet,
        module: "reports",
      },
      {
        href: "/reports/inventory",
        label: "Inventory Reports",
        icon: Package,
        module: "reports",
        capability: "INVENTORY",
      },
      {
        href: "/reports/rental",
        label: "Rental / assets",
        icon: Repeat,
        module: "reports",
        commerce: "rental" as const,
      },
      {
        href: "/reports/subscriptions",
        label: "Plans & memberships",
        icon: CalendarClock,
        module: "reports",
        commerce: "subscription" as const,
      },
      {
        href: "/reports/schedules",
        label: "Scheduled emails",
        icon: CalendarRange,
        module: "reports",
      },
      {
        href: "/reports",
        label: "Reports & CSV",
        icon: FileSpreadsheet,
        module: "reports",
      },
    ],
  },
  {
    id: "accounting",
    label: "Accounting",
    icon: BookOpen,
    section: "Insights",
    children: [
      { href: "/accounting", label: "Overview", icon: BookOpen },
      { href: "/accounting/accounts", label: "Chart of Accounts", icon: Library },
      { href: "/accounting/journals", label: "Journal Entries", icon: NotebookPen },
      { href: "/accounting/ledger", label: "Ledger", icon: ScrollText },
      { href: "/accounting/trial-balance", label: "Trial Balance", icon: Scale },
      { href: "/accounting/profit-loss", label: "Profit & Loss", icon: Landmark },
      { href: "/accounting/balance-sheet", label: "Balance Sheet", icon: Sheet },
      { href: "/accounting/gst", label: "GST Reports", icon: Receipt },
      { href: "/accounting/periods", label: "Accounting Periods", icon: CalendarRange },
      { href: "/accounting/mappings", label: "Account Mapping", icon: Link2 },
      { href: "/accounting/integrations", label: "Integrations", icon: Plug },
      { href: "/settings/accounting", label: "Accounting settings", icon: Settings },
    ],
  },
  {
    id: "stores",
    label: "Stores",
    railLabel: "Stores",
    icon: Building2,
    section: "Locations",
    children: [
      {
        href: "/multi-store/dashboard",
        label: "Multi-store dashboard",
        icon: LayoutGrid,
      },
    ],
  },
  {
    id: "setup",
    label: "Settings",
    railLabel: "Settings",
    icon: Settings,
    section: "Business settings",
    children: [
      {
        href: "/settings",
        label: "Profile",
        icon: Building2,
        folder: "Business",
      },
      {
        href: "/settings/locations",
        label: "Locations",
        icon: MapPin,
        folder: "Business",
      },
      {
        href: "/settings/tax",
        label: "Tax",
        icon: Percent,
        folder: "Business",
      },
      {
        href: "/settings/notifications",
        label: "Notifications",
        icon: Bell,
        folder: "Business",
      },
      {
        href: "/settings/receipt",
        label: "Receipt",
        icon: Receipt,
        folder: "Business",
      },
      {
        href: "/settings/counter",
        label: "Counter",
        icon: CreditCard,
        folder: "Business",
      },
      {
        href: "/settings/returns",
        label: "Returns",
        icon: Package,
        folder: "Business",
      },
      {
        href: "/settings/expenses",
        label: "Expense categories",
        icon: Wallet,
        folder: "Business",
      },
      {
        href: "/settings/custom-fields",
        label: "Custom fields",
        icon: Library,
        folder: "Business",
      },
      {
        href: "/settings/capabilities",
        label: "Commerce modes & features",
        icon: LayoutGrid,
        folder: "Business",
      },
      {
        href: "/settings/payment-methods",
        label: "Payment methods",
        icon: CreditCard,
        folder: "Business",
      },
      {
        href: "/expenses",
        label: "Expenses",
        icon: Wallet,
        folder: "Business",
      },
      {
        href: "/settings/offline",
        label: "Offline & sync",
        icon: Package,
        folder: "Business",
      },
      {
        href: "/settings/security",
        label: "Security",
        icon: Settings,
        folder: "Business",
      },
      {
        href: "/settings/accounting",
        label: "Accounting",
        icon: BookOpen,
        folder: "Business",
      },
      {
        href: "/plan",
        label: "Subscription",
        icon: CreditCard,
        folder: "Business",
      },
      {
        href: "/staff",
        label: "Staff accounts",
        icon: UserCog,
        folder: "Users & Roles",
        module: "iam",
      },
      {
        href: "/roles",
        label: "Roles & permissions",
        icon: Settings,
        folder: "Users & Roles",
        module: "iam",
      },
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
  permissions: string[],
  hasModule: (code: string) => boolean,
  hasMode: (code: string) => boolean,
  hasCapability: (code: string) => boolean,
) {
  if (item.module && !hasModule(item.module)) return false;
  if (item.commerce && !hasMode(item.commerce)) return false;
  if (item.capability && !hasCapability(item.capability)) return false;
  return canAccessPath(hrefPath(item.href), roles, permissions);
}

function hrefPath(href: string) {
  return href.split("?")[0] ?? href;
}

function hrefTab(href: string) {
  const qs = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
  return new URLSearchParams(qs).get("tab");
}

/** Active state — catalog/inventory tabs use ?tab= so sibling links stay distinct */
function isLeafActive(pathname: string, search: string, href: string) {
  const base = hrefPath(href);
  const wantTab = hrefTab(href);
  const haveTab = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  ).get("tab");

  if (base === "/catalog") {
    if (pathname !== "/catalog") return false;
    if (!wantTab || wantTab === "products") {
      return !haveTab || haveTab === "products";
    }
    return haveTab === wantTab;
  }

  if (base === "/inventory") {
    if (pathname !== "/inventory") return false;
    if (!wantTab || wantTab === "levels") {
      return !haveTab || haveTab === "levels";
    }
    return haveTab === wantTab;
  }

  // `/settings` is Profile only — do not highlight it for /settings/tax, etc.
  if (base === "/settings") {
    return pathname === "/settings";
  }

  return pathname === base || pathname.startsWith(`${base}/`);
}

function isPathActive(pathname: string, href: string) {
  // Backward-compatible path-only check (group selection)
  const base = hrefPath(href);
  if (base === "/catalog") {
    return pathname === "/catalog" || pathname.startsWith("/catalog/");
  }
  return pathname === base || pathname.startsWith(`${base}/`);
}

function groupActiveFromPath(
  pathname: string,
  groups: Array<NavGroup & { children: NavLeaf[] }>,
): string {
  for (const g of groups) {
    if (g.href && isPathActive(pathname, g.href)) return g.id;
    if (g.children.some((c) => isPathActive(pathname, c.href))) return g.id;
  }
  return groups[0]?.id ?? "home";
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

/**
 * Zoho-style dual sidebar:
 *  - narrow icon rail (primary modules)
 *  - secondary panel (group title + search + nested links)
 */
function SidebarBody({
  onNavigate,
  onLogout,
  onSwitchOrg,
  userName,
  userEmail,
  roles,
  permissions,
  productName,
  hasModule,
  hasMode,
  hasCapability,
}: {
  onNavigate?: () => void;
  onLogout: () => void;
  onSwitchOrg?: () => void;
  userName?: string;
  userEmail?: string;
  roles: string[];
  permissions: string[];
  productName: string;
  tagline: string;
  hasModule: (code: string) => boolean;
  hasMode: (code: string) => boolean;
  hasCapability: (code: string) => boolean;
  commerceModes: string[];
  modeLabel: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ? `?${searchParams.toString()}` : "";
  const router = useRouter();
  const [navQuery, setNavQuery] = useState("");
  const { data: boot } = useBootstrap();
  const showGroup = Boolean(boot?.group && !boot.group.hideLayer);

  const groups = useMemo(() => {
    return NAV_GROUPS.map((g) => {
      if (g.groupOnly && !showGroup) return null;
      if (g.commerce && !hasMode(g.commerce)) return null;
      const children = (g.children ?? []).filter((c) =>
        leafAllowed(c, roles, permissions, hasModule, hasMode, hasCapability),
      );
      if (g.href) {
        const leaf: NavLeaf = { href: g.href, label: g.label, icon: g.icon };
        if (!leafAllowed(leaf, roles, permissions, hasModule, hasMode, hasCapability))
          return null;
        return { ...g, children: [] as NavLeaf[] };
      }
      if (!children.length) return null;
      return { ...g, children };
    }).filter(Boolean) as Array<NavGroup & { children: NavLeaf[] }>;
  }, [roles, permissions, hasModule, hasMode, hasCapability, showGroup]);

  const pathGroupId = useMemo(
    () => groupActiveFromPath(pathname, groups),
    [pathname, groups],
  );

  const [railId, setRailId] = useState(pathGroupId);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setRailId(pathGroupId);
  }, [pathGroupId]);

  const activeGroup =
    groups.find((g) => g.id === railId) ?? groups[0] ?? null;

  const q = navQuery.trim().toLowerCase();
  const panelLinks = useMemo(() => {
    if (!activeGroup) return [] as NavLeaf[];
    if (activeGroup.href) {
      return [
        {
          href: activeGroup.href,
          label: activeGroup.label,
          icon: activeGroup.icon,
        },
      ];
    }
    let list = activeGroup.children;
    if (q) {
      list = list.filter((c) => c.label.toLowerCase().includes(q));
    }
    return list;
  }, [activeGroup, q]);

  // Expand folder that contains the current route
  useEffect(() => {
    if (!activeGroup) return;
    const next: Record<string, boolean> = {};
    for (const c of activeGroup.children) {
      if (c.folder && isLeafActive(pathname, search, c.href)) {
        next[c.folder] = true;
      }
    }
    if (Object.keys(next).length) {
      setOpenFolders((prev) => ({ ...prev, ...next }));
    }
  }, [pathname, search, activeGroup]);

  const folderOrder = useMemo(() => {
    const order: string[] = [];
    for (const c of panelLinks) {
      const f = c.folder ?? "";
      if (f && !order.includes(f)) order.push(f);
    }
    return order;
  }, [panelLinks]);

  const unfoldered = panelLinks.filter((c) => !c.folder);
  const hasFolders = folderOrder.length > 0;

  const railTop = groups.filter((g) =>
    ["home", "inventory", "sales", "purchases", "customers", "people", "docs"].includes(
      g.id,
    ),
  );
  const railBottom = groups.filter((g) => g.id === "setup");

  function onRailClick(g: NavGroup & { children: NavLeaf[] }) {
    setRailId(g.id);
    setNavQuery("");
    if (g.href) {
      router.push(g.href);
      onNavigate?.();
    } else if (g.children[0]?.href) {
      // Stay on panel; optional first nav only for home-less groups — skip auto-nav
    }
  }

  function toggleFolder(name: string) {
    setOpenFolders((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  const railCaption = (g: NavGroup) =>
    g.railLabel ?? g.label.split(" ")[0] ?? g.label;

  const unreadQ = useQuery({
    queryKey: ["notify-unread"],
    queryFn: () => notifyApi.unreadCount(),
    refetchInterval: 12_000,
    refetchOnWindowFocus: true,
  });
  const unread = unreadQ.data?.unreadCount ?? 0;

  return (
    <div className="flex h-full min-h-0 w-full bg-[#0b1016] text-[#e8edf4] print:bg-white print:text-[#0b1f33]">
      {/* —— Zoho icon rail —— */}
      <div className="flex w-[4.35rem] shrink-0 flex-col border-r border-white/[0.06] bg-[#06090e]">
        <div className="flex justify-center pt-2.5 pb-1">
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-md text-[#8b96a5] transition hover:bg-white/[0.06] hover:text-white"
            title="Collapse"
            aria-label="Collapse navigation"
            onClick={() => onNavigate?.()}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col items-center gap-0.5 overflow-y-auto px-1 py-1 [scrollbar-width:none]">
          {railTop.map((g) => {
            const Icon = g.icon;
            const on = g.id === railId;
            return (
              <button
                key={g.id}
                type="button"
                title={g.label}
                onClick={() => onRailClick(g)}
                className={cn(
                  "relative flex w-full flex-col items-center gap-0.5 rounded-md px-0.5 py-2 transition",
                  on
                    ? "bg-[#152238] text-white"
                    : "text-[#8b96a5] hover:bg-white/[0.06] hover:text-white",
                )}
              >
                {on ? (
                  <span className="absolute top-1 bottom-1 left-0 w-[3px] rounded-r-full bg-[#1a56db]" />
                ) : null}
                <Icon className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} />
                <span className="max-w-full px-0.5 text-center text-[0.55rem] leading-tight font-medium">
                  {railCaption(g)}
                </span>
              </button>
            );
          })}

          <div className="my-2 w-7 border-t border-white/10" />

          <button
            type="button"
            title="Search"
            className="flex w-full flex-col items-center gap-0.5 rounded-md px-0.5 py-2 text-[#8b96a5] transition hover:bg-white/[0.06] hover:text-white"
            onClick={() => {
              document.getElementById("shell-nav-search")?.focus();
            }}
          >
            <Search className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} />
            <span className="text-[0.55rem] font-medium">Search</span>
          </button>

          <div className="min-h-2 flex-1" />

          <Link
            href="/notifications"
            onClick={onNavigate}
            title="Notifications"
            className="relative flex w-full flex-col items-center gap-0.5 rounded-md px-0.5 py-2 text-[#8b96a5] transition hover:bg-white/[0.06] hover:text-white"
          >
            <Bell className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} />
            {unread > 0 ? (
              <span className="absolute top-1 right-1.5 grid min-w-[1rem] place-items-center rounded-full bg-[#dc2626] px-0.5 text-[0.55rem] font-bold text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
            <span className="text-[0.55rem] font-medium">Alerts</span>
          </Link>

          {railBottom.map((g) => {
            const Icon = g.icon;
            const on = g.id === railId;
            return (
              <button
                key={g.id}
                type="button"
                title={g.label}
                onClick={() => onRailClick(g)}
                className={cn(
                  "relative flex w-full flex-col items-center gap-0.5 rounded-md px-0.5 py-2 transition",
                  on
                    ? "bg-[#152238] text-white"
                    : "text-[#8b96a5] hover:bg-white/[0.06] hover:text-white",
                )}
              >
                {on ? (
                  <span className="absolute top-1 bottom-1 left-0 w-[3px] rounded-r-full bg-[#1a56db]" />
                ) : null}
                <Icon className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} />
                <span className="text-[0.55rem] font-medium">{railCaption(g)}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex justify-center border-t border-white/[0.06] py-3">
          <div
            className="grid h-8 w-8 place-items-center rounded-full bg-[#1e2733] text-[0.7rem] font-semibold text-white ring-1 ring-white/10"
            title={userName ?? "Staff"}
          >
            {(userName?.trim()?.[0] || "U").toUpperCase()}
          </div>
        </div>
      </div>

      {/* —— Secondary panel —— */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#11161e]">
        <div className="shrink-0 px-3.5 pt-3.5 pb-2">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-[#7aa2ff]" strokeWidth={1.75} />
            <p className="text-[0.72rem] font-bold tracking-[0.14em] text-white uppercase">
              POS
            </p>
          </div>
          <p className="mt-0.5 truncate text-[0.65rem] text-[#7a8796]">{productName}</p>

          <div className="mt-3 border-b border-white/10">
            <h2 className="inline-block border-b-2 border-[#1a56db] pb-1.5 text-[0.95rem] font-semibold text-white">
              {activeGroup?.label ?? "Menu"}
            </h2>
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[#6b7785]" />
            <input
              id="shell-nav-search"
              type="search"
              placeholder="Product or customer…"
              value={navQuery}
              onChange={(e) => setNavQuery(e.target.value)}
              className="h-8 w-full rounded-lg border-0 bg-[#0a0e14] pr-2 pl-8 text-[0.78rem] text-[#e8edf4] outline-none ring-1 ring-white/10 placeholder:text-[#5a6573] focus:ring-[#1a56db]/50"
            />
          </div>
          <ShellEntitySearch
            query={navQuery}
            onNavigate={() => {
              setNavQuery("");
              onNavigate?.();
            }}
          />

          {activeGroup?.id === "setup" ? (
            <Link
              href="/settings"
              onClick={onNavigate}
              className="mt-2.5 flex items-center gap-2 rounded-md px-2 py-2 text-[0.8rem] text-[#a8b3c0] transition hover:bg-white/[0.05] hover:text-white"
            >
              <Settings className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={1.75} />
              All Settings
            </Link>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2 [scrollbar-width:thin]">
          {activeGroup?.section ? (
            <p className="px-2 pt-1 pb-1.5 text-[0.62rem] font-semibold tracking-[0.14em] text-[#6b8ab8] uppercase">
              {activeGroup.section}
            </p>
          ) : null}

          {/* Zoho nested folders (Settings Business → Profile…) */}
          {hasFolders
            ? folderOrder.map((folder) => {
                const kids = panelLinks.filter((c) => c.folder === folder);
                const expanded =
                  openFolders[folder] !== undefined
                    ? openFolders[folder]
                    : kids.some((c) => isLeafActive(pathname, search, c.href)) ||
                      folder === folderOrder[0];
                const FolderIcon = Folder;
                return (
                  <div key={folder} className="mb-0.5">
                    <button
                      type="button"
                      onClick={() => toggleFolder(folder)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-[0.8125rem] text-[#c5cdd8] transition hover:bg-white/[0.05] hover:text-white"
                    >
                      <FolderIcon className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={1.75} />
                      <span className="min-w-0 flex-1 truncate text-left font-medium">
                        {folder}
                      </span>
                      {expanded ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#7a8796]" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#7a8796]" />
                      )}
                    </button>
                    {expanded ? (
                      <ul className="mb-1 ml-2 border-l border-white/10 pl-2">
                        {kids.map((c) => {
                          const active = isLeafActive(pathname, search, c.href);
                          return (
                            <li key={`${c.href}:${c.label}`}>
                              <Link
                                href={c.href}
                                onClick={onNavigate}
                                className={cn(
                                  "block rounded-md px-2.5 py-1.5 text-[0.8rem] transition",
                                  active
                                    ? "bg-[#2a3444] font-semibold text-white"
                                    : "text-[#9aa6b5] hover:bg-white/[0.05] hover:text-white",
                                )}
                              >
                                {c.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                );
              })
            : null}

          <ul className="space-y-0.5">
            {(hasFolders ? unfoldered : panelLinks).map((c) => {
              const CIcon = c.icon;
              const active = isLeafActive(pathname, search, c.href);
              return (
                <li key={`${c.href}:${c.label}`}>
                  <Link
                    href={c.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[0.8125rem] transition",
                      active
                        ? "bg-[#2a3444] font-semibold text-white"
                        : "text-[#a8b3c0] hover:bg-white/[0.05] hover:text-white",
                    )}
                  >
                    <CIcon
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        active ? "text-[#7aa2ff]" : "opacity-80",
                      )}
                      strokeWidth={1.75}
                    />
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  </Link>
                </li>
              );
            })}
            {!panelLinks.length ? (
              <li className="px-2.5 py-3 text-[0.75rem] text-[#6b7785]">
                No items match
              </li>
            ) : null}
          </ul>
        </div>

        <div className="shrink-0 space-y-2 border-t border-white/[0.06] px-2.5 py-2.5">
          <div className="rounded-lg bg-gradient-to-br from-[#5b21b6] via-[#3730a3] to-[#1a56db] px-3 py-2.5">
            <p className="text-[0.72rem] leading-snug font-medium text-white/95">
              You&apos;re currently on our Premium Trial
            </p>
            <div className="mt-2 flex items-center gap-0 text-[0.72rem] font-semibold text-white">
              <Link
                href="/plan"
                onClick={onNavigate}
                className="pr-2.5 transition hover:underline"
              >
                Upgrade
              </Link>
              <span className="h-3 w-px bg-white/35" />
              <Link
                href="/plan"
                onClick={onNavigate}
                className="pl-2.5 transition hover:underline"
              >
                Switch Trial
              </Link>
            </div>
          </div>

          <div className="px-0.5">
            <p className="truncate text-[0.72rem] font-semibold text-white">
              {userName ?? "Staff"}
            </p>
            <p className="truncate text-[0.62rem] text-[#8b9bb0]">{userEmail}</p>
          </div>
          {onSwitchOrg ? (
            <button
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-[0.72rem] font-medium text-[#a8b3c0] transition hover:bg-white/[0.05] hover:text-white"
              onClick={onSwitchOrg}
            >
              Switch shop
            </button>
          ) : null}
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[0.72rem] font-medium text-[#a8b3c0] transition hover:bg-white/[0.05] hover:text-white"
            onClick={onLogout}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
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
    hasCapability,
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
  const roles = useMemo(
    () => user?.roles ?? stationUser?.roles ?? [],
    [user?.roles, stationUser?.roles],
  );
  const permissions = useMemo(
    () => user?.permissions ?? stationUser?.permissions ?? [],
    [user?.permissions, stationUser?.permissions],
  );
  const modeLabel = modeBadge(commerceModes) || "POS";
  const pinSwitchEnabled =
    (boot?.tenant?.settings as { pos?: { pinSwitchEnabled?: boolean } } | null)
      ?.pos?.pinSwitchEnabled !== false;

  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  /** Refresh roles + permissions matrix after login / soft switch */
  useEffect(() => {
    if (!accessToken || pinLocked) return;
    void authApi
      .me()
      .then((me) => {
        if (!me?.id) return;
        const next = {
          id: me.id,
          email: me.email,
          fullName: me.fullName,
          roles: me.roles ?? [],
          permissions: me.permissions,
          storeId: me.storeId ?? me.locationId ?? me.primaryStoreId,
          tenantId:
            me.tenantId ??
            me.tenant?.id ??
            useAuthStore.getState().user?.tenantId ??
            "",
          pinSet: me.pinSet,
        };
        const s = useAuthStore.getState();
        if (s.user) {
          useAuthStore.setState({
            user: { ...s.user, ...next },
          });
        }
        if (s.stationUser && s.stationUser.id === me.id) {
          useAuthStore.setState({
            stationUser: { ...s.stationUser, ...next },
          });
        }
      })
      .catch(() => {
        /* offline / lock — ignore */
      });
  }, [accessToken, pinLocked]);

  /** Offline local-first: crypto unlock, connectivity ping, hydrate outbox, light pull */
  useEffect(() => {
    if (!accessToken || pinLocked || !user?.tenantId || !user.id) return;
    void unlockOfflineCrypto({
      tenantId: user.tenantId,
      deviceId: getDeviceId(),
      userId: user.id,
    });
    hydrateOfflinePendingCount();
    const stop = startConnectivityMonitor(30_000);
    return () => {
      stop();
    };
  }, [accessToken, pinLocked, user?.tenantId, user?.id]);

  useEffect(() => {
    if (!accessToken || pinLocked || !user?.tenantId) return;
    const locationId = useBranchStore.getState().currentLocationId;
    if (!locationId || !isServerReachable()) return;
    void flushOfflineQueue().then(() => hydrateOfflinePendingCount());
    void pullOfflineSnapshot({
      tenantId: user.tenantId,
      locationId,
      full: false,
    }).catch(() => undefined);
  }, [accessToken, pinLocked, user?.tenantId]);

  useEffect(() => {
    if (pinLocked || !user || !pinSwitchEnabled) return;
    if (user.pinSet === false) {
      setShowSetPin(true);
    }
  }, [user, pinLocked, pinSwitchEnabled]);

  useEffect(() => {
    if (pinLocked || !roles.length || isLoading) return;
    if (!canAccessPath(pathname, roles, permissions)) {
      const home = defaultHomeForRoles(roles, permissions);
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
    if (item?.capability && !hasCapability(item.capability)) {
      toast.message("Not enabled for this shop’s capabilities");
      router.replace("/dashboard");
      return;
    }
    if (item?.commerce && !hasMode(item.commerce)) {
      toast.message("Not enabled for this shop’s commerce modes");
      router.replace("/dashboard");
    }
  }, [
    pathname,
    roles,
    permissions,
    router,
    hasModule,
    hasMode,
    hasCapability,
    isLoading,
    pinLocked,
  ]);

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
    qc.clear();
    useBranchStore.getState().bindTenant(null);
    if (!identityToken) {
      toast.message("Sign in again to pick another shop");
      void logout();
      return;
    }
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
    onSwitchOrg: () => switchOrganization(),
    userName: acting?.fullName,
    userEmail: acting?.email,
    roles,
    permissions,
    productName,
    tagline,
    hasModule,
    hasMode,
    hasCapability,
    commerceModes,
    modeLabel,
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-[#eef1f5] text-[#0b1f33]">
      {pinLocked && stationToken ? (
        <StationPinLock open locationId={acting?.storeId} />
      ) : null}
      <SessionIdleWatcher />
      <InboxPopupListener />
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
      {/* Zoho dual dark nav: icon rail + secondary */}
      <aside className="app-shell-aside hidden h-dvh w-[17.5rem] shrink-0 flex-col md:flex print:hidden">
        <Suspense fallback={<div className="h-full bg-[#0a0e14]" />}>
          <SidebarBody {...sidebarProps} />
        </Suspense>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden print:overflow-visible">
        <header className="app-shell-mobile-header flex shrink-0 items-center justify-between border-b border-[#d9e0ea] bg-white px-4 py-3 md:hidden print:hidden">
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
          <div className="flex items-center gap-2">
            <BranchSelector className="hidden xs:inline-flex sm:inline-flex" />
            <button
              type="button"
              className="rounded-lg border border-[#d9e0ea] p-2 text-[#2c3e50]"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="hidden shrink-0 items-center justify-between gap-3 border-b border-[#d9e0ea] bg-white px-4 py-2 sm:px-6 md:flex lg:px-8 print:hidden">
          <p className="text-[0.75rem] text-[#5a6b7d]">
            Operating branch — sales, stock, and expenses use this location
          </p>
          <BranchSelector />
        </div>

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
                className="absolute top-0 left-0 flex h-full w-[min(19rem,92vw)] flex-col shadow-xl"
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
                  <Suspense fallback={<div className="h-full bg-[#0a0e14]" />}>
                    <SidebarBody
                      {...sidebarProps}
                      onNavigate={() => setOpen(false)}
                    />
                  </Suspense>
                </div>
              </motion.aside>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <main
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#eef1f5]",
            "[scrollbar-gutter:stable]",
            "print:overflow-visible print:bg-white print:h-auto print:max-h-none",
          )}
        >
          <div className="print:hidden">
            <OfflineStatusBanner />
          </div>
          <div
            className={cn(
              "document-print-root px-4 py-5 sm:px-6 sm:py-6 lg:px-8",
              "print:max-w-none print:px-0 print:py-0",
              wide ? "max-w-none" : "mx-auto w-full max-w-[72rem]",
            )}
          >
            {canAccessPath(pathname, roles, permissions) ? children : null}
          </div>
        </main>
      </div>
    </div>
  );
}
