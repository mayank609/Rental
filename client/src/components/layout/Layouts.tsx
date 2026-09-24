import { Suspense } from "react";
import { NavLink, Outlet } from "react-router-dom";
import clsx from "clsx";
import {
  LayoutDashboard, Package, CalendarCheck, CalendarDays, MessageCircle, Wallet, Heart, Bell, Settings, Crown, AlertTriangle, BarChart3,
  Users, ShieldCheck, Gavel, CreditCard, Banknote, Flag, SlidersHorizontal, FolderTree, Map, ScrollText, FileText, Building2,
} from "lucide-react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { MobileNav } from "./MobileNav";
import { OfflineBanner } from "./OfflineBanner";
import { PageLoader } from "../ui";
import { useAuth } from "@/stores/auth";

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <OfflineBanner />
      <Header />
      <main className="flex-1">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <MobileNav />
    </div>
  );
}

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; end?: boolean };

function SideNav({ items, title }: { items: NavItem[]; title?: string }) {
  return (
    <aside className="hidden w-60 shrink-0 lg:block">
      <div className="sticky top-20 space-y-0.5">
        {title && <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>}
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => clsx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition", isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")}>
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </div>
    </aside>
  );
}

function MobileSubNav({ items }: { items: NavItem[] }) {
  return (
    <div className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 lg:hidden">
      {items.map(({ to, label, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => clsx("chip shrink-0", isActive && "chip-active")}>
          {label}
        </NavLink>
      ))}
    </div>
  );
}

export const DASHBOARD_NAV: NavItem[] = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/dashboard/rentals", label: "My rentals", icon: CalendarDays },
  { to: "/dashboard/bookings", label: "Booking requests", icon: CalendarCheck },
  { to: "/dashboard/listings", label: "My listings", icon: Package },
  { to: "/dashboard/messages", label: "Messages", icon: MessageCircle },
  { to: "/dashboard/earnings", label: "Earnings & payouts", icon: Wallet },
  { to: "/dashboard/wishlist", label: "Wishlist", icon: Heart },
  { to: "/dashboard/notifications", label: "Notifications", icon: Bell },
  { to: "/dashboard/disputes", label: "Disputes", icon: AlertTriangle },
  { to: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/dashboard/pro", label: "Owner Pro", icon: Crown },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function DashboardLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <OfflineBanner />
      <Header />
      <div className="container-page flex flex-1 gap-8 py-6 pb-24 md:pb-10">
        <SideNav items={DASHBOARD_NAV} />
        <main className="min-w-0 flex-1">
          <MobileSubNav items={DASHBOARD_NAV} />
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <MobileNav />
    </div>
  );
}

export const ADMIN_NAV: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/analytics", label: "City analytics", icon: Map },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/kyc", label: "KYC queue", icon: ShieldCheck },
  { to: "/admin/listings", label: "Listings", icon: Package },
  { to: "/admin/bookings", label: "Bookings", icon: CalendarCheck },
  { to: "/admin/disputes", label: "Disputes", icon: Gavel },
  { to: "/admin/payments", label: "Payments & refunds", icon: CreditCard },
  { to: "/admin/payouts", label: "Payouts", icon: Banknote },
  { to: "/admin/trust", label: "Reports & flags", icon: Flag },
  { to: "/admin/settings", label: "Fees & policies", icon: SlidersHorizontal },
  { to: "/admin/categories", label: "Categories", icon: FolderTree },
  { to: "/admin/cities", label: "Cities", icon: Building2 },
  { to: "/admin/reconciliation", label: "Reconciliation", icon: FileText },
  { to: "/admin/audit", label: "Audit log", icon: ScrollText },
];

export function AdminLayout() {
  const { user } = useAuth();
  return (
    <div className="flex min-h-screen flex-col bg-slate-100/60">
      <OfflineBanner />
      <Header />
      <div className="container-page flex flex-1 gap-8 py-6 pb-24 md:pb-10">
        <SideNav items={ADMIN_NAV} title={`Admin · ${user?.role === "ADMIN" ? "Administrator" : "Support"}`} />
        <main className="min-w-0 flex-1">
          <MobileSubNav items={ADMIN_NAV} />
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
