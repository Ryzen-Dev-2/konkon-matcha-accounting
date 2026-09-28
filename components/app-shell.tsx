"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CircleHelp,
  CalendarClock,
  ClipboardList,
  FileSearch2,
  FileText,
  Landmark,
  Laptop,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MapPinned,
  Menu,
  PackageCheck,
  ReceiptText,
  Settings,
  ShoppingBasket,
  ShoppingCart,
  Sprout,
  TicketPercent,
  Store,
  Truck,
  Users,
  WalletCards,
  X,
  HandCoins,
  Target,
  Tags,
  BellRing,
  BadgeDollarSign,
  Combine,
  ShieldAlert,
} from "lucide-react";
import type { SessionUser } from "@/lib/types";
import { BusinessProvider } from "@/components/business-context";
import type { BusinessSettings } from "@/lib/business-settings";
import { countryProfile } from "@/lib/international";
import { hasPermission, type Permission } from "@/lib/rbac";
import { PlatformStatusMonitor } from "@/components/platform-status-monitor";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: Permission;
};

const nav: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  {
    href: "/pos",
    label: "Point of sale",
    icon: ShoppingBasket,
    permission: "pos.sell",
  },
  {
    href: "/counters",
    label: "Counters",
    icon: Store,
    permission: "counters.read",
  },
  {
    href: "/coupons",
    label: "Coupons",
    icon: TicketPercent,
    permission: "coupons.read",
  },
  {
    href: "/payments",
    label: "Payment methods",
    icon: WalletCards,
    permission: "payments.read",
  },
  {
    href: "/receipts",
    label: "Receipts",
    icon: ReceiptText,
    permission: "receipts.read",
  },
  {
    href: "/members",
    label: "Members",
    icon: Users,
    permission: "members.read",
  },
  {
    href: "/inventory",
    label: "Inventory",
    icon: Boxes,
    permission: "inventory.read",
  },
  {
    href: "/batches",
    label: "Batch & expiry",
    icon: CalendarClock,
    permission: "inventory.read",
  },
  {
    href: "/transfers",
    label: "Stock transfers",
    icon: ArrowLeftRight,
    permission: "inventory.read",
  },
  {
    href: "/procurement",
    label: "Purchasing & payables",
    icon: PackageCheck,
    permission: "purchasing.read",
  },
  {
    href: "/expenses",
    label: "Expense claims",
    icon: HandCoins,
    permission: "expenses.read",
  },
  {
    href: "/payroll",
    label: "Payroll",
    icon: BadgeDollarSign,
    permission: "payroll.read",
  },
  {
    href: "/accounting",
    label: "Accounting",
    icon: BookOpen,
    permission: "accounting.read",
  },
  {
    href: "/bank-reconciliation",
    label: "Bank reconciliation",
    icon: Landmark,
    permission: "accounting.read",
  },
  {
    href: "/bank-connections",
    label: "Live bank feeds",
    icon: Landmark,
    permission: "accounting.read",
  },
  {
    href: "/fixed-assets",
    label: "Fixed assets",
    icon: Laptop,
    permission: "accounting.read",
  },
  {
    href: "/budgets",
    label: "Budgets & variance",
    icon: Target,
    permission: "budgets.read",
  },
  {
    href: "/dimensions",
    label: "Cost centres & projects",
    icon: Tags,
    permission: "reports.read",
  },
  {
    href: "/period-close",
    label: "Month-end close",
    icon: LockKeyhole,
    permission: "accounting.read",
  },
  {
    href: "/quotations",
    label: "Quotations",
    icon: ClipboardList,
    permission: "invoices.read",
  },
  {
    href: "/delivery-orders",
    label: "Delivery orders",
    icon: Truck,
    permission: "invoices.read",
  },
  {
    href: "/invoices",
    label: "Invoices",
    icon: FileText,
    permission: "invoices.read",
  },
  {
    href: "/commerce",
    label: "Online orders",
    icon: ShoppingCart,
    permission: "commerce.read",
  },
  {
    href: "/customers",
    label: "Customer accounts",
    icon: CircleDollarSign,
    permission: "invoices.read",
  },
  {
    href: "/reports",
    label: "Reports",
    icon: BarChart3,
    permission: "reports.read",
  },
  {
    href: "/consolidation",
    label: "Group consolidation",
    icon: Combine,
    permission: "reports.read",
  },
  {
    href: "/reviews",
    label: "Exception reviews",
    icon: FileSearch2,
    permission: "reviews.read",
  },
  { href: "/help", label: "Help & manual", icon: CircleHelp },
  {
    href: "/team",
    label: "Team & access",
    icon: Users,
    permission: "team.read",
  },
  {
    href: "/locations",
    label: "Locations & franchises",
    icon: MapPinned,
    permission: "settings.read",
  },
  {
    href: "/integrations",
    label: "Messaging integrations",
    icon: BellRing,
    permission: "owner.control",
  },
  {
    href: "/trust-center",
    label: "Trust & safety",
    icon: ShieldAlert,
    permission: "owner.control",
  },
  {
    href: "/settings",
    label: "Workspace",
    icon: Settings,
    permission: "settings.read",
  },
];

