"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  LayoutDashboard,
  Users,
  Shirt,
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
  ShoppingBag,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";
import { authApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  canAccessPath,
  defaultHomeForRoles,
  ROUTE_ROLES,
} from "@/lib/roles";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

const counterNav: NavItem[] = [
  { href: "/dashboard", label: "Floor", icon: LayoutDashboard },
  { href: "/pos", label: "Terminal", icon: CreditCard },
  { href: "/returns", label: "Returns desk", icon: PackageCheck },
];

const studioNav: NavItem[] = [
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/appointments", label: "Fittings", icon: CalendarDays },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/parties", label: "Parties", icon: UsersRound },
  { href: "/notify", label: "WhatsApp", icon: MessageCircle },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/staff", label: "Staff", icon: UserCog },
];

const catalogNav: NavItem[] = [
  { href: "/inventory", label: "Inventory", icon: Shirt },
  { href: "/retail", label: "Retail", icon: ShoppingBag },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/plan", label: "Plan", icon: CreditCard },
];

function filterNav(items: NavItem[], roles: string[]) {
  return items.filter((item) => {
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
    <div className="mt-4 first:mt-3">
      <p className="px-3 pb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[#9ca3af]">
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
                "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-[#111827] text-white shadow-sm"
                  : "text-[#4b5563] hover:bg-[#ecfdf8] hover:text-[#0f766e]",
              )}
            >
              {active ? (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-xl bg-[#111827]"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              ) : null}
              <Icon className="relative z-10 h-4 w-4 opacity-90" />
              <span className="relative z-10">{item.label}</span>
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
}: {
  onNavigate?: () => void;
  roles: string[];
}) {
  return (
    <nav className="scroll-soft mt-1 flex flex-1 flex-col overflow-y-auto px-3 pb-2">
      <NavSection
        title="Counter"
        items={filterNav(counterNav, roles)}
        onNavigate={onNavigate}
      />
      <NavSection
        title="Studio"
        items={filterNav(studioNav, roles)}
        onNavigate={onNavigate}
      />
      <NavSection
        title="Catalog"
        items={filterNav(catalogNav, roles)}
        onNavigate={onNavigate}
      />
    </nav>
  );
}

function SidebarBody({
  onNavigate,
  onLogout,
  userName,
  userEmail,
  roles,
}: {
  onNavigate?: () => void;
  onLogout: () => void;
  userName?: string;
  userEmail?: string;
  roles: string[];
}) {
  return (
    <>
      <div className="px-5 pb-4 pt-6">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#ecfdf8] text-sm font-bold text-[#0f766e]">
            T
          </div>
          <div>
            <p className="display text-lg leading-none">Tuxedo</p>
            <p className="mt-1 text-[0.68rem] font-medium text-[#6b7280]">
              Formal rental POS
            </p>
          </div>
        </div>
      </div>
      <div className="mx-5 hairline" />
      <NavLinks onNavigate={onNavigate} roles={roles} />
      <div className="mt-auto border-t border-[#e5e7eb] px-4 py-4">
        <div className="rounded-xl bg-[#f6f7f9] px-3 py-3">
          <p className="truncate text-sm font-semibold text-[#111827]">
            {userName ?? "Staff"}
          </p>
          <p className="truncate text-xs text-[#6b7280]">{userEmail}</p>
          {roles.length ? (
            <p className="mt-1 truncate text-[0.65rem] font-medium tracking-wide text-[#0f766e] uppercase">
              {roles.join(" · ")}
            </p>
          ) : null}
        </div>
        <Button variant="secondary" className="mt-3 w-full" onClick={onLogout}>
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const [open, setOpen] = useState(false);
  const wide = pathname === "/pos" || pathname.startsWith("/pos/");
  const roles = user?.roles ?? [];

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!roles.length) return;
    if (!canAccessPath(pathname, roles)) {
      const home = defaultHomeForRoles(roles);
      toast.error("You don’t have access to that page");
      router.replace(home);
    }
  }, [pathname, roles, router]);

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
      toast.success("Signed out");
      router.replace("/login");
    }
  }

  return (
    <div className="min-h-dvh bg-[#f6f7f9] text-[#111827]">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[#e5e7eb] bg-white/90 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#ecfdf8] text-xs font-bold text-[#0f766e]">
            T
          </div>
          <div>
            <p className="display text-base leading-none">Tuxedo</p>
            <p className="mt-0.5 text-[0.6rem] text-[#6b7280]">POS</p>
          </div>
        </div>
        <button
          type="button"
          className="rounded-lg border border-[#e5e7eb] p-2"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      <div className="md:flex">
        <aside className="hidden min-h-dvh w-60 shrink-0 flex-col border-r border-[#e5e7eb] bg-white md:flex">
          <SidebarBody
            onLogout={() => void logout()}
            userName={user?.fullName}
            userEmail={user?.email}
            roles={roles}
          />
        </aside>

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
                className="absolute inset-0 bg-black/40"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              />
              <motion.aside
                className="absolute top-0 left-0 flex h-full w-[min(18rem,86vw)] flex-col bg-white"
                initial={{ x: -24, opacity: 0.6 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -16, opacity: 0 }}
              >
                <div className="flex justify-end p-3">
                  <button
                    type="button"
                    className="rounded-lg border border-[#e5e7eb] p-2"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <SidebarBody
                  onNavigate={() => setOpen(false)}
                  onLogout={() => void logout()}
                  userName={user?.fullName}
                  userEmail={user?.email}
                  roles={roles}
                />
              </motion.aside>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <main
          className={cn(
            "min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6",
            wide ? "max-w-none" : "mx-auto w-full max-w-6xl",
          )}
        >
          {canAccessPath(pathname, roles) ? children : null}
        </main>
      </div>
    </div>
  );
}
