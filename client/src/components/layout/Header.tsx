import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ChevronDown, LayoutDashboard, LogOut, MapPin, MessageCircle, Plus, Search, Settings, Shield, Heart } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/stores/auth";
import { useLocationStore } from "@/stores/location";
import { api } from "@/lib/api";
import { useSocketEvent } from "@/hooks/useSocketEvent";
import { LocationPicker } from "../LocationPicker";
import { Avatar, ButtonLink } from "../ui";
import toast from "react-hot-toast";
import type { Notification } from "@/lib/types";

export const PLATFORM_NAME = import.meta.env.VITE_PLATFORM_NAME ?? "RentNest";

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={clsx("flex items-center gap-2 font-extrabold tracking-tight text-slate-900", className)} aria-label={`${PLATFORM_NAME} home`}>
      <img src="/favicon.svg" alt="" className="h-8 w-8" />
      <span className="text-lg max-[400px]:sr-only">{PLATFORM_NAME}</span>
    </Link>
  );
}

export function useUnreadCounts() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const notifications = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: async () => (await api.get("/users/me/notifications", { params: { unread: true } })).data.unread as number,
    enabled: !!user,
    refetchInterval: 120_000,
  });
  const messages = useQuery({
    queryKey: ["chat", "unread"],
    queryFn: async () => (await api.get("/chat/unread-count")).data.count as number,
    enabled: !!user,
    refetchInterval: 120_000,
  });
  useSocketEvent<Notification>("notification", (n) => {
    qc.invalidateQueries({ queryKey: ["notifications"] });
    if (n.type !== "message.new") toast(n.title, { icon: "🔔" });
  });
  useSocketEvent("chat:message", () => qc.invalidateQueries({ queryKey: ["chat", "unread"] }));
  return { notifications: notifications.data ?? 0, messages: messages.data ?? 0 };
}

export function Header() {
  const { user, logout, isStaff } = useAuth();
  const location = useLocationStore((s) => s.location);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  const unread = useUnreadCounts();

  useEffect(() => {
    const close = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenuOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    navigate(location ? `/rent/${location.citySlug}?${params}` : `/search?${params}`);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="container-page flex h-16 items-center gap-3">
        <Logo />
        <button onClick={() => setPickerOpen(true)} className="ml-1 flex min-w-0 max-w-[45vw] items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm hover:bg-slate-100 sm:max-w-[220px]" aria-label="Change location">
          <MapPin className="h-4 w-4 shrink-0 text-brand-600" />
          <span className="truncate font-semibold text-slate-800">{location ? location.locality ?? location.city : "Select location"}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        </button>
        <form onSubmit={submit} className="relative mx-2 hidden flex-1 md:block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cameras, bikes, tents…" className="input rounded-full bg-slate-50 pl-10" aria-label="Search listings" />
        </form>
        <nav className="ml-auto flex items-center gap-1">
          <ButtonLink to="/dashboard/listings/new" variant="secondary" size="sm" className="max-sm:hidden" icon={<Plus className="h-4 w-4" />}>
            List an item
          </ButtonLink>
          {user ? (
            <>
              <NavLink to="/dashboard/messages" className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100" aria-label="Messages">
                <MessageCircle className="h-5 w-5" />
                {unread.messages > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unread.messages}</span>}
              </NavLink>
              <NavLink to="/dashboard/notifications" className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100" aria-label="Notifications">
                <Bell className="h-5 w-5" />
                {unread.notifications > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unread.notifications > 9 ? "9+" : unread.notifications}</span>}
              </NavLink>
              <div className="relative" ref={menuRef}>
                <button onClick={() => setMenuOpen((o) => !o)} className="ml-1 flex items-center gap-1 rounded-full p-0.5 hover:ring-2 hover:ring-brand-100" aria-label="Account menu">
                  <Avatar name={user.name} src={user.avatarUrl} size={34} />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-[var(--shadow-pop)]" onClick={() => setMenuOpen(false)}>
                    <div className="border-b border-slate-100 px-4 py-2.5">
                      <p className="truncate text-sm font-semibold">{user.name}</p>
                      <p className="truncate text-xs text-slate-500">{user.email ?? user.phone}</p>
                    </div>
                    <MenuLink to="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />}>Dashboard</MenuLink>
                    <MenuLink to="/dashboard/wishlist" icon={<Heart className="h-4 w-4" />}>Wishlist</MenuLink>
                    <MenuLink to="/dashboard/settings" icon={<Settings className="h-4 w-4" />}>Settings</MenuLink>
                    {isStaff && <MenuLink to="/admin" icon={<Shield className="h-4 w-4" />}>Admin panel</MenuLink>}
                    <button onClick={() => logout().then(() => navigate("/"))} className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <ButtonLink to="/login" size="sm" variant="dark">Sign in</ButtonLink>
          )}
        </nav>
      </div>
      <LocationPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </header>
  );
}

function MenuLink({ to, icon, children }: { to: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
      {icon}
      {children}
    </Link>
  );
}