export function AppShell({
  user,
  business,
  platformRestriction,
  children,
}: {
  user: SessionUser;
  business: BusinessSettings;
  platformRestriction?: { status: string; reason: string } | null;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleNav = nav.filter(
    (item) => !item.permission || hasPermission(user.role, item.permission),
  );
  const current =
    visibleNav.find(
      (item) => path === item.href || path.startsWith(`${item.href}/`),
    )?.label || "Kōn-Kōn Ledger";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const country = countryProfile(business.countryCode);
  return (
    <BusinessProvider profile={business}>
      <PlatformStatusMonitor role={user.role} initialStatus={platformRestriction ? { ...platformRestriction, managed: true } : null} />
      <div
        className={`app-frame theme-${business.workspaceTheme.toLowerCase()} ${collapsed ? "sidebar-collapsed" : ""}`}
      >
        <button
          className="mobile-menu"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
        >
          <Menu />
        </button>
        {mobileOpen ? (
          <button
            className="mobile-scrim"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
        ) : null}
        <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
          <div className="brand-lockup">
            <div className="brand-mark">
              {business.workspaceLogoDataUrl
                ? <img src={business.workspaceLogoDataUrl} alt={`${business.businessName} logo`} />
                : <Sprout size={21} />}
            </div>
            <div className="brand-words">
              <strong>
                {business.franchiseBrand || business.businessName}
              </strong>
              <span>
                {business.organizationType === "FRANCHISEE"
                  ? `Franchise · ${business.franchiseCode}`
                  : "Enterprise ledger"}
              </span>
            </div>
            <button
              className="mobile-close"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X size={19} />
            </button>
          </div>
          <div className="sidebar-rule">
            <span>MENU</span>
          </div>
          <nav aria-label="Main navigation">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const active =
                path === item.href || path.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "active" : ""}
                  title={collapsed ? item.label : undefined}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon size={19} strokeWidth={1.7} />
                  <span>{item.label}</span>
                  {active ? <i /> : null}
                </Link>
              );
            })}
          </nav>
          <div className="sidebar-bottom">
            <div className="user-chip">
              <div className="avatar">
                {user.fullName
                  .split(/\s+/)
                  .map((word) => word[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div>
                <strong>{user.fullName}</strong>
                <span>{user.role}</span>
              </div>
              <button onClick={logout} aria-label="Sign out" title="Sign out">
                <LogOut size={17} />
              </button>
            </div>
            <button
              className="collapse-button"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <ChevronRight size={17} />
              ) : (
                <>
                  <ChevronLeft size={17} />
                  <span>Collapse</span>
                </>
              )}
            </button>
          </div>
        </aside>
        <div className="app-main">
          <header className="topbar">
            <div>
              <span className="topbar-kicker">OPERATIONS /</span>
              <strong>{current}</strong>
            </div>
            <div className="topbar-meta">
              <span className="live-dot" />
              LIVE LEDGER <i />{" "}
              <span>
                {new Intl.DateTimeFormat(business.locale, {
                  weekday: "short",
                  day: "2-digit",
                  month: "short",
                  timeZone: business.timeZone,
                }).format(new Date())}
              </span>
            </div>
          </header>
          <main>{children}</main>
          <footer className="app-footer">
            <span>
              {business.businessName.toUpperCase()} ·{" "}
              {country.name.toUpperCase()}
            </span>
            <span>
              {business.currency} · {business.timeZone}
            </span>
          </footer>
        </div>
      </div>
    </BusinessProvider>
  );
}
