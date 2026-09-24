import { NavLink } from "react-router-dom";
import { Home, Search, PlusCircle, MessageCircle, User } from "lucide-react";
import clsx from "clsx";
import { useLocationStore } from "@/stores/location";

/** Bottom tab bar on small screens (app-like PWA navigation). */
export function MobileNav() {
  const loc = useLocationStore((s) => s.location);
  const items = [
    { to: "/", icon: Home, label: "Home", end: true },
    { to: loc ? `/rent/${loc.citySlug}` : "/search", icon: Search, label: "Explore" },
    { to: "/dashboard/listings/new", icon: PlusCircle, label: "List" },
    { to: "/dashboard/messages", icon: MessageCircle, label: "Inbox" },
    { to: "/dashboard", icon: User, label: "Account", end: true },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="grid grid-cols-5">
        {items.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={label} to={to} end={end} className={({ isActive }) => clsx("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", isActive ? "text-brand-600" : "text-slate-500")}>
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
