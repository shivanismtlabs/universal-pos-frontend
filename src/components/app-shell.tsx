"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
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
  ChevronUp,
  ChevronRight,
  Home,
  Building2,
  Search,
  Bell,
  LayoutGrid,
  UtensilsCrossed,
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
  Clock,
  type LucideIcon,
} from "lucide-react";
import { cn, mediaUrl } from "@/lib/utils";
import { authApi, notifyApi } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { useBootstrap } from "@/lib/bootstrap";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { StationPinLock } from "@/components/station-pin-lock";
import { ShellEntitySearch } from "@/components/shell-entity-search";
import { BranchSelector } from "@/components/branch-selector";
import { OfflineStatusBanner } from "@/components/offline-status-banner";
import { SetupReturnBanner } from "@/components/setup-return-banner";
import { SessionIdleWatcher } from "@/components/session-idle-watcher";
import { InboxPopupListener } from "@/components/inbox-popup-listener";
import {
  UnsavedWorkGuard,
  guardedAction,
  guardedNavClick,
} from "@/components/unsaved-work-guard";
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
        href: "/inventory",
        label: "Stock levels",
        icon: Package,
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
    id: "dining",
    label: "Dining",
    railLabel: "Dining",
    icon: UtensilsCrossed,
    section: "Commerce",
    children: [
      {
        href: "/restaurant",
        label: "Floor dashboard",
        icon: UtensilsCrossed,
        capability: "TABLE",
      },
      {
        href: "/restaurant/tables",
        label: "Tables",
        icon: LayoutGrid,
        capability: "TABLE",
      },
      {
        href: "/restaurant/menu",
        label: "Menus",
        icon: BookOpen,
        capability: "TABLE",
      },
      {
        href: "/kitchen",
        label: "Kitchen / KOT",
        icon: ClipboardList,
        capability: "KOT",
      },
      {
        href: "/restaurant/reservations",
        label: "Reservations",
        icon: CalendarDays,
        capability: "DINING_RESERVATION",
      },
      {
        href: "/restaurant/tokens",
        label: "Tokens",
        icon: TicketPercent,
        capability: "TOKEN",
      },
      {
        href: "/restaurant/recipes",
        label: "Recipes",
        icon: BookOpen,
        capability: "RECIPE",
      },
      {
        href: "/restaurant/wastage",
        label: "Wastage",
        icon: Scale,
        capability: "WASTAGE",
      },
      {
        href: "/restaurant/food-cost",
        label: "Food cost",
        icon: Percent,
        capability: "RECIPE",
      },
      {
        href: "/restaurant/setup",
        label: "Dining setup",
        icon: Settings,
        capability: "TABLE",
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
        label: "Supplier directory",
        icon: Building2,
        commerce: "sale",
        module: "inventory",
      },
      {
        href: "/suppliers/new",
        label: "New supplier",
        icon: Building2,
        commerce: "sale",
        module: "inventory",
      },
      {
        href: "/suppliers/orders",
        label: "Purchase orders",
        icon: ClipboardList,
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
    id: "subscription",
    label: "Subscription",
    railLabel: "Plans",
    icon: TicketPercent,
    section: "Commerce",
    commerce: "subscription",
    children: [
      {
        href: "/customers?tab=memberships",
        label: "Memberships",
        icon: TicketPercent,
        commerce: "subscription",
        capability: "MEMBERSHIP",
      },
      {
        href: "/check-in",
        label: "Check-in",
        icon: CalendarDays,
        commerce: "subscription",
        capability: "CHECK_IN",
      },
      {
        href: "/reports/subscriptions",
        label: "Plans report",
        icon: FileLineChart,
        commerce: "subscription",
      },
      {
        href: "/returns?tab=subscription",
        label: "Cancel membership",
        icon: PackageCheck,
        commerce: "subscription",
      },
      {
        href: "/dashboard?tab=floors",
        label: "Membership floor",
        icon: LayoutGrid,
        commerce: "subscription",
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
        href: "/settings/units",
        label: "Units",
        icon: Scale,
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

  // Floor dashboard is `/restaurant` only — not Tables, Menus, Reservations.
  if (base === "/restaurant") {
    return pathname === "/restaurant";
  }

  // `/suppliers` directory only — not /suppliers/orders or /suppliers/new
  if (base === "/suppliers") {
    return pathname === "/suppliers";
  }

  if (base === "/suppliers/new") {
    return pathname === "/suppliers/new";
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
 * Light Untitled-style sidebar — expandable sections, readable on white.
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
  const router = useRouter();
  const [navQuery, setNavQuery] = useState("");
  const [search, setSearch] = useState("");
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

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  /** Collapsed by default so catalog nav gets more height */
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    setSearch(typeof window !== "undefined" ? window.location.search : "");
  }, [pathname]);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const g of groups) {
      if (g.href && isPathActive(pathname, g.href)) next[g.id] = true;
      else if (g.children.some((c) => isPathActive(pathname, c.href)))
        next[g.id] = true;
    }
    if (Object.keys(next).length) {
      setOpenGroups((prev) => ({ ...prev, ...next }));
    }
  }, [pathname, groups]);

  useEffect(() => {
    for (const g of groups) {
      for (const c of g.children) {
        if (c.folder && isLeafActive(pathname, search, c.href)) {
          setOpenFolders((prev) => ({ ...prev, [c.folder!]: true }));
        }
      }
    }
  }, [pathname, search, groups]);

  useEffect(() => {
    for (const g of groups) {
      const hrefs = g.href ? [g.href] : g.children.map((c) => c.href);
      hrefs.forEach((href) => {
        try {
          router.prefetch(href);
        } catch {
          /* ignore */
        }
      });
    }
  }, [groups, router]);

  const q = navQuery.trim().toLowerCase();

  function toggleGroup(id: string) {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleFolder(name: string) {
    setOpenFolders((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  function filteredChildren(g: NavGroup & { children: NavLeaf[] }) {
    if (!q) return g.children;
    return g.children.filter((c) => c.label.toLowerCase().includes(q));
  }

  function groupExpanded(g: NavGroup & { children: NavLeaf[] }) {
    if (q && filteredChildren(g).length) return true;
    if (openGroups[g.id] !== undefined) return openGroups[g.id];
    return g.children.some((c) => isLeafActive(pathname, search, c.href));
  }

  const unreadQ = useQuery({
    queryKey: ["notify-unread"],
    queryFn: () => notifyApi.unreadCount(),
    refetchInterval: 12_000,
    refetchOnWindowFocus: true,
  });
  const unread = unreadQ.data?.unreadCount ?? 0;
  const logoSrc = mediaUrl(boot?.tenant?.branding?.logoUrl);
  const brandInitial = (productName.trim()[0] || "P").toUpperCase();

  const linkClass = (active: boolean) =>
    cn(
      "flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[0.8125rem] font-medium transition",
      active
        ? "bg-[#eef2ff] font-semibold text-[#1a56db]"
        : "text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0b1f33]",
    );

  const subLinkClass = (active: boolean) =>
    cn(
      "flex items-center gap-2 rounded-lg py-2 pr-2.5 pl-7 text-[0.8125rem] font-medium transition",
      active
        ? "bg-[#eef2ff] font-semibold text-[#1a56db]"
        : "text-[#475569] hover:bg-[#f8fafc] hover:text-[#0b1f33]",
    );

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[#fafbfc] text-[#0b1f33] print:bg-white">
      <div className="shrink-0 border-b border-[#e8ecf1] px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt=""
              className="h-9 w-9 shrink-0 rounded-lg border border-[#e2e8f0] bg-white object-contain p-0.5"
            />
          ) : (
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#1a56db] text-sm font-bold text-white">
              {brandInitial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[#0b1f33]">
              Universal POS
            </p>
            <p className="truncate text-[0.72rem] text-[#64748b]">
              {productName}
            </p>
          </div>
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
          <input
            id="shell-nav-search"
            type="search"
            placeholder="Search menu, product, customer…"
            value={navQuery}
            onChange={(e) => setNavQuery(e.target.value)}
            className="h-9 w-full rounded-lg border border-[#e2e8f0] bg-white pr-2 pl-9 text-[0.8125rem] text-[#0b1f33] outline-none placeholder:text-[#94a3b8] focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/15"
          />
        </div>
        <ShellEntitySearch
          query={navQuery}
          onNavigate={() => {
            setNavQuery("");
            onNavigate?.();
          }}
        />
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3 [scrollbar-width:thin]">
        {groups.map((g) => {
          const Icon = g.icon;
          if (g.href) {
            const active = isLeafActive(pathname, search, g.href);
            return (
              <Link
                key={g.id}
                href={g.href}
                onClick={(e) => guardedNavClick(e, g.href!, onNavigate)}
                className={cn(linkClass(active), "mb-1")}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                <span className="min-w-0 flex-1 truncate">{g.label}</span>
              </Link>
            );
          }

          const kids = filteredChildren(g);
          if (q && !kids.length) return null;
          const expanded = groupExpanded(g);
          const groupActive = kids.some((c) =>
            isLeafActive(pathname, search, c.href),
          );

          const folderOrder: string[] = [];
          for (const c of kids) {
            const f = c.folder ?? "";
            if (f && !folderOrder.includes(f)) folderOrder.push(f);
          }
          const hasFolders = folderOrder.length > 0;
          const unfoldered = kids.filter((c) => !c.folder);

          return (
            <div key={g.id} className="mb-1">
              <button
                type="button"
                onClick={() => toggleGroup(g.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-[0.8125rem] transition",
                  groupActive && !expanded
                    ? "bg-[#f1f5f9] font-semibold text-[#0b1f33]"
                    : "text-[#334155] hover:bg-[#f1f5f9]",
                )}
              >
                <Icon className="h-4 w-4 shrink-0 text-[#475569]" strokeWidth={2} />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {g.label}
                </span>
                {expanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-[#94a3b8]" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#94a3b8]" />
                )}
              </button>

              {expanded ? (
                <div className="mt-1 space-y-0.5 pb-1.5">
                  {g.section ? (
                    <p className="px-3 pt-1.5 pb-1 text-[0.65rem] font-semibold tracking-wide text-[#94a3b8] uppercase">
                      {g.section}
                    </p>
                  ) : null}

                  {hasFolders
                    ? folderOrder.map((folder) => {
                        const folderKids = kids.filter(
                          (c) => c.folder === folder,
                        );
                        const folderOpen =
                          openFolders[folder] ??
                          folderKids.some((c) =>
                            isLeafActive(pathname, search, c.href),
                          );
                        return (
                          <div key={folder} className="mb-1">
                            <button
                              type="button"
                              onClick={() => toggleFolder(folder)}
                              className="flex w-full items-center gap-2 rounded-lg py-2 pr-2.5 pl-7 text-[0.8125rem] font-medium text-[#475569] hover:bg-[#f8fafc]"
                            >
                              <Folder className="h-3.5 w-3.5 shrink-0 opacity-70" />
                              <span className="min-w-0 flex-1 truncate text-left">
                                {folder}
                              </span>
                              {folderOpen ? (
                                <ChevronDown className="h-3.5 w-3.5 text-[#94a3b8]" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-[#94a3b8]" />
                              )}
                            </button>
                            {folderOpen
                              ? folderKids.map((c) => {
                                  const active = isLeafActive(
                                    pathname,
                                    search,
                                    c.href,
                                  );
                                  return (
                                    <Link
                                      key={`${c.href}:${c.label}`}
                                      href={c.href}
                                      onClick={(e) =>
                                        guardedNavClick(e, c.href, onNavigate)
                                      }
                                      className={subLinkClass(active)}
                                    >
                                      {active ? (
                                        <span className="size-1.5 shrink-0 rounded-full bg-[#1a56db]" />
                                      ) : (
                                        <span className="size-1.5 shrink-0 rounded-full bg-transparent" />
                                      )}
                                      <span className="truncate">{c.label}</span>
                                    </Link>
                                  );
                                })
                              : null}
                          </div>
                        );
                      })
                    : null}

                  {(hasFolders ? unfoldered : kids).map((c) => {
                    const CIcon = c.icon;
                    const active = isLeafActive(pathname, search, c.href);
                    return (
                      <Link
                        key={`${c.href}:${c.label}`}
                        href={c.href}
                        onClick={(e) =>
                          guardedNavClick(e, c.href, onNavigate)
                        }
                        className={subLinkClass(active)}
                      >
                        {active ? (
                          <span className="size-1.5 shrink-0 rounded-full bg-[#1a56db]" />
                        ) : (
                          <CIcon
                            className="h-3.5 w-3.5 shrink-0 opacity-60"
                            strokeWidth={2}
                          />
                        )}
                        <span className="truncate">{c.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}

        <div className="my-3 border-t border-[#e8ecf1]" />

        <Link
          href="/notifications"
          onClick={(e) => guardedNavClick(e, "/notifications", onNavigate)}
          className={cn(
            linkClass(pathname.startsWith("/notifications")),
            "relative",
          )}
        >
          <Bell className="h-4 w-4 shrink-0" strokeWidth={2} />
          <span className="min-w-0 flex-1 truncate">Notifications</span>
          {unread > 0 ? (
            <span className="rounded-full bg-[#dc2626] px-1.5 py-0.5 text-[0.65rem] font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Link>
      </nav>

      <div className="shrink-0 border-t border-[#e8ecf1] bg-white">
        <button
          type="button"
          onClick={() => setAccountOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#f8fafc]"
          aria-expanded={accountOpen}
          title={accountOpen ? "Hide account" : "Show account"}
        >
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#e2e8f0] text-[0.65rem] font-semibold text-[#475569]">
            {(userName?.trim()?.[0] || "U").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.75rem] font-semibold text-[#0b1f33]">
              {userName ?? "Staff"}
            </p>
            {!accountOpen ? (
              <p className="truncate text-[0.65rem] text-[#94a3b8]">Account</p>
            ) : null}
          </div>
          {accountOpen ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-[#94a3b8]" />
          ) : (
            <ChevronUp className="h-4 w-4 shrink-0 text-[#94a3b8]" />
          )}
        </button>

        {accountOpen ? (
          <div className="space-y-2 border-t border-[#eef1f4] px-3 pt-2 pb-3">
            {userEmail ? (
              <p className="truncate px-0.5 text-[0.68rem] text-[#94a3b8]">
                {userEmail}
              </p>
            ) : null}

            <div className="grid gap-0.5">
              {onSwitchOrg ? (
                <button
                  type="button"
                  className="w-full rounded-lg px-2 py-2 text-left text-[0.75rem] font-medium text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0b1f33]"
                  onClick={onSwitchOrg}
                >
                  Switch shop
                </button>
              ) : null}
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[0.75rem] font-medium text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0b1f33]"
                onClick={onLogout}
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function HeaderClock({
  locale = "en-IN",
  timeZone,
  compact = false,
}: {
  locale?: string;
  timeZone?: string;
  compact?: boolean;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const opts: Intl.DateTimeFormatOptions = timeZone ? { timeZone } : {};
  const time = now
    ? now.toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: compact ? undefined : "2-digit",
        hour12: true,
        ...opts,
      })
    : compact
      ? "--:--"
      : "--:--:--";
  const date = now
    ? now.toLocaleDateString(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
        ...opts,
      })
    : "";

  return (
    <div
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[#d9e0ea] bg-white px-2 py-1 tabular-nums text-[#0b1f33]"
      title={date ? (timeZone ? `${date} · ${time} · ${timeZone}` : `${date} · ${time}`) : time}
    >
      <Clock className="size-3.5 shrink-0 text-[#1a56db]" aria-hidden />
      <div className="leading-tight">
        <p className="text-[0.75rem] font-semibold">{time}</p>
        {!compact && date ? (
          <p className="text-[0.6rem] text-[#5a6b7d]">{date}</p>
        ) : null}
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
    locale,
    hasModule,
    hasMode,
    hasCapability,
    commerceModes,
    isLoading,
    isError,
    data: boot,
  } = useBootstrap();
  const [open, setOpen] = useState(false);
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

  /** Offline local-first: run after first paint so nav stays snappy */
  useEffect(() => {
    if (!accessToken || pinLocked || !user?.tenantId || !user.id) return;
    const idle =
      typeof window !== "undefined" && "requestIdleCallback" in window
        ? window.requestIdleCallback.bind(window)
        : (cb: () => void) => window.setTimeout(cb, 1200);
    const cancel =
      typeof window !== "undefined" && "cancelIdleCallback" in window
        ? window.cancelIdleCallback.bind(window)
        : (id: number) => window.clearTimeout(id);
    const handle = idle(() => {
      void unlockOfflineCrypto({
        tenantId: user.tenantId!,
        deviceId: getDeviceId(),
        userId: user.id,
      }).catch(() => undefined);
      hydrateOfflinePendingCount();
    });
    const stop = startConnectivityMonitor(45_000);
    return () => {
      cancel(handle as number);
      stop();
    };
  }, [accessToken, pinLocked, user?.tenantId, user?.id]);

  useEffect(() => {
    if (!accessToken || pinLocked || !user?.tenantId) return;
    const idle =
      typeof window !== "undefined" && "requestIdleCallback" in window
        ? window.requestIdleCallback.bind(window)
        : (cb: () => void) => window.setTimeout(cb, 2500);
    const cancel =
      typeof window !== "undefined" && "cancelIdleCallback" in window
        ? window.cancelIdleCallback.bind(window)
        : (id: number) => window.clearTimeout(id);
    const handle = idle(() => {
      const locationId = useBranchStore.getState().currentLocationId;
      if (!locationId || !isServerReachable()) return;
      void flushOfflineQueue()
        .then(() => hydrateOfflinePendingCount())
        .catch(() => undefined);
      void pullOfflineSnapshot({
        tenantId: user.tenantId,
        locationId,
        full: false,
      }).catch(() => undefined);
    });
    return () => cancel(handle as number);
  }, [accessToken, pinLocked, user?.tenantId]);

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
    guardedAction(() => {
      qc.clear();
      useBranchStore.getState().bindTenant(null);
      if (!identityToken) {
        toast.message("Sign in again to pick another shop");
        void logout();
        return;
      }
      useAuthStore.getState().clearTenantSession();
      router.replace("/organizations");
    });
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
  const logoSrc = mediaUrl(boot?.tenant?.branding?.logoUrl);

  const acting = user ?? stationUser;
  const sidebarProps = {
    onLogout: () => guardedAction(() => void logout()),
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
      <UnsavedWorkGuard />
      {/* Light expandable sidebar */}
      <aside className="app-shell-aside hidden h-dvh w-[17.5rem] shrink-0 flex-col border-r border-[#e2e8f0] md:flex print:hidden">
        <Suspense fallback={<div className="h-full bg-[#fafbfc]" />}>
          <SidebarBody {...sidebarProps} />
        </Suspense>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden print:overflow-visible">
        <header className="app-shell-mobile-header flex shrink-0 items-center justify-between border-b border-[#d9e0ea] bg-white px-4 py-3 md:hidden print:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            {logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoSrc}
                alt=""
                className="h-8 w-8 shrink-0 rounded-md border border-[#e2e8f0] bg-white object-contain p-0.5"
              />
            ) : (
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#1a56db] text-xs font-semibold text-white">
                {initial}
              </div>
            )}
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
            <HeaderClock
              compact
              locale={locale}
              timeZone={boot?.tenant?.timezone}
            />
            <BranchSelector className="hidden xs:inline-flex sm:inline-flex" />
            <button
              type="button"
              className="rounded-md border border-[#d9e0ea] bg-white px-2 py-1 text-[0.7rem] font-semibold text-[#334155] hover:bg-[#f8fafc]"
              onClick={switchOrganization}
            >
              Switch organization
            </button>
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
          <div className="flex items-center gap-2">
            <HeaderClock
              locale={locale}
              timeZone={boot?.tenant?.timezone}
            />
            <BranchSelector />
            <button
              type="button"
              className="rounded-md border border-[#d9e0ea] bg-white px-2.5 py-1 text-[0.75rem] font-semibold text-[#334155] hover:bg-[#f8fafc]"
              onClick={switchOrganization}
            >
              Switch organization
            </button>
          </div>
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
                  <Suspense fallback={<div className="h-full bg-[#fafbfc]" />}>
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
            <div className="print:hidden">
              <Suspense fallback={null}>
                <SetupReturnBanner />
              </Suspense>
            </div>
            {canAccessPath(pathname, roles, permissions) ? children : null}
          </div>
        </main>
      </div>
    </div>
  );
}
