/**
 * Notification centre: grouped by day, unread filter, mark-all-read and
 * deep links. Refreshes in real time (the header already invalidates the
 * ["notifications"] key on every socket "notification" event).
 */
import { useCallback, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import clsx from "clsx";
import { format, isToday, isYesterday } from "date-fns";
import { AlertTriangle, Bell, BellOff, CalendarCheck, CheckCheck, CreditCard, Megaphone, MessageCircle, Package, ShieldCheck, Star, Wallet } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { fromNow } from "@/lib/format";
import type { Notification, PageMeta } from "@/lib/types";
import { Seo } from "@/components/Seo";
import { Button, Card, EmptyState, Pagination, Skeleton, Tabs } from "@/components/ui";
import { ErrorState, PageHeader, useNotificationEvent } from "@/components/dashboard/common";

const ICON: { test: (t: string) => boolean; icon: ReactNode; cls: string }[] = [
  { test: (t) => t.startsWith("booking."), icon: <CalendarCheck className="h-5 w-5" />, cls: "bg-brand-50 text-brand-600" },
  { test: (t) => t.startsWith("payment."), icon: <CreditCard className="h-5 w-5" />, cls: "bg-emerald-50 text-emerald-600" },
  { test: (t) => t.startsWith("payout."), icon: <Wallet className="h-5 w-5" />, cls: "bg-emerald-50 text-emerald-600" },
  { test: (t) => t.startsWith("message."), icon: <MessageCircle className="h-5 w-5" />, cls: "bg-sky-50 text-sky-600" },
  { test: (t) => t.startsWith("dispute."), icon: <AlertTriangle className="h-5 w-5" />, cls: "bg-red-50 text-red-600" },
  { test: (t) => t.startsWith("review."), icon: <Star className="h-5 w-5" />, cls: "bg-amber-50 text-amber-600" },
  { test: (t) => t.startsWith("listing."), icon: <Package className="h-5 w-5" />, cls: "bg-violet-50 text-violet-600" },
  { test: (t) => t.startsWith("kyc.") || t.startsWith("account."), icon: <ShieldCheck className="h-5 w-5" />, cls: "bg-slate-100 text-slate-600" },
];
const iconFor = (t: string) => ICON.find((x) => x.test(t)) ?? { icon: <Megaphone className="h-5 w-5" />, cls: "bg-slate-100 text-slate-600" };
const dayLabel = (d: Date) => (isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "EEEE, d MMM"));

export default function NotificationsPage() {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(1);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ["notifications", "list", filter, page],
    queryFn: async () => (await api.get<{ notifications: Notification[]; unread: number; meta: PageMeta }>("/users/me/notifications", { params: { page, unread: filter === "unread" || undefined } })).data,
    placeholderData: keepPreviousData,
  });

  // Realtime: new notifications land at the top of page 1.
  useNotificationEvent(useCallback(() => qc.invalidateQueries({ queryKey: ["notifications", "list"] }), [qc]));

  const markRead = useMutation({
    mutationFn: (ids?: string[]) => api.post("/users/me/notifications/read", ids ? { ids } : {}),
    onSuccess: (_d, ids) => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      if (!ids) toast.success("All caught up");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const open = (n: Notification) => {
    if (!n.readAt) markRead.mutate([n.id]);
    if (n.data?.url) navigate(n.data.url);
  };

  // Group by calendar day
  const groups: { label: string; items: Notification[] }[] = [];
  for (const n of q.data?.notifications ?? []) {
    const label = dayLabel(new Date(n.createdAt));
    const g = groups[groups.length - 1];
    if (g?.label === label) g.items.push(n);
    else groups.push({ label, items: [n] });
  }
  const unread = q.data?.unread ?? 0;

  return (
    <div>
      <Seo title="Notifications" noindex />
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread` : "You're all caught up."}
        action={
          <Button variant="outline" size="sm" disabled={!unread} loading={markRead.isPending && !markRead.variables} onClick={() => markRead.mutate(undefined)} icon={<CheckCheck className="h-4 w-4" />}>
            Mark all as read
          </Button>
        }
      />
      <Tabs
        value={filter}
        onChange={(v) => {
          setFilter(v);
          setPage(1);
        }}
        tabs={[
          { value: "all", label: "All" },
          { value: "unread", label: "Unread", count: unread },
        ]}
        className="mb-5"
      />
      {q.isLoading ? (
        <Card padded={false}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 border-b border-slate-100 p-4 last:border-0">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </Card>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !groups.length ? (
        <EmptyState icon={filter === "unread" ? <BellOff className="h-6 w-6" /> : <Bell className="h-6 w-6" />} title={filter === "unread" ? "No unread notifications" : "No notifications yet"} description="Booking updates, messages, payouts and more will show up here." />
      ) : (
        <div className={clsx("space-y-6", q.isPlaceholderData && "opacity-60")}>
          {groups.map((g) => (
            <section key={g.label}>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</h2>
              <Card padded={false}>
                <ul className="divide-y divide-slate-100">
                  {g.items.map((n) => {
                    const ic = iconFor(n.type);
                    return (
                      <li key={n.id}>
                        <button onClick={() => open(n)} className={clsx("flex w-full gap-3 p-4 text-left transition hover:bg-slate-50", !n.readAt && "bg-brand-50/40")}>
                          <span className={clsx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", ic.cls)}>{ic.icon}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-2">
                              <span className={clsx("text-sm", n.readAt ? "font-medium text-slate-800" : "font-bold text-slate-900")}>{n.title}</span>
                              <span className="shrink-0 text-[11px] text-slate-400">{fromNow(n.createdAt)}</span>
                            </span>
                            <span className="mt-0.5 block text-sm text-slate-600">{n.body}</span>
                          </span>
                          {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ))}
          <Pagination page={page} totalPages={q.data?.meta.totalPages ?? 1} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
