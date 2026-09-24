/**
 * Tabbed, paginated booking list shared by "My rentals" (renter) and
 * "Booking requests" (owner). Tab + page live in the URL so they survive
 * refreshes and back navigation. Owners can accept/decline inline.
 */
import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { CalendarDays, Check, Inbox, Search, X } from "lucide-react";
import { api, apiError } from "@/lib/api";
import type { BookingSummary, PageMeta } from "@/lib/types";
import { Button, ButtonLink, EmptyState, Modal, Pagination, Tabs, Textarea } from "@/components/ui";
import { BookingListCard, ErrorState, ListSkeleton, useNotificationEvent } from "./common";

export type BookingScope = "action" | "upcoming" | "active" | "past";
type Role = "renter" | "owner";

const TABS: Record<Role, { value: BookingScope; label: string }[]> = {
  renter: [
    { value: "upcoming", label: "Upcoming" },
    { value: "action", label: "Awaiting payment" },
    { value: "active", label: "Active" },
    { value: "past", label: "Past" },
  ],
  owner: [
    { value: "action", label: "Needs action" },
    { value: "upcoming", label: "Upcoming" },
    { value: "active", label: "Active" },
    { value: "past", label: "Past" },
  ],
};

const EMPTY: Record<Role, Record<BookingScope, { title: string; description: string }>> = {
  renter: {
    upcoming: { title: "No upcoming rentals", description: "Find cameras, tools, bikes and more from people near you." },
    action: { title: "Nothing to pay right now", description: "Accepted requests that need payment will show up here." },
    active: { title: "No active rentals", description: "Items you currently have will appear here." },
    past: { title: "No past rentals yet", description: "Completed and cancelled bookings will be listed here." },
  },
  owner: {
    action: { title: "You're all caught up", description: "New requests and returned items to inspect will appear here." },
    upcoming: { title: "No upcoming bookings", description: "Accepted and confirmed bookings will be listed here." },
    active: { title: "No active rentals", description: "Items currently rented out will appear here." },
    past: { title: "No past bookings", description: "Completed, declined and cancelled bookings appear here." },
  },
};

export function BookingsList({ role }: { role: Role }) {
  const [params, setParams] = useSearchParams();
  const tabs = TABS[role];
  const scope = (tabs.some((t) => t.value === params.get("tab")) ? params.get("tab") : tabs[0].value) as BookingScope;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["bookings", role, scope, page],
    queryFn: async () => (await api.get<{ bookings: BookingSummary[]; meta: PageMeta }>("/bookings", { params: { role, scope, page, limit: 10 } })).data,
    placeholderData: keepPreviousData,
  });
  // Badge count for the action tab.
  const actionCount = useQuery({
    queryKey: ["bookings", role, "action", "count"],
    queryFn: async () => (await api.get<{ meta: PageMeta }>("/bookings", { params: { role, scope: "action", limit: 1 } })).data.meta.total,
  });

  useNotificationEvent(
    useCallback(
      (n) => {
        if (n.type.startsWith("booking.") || n.type.startsWith("payment.")) qc.invalidateQueries({ queryKey: ["bookings", role] });
      },
      [qc, role],
    ),
  );

  const setTab = (t: BookingScope) => setParams({ tab: t }, { replace: true });
  const setPage = (p: number) => {
    setParams({ tab: scope, page: String(p) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const [declineId, setDeclineId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["bookings"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const accept = useMutation({
    mutationFn: (id: string) => api.post(`/bookings/${id}/accept`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["booking", id] });
      invalidate();
      toast.success("Accepted! The renter has been asked to pay.");
    },
    onError: (e) => toast.error(apiError(e)),
  });
  const decline = useMutation({
    mutationFn: (id: string) => api.post(`/bookings/${id}/decline`, { reason: reason.trim() || undefined }),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["booking", id] });
      invalidate();
      setDeclineId(null);
      setReason("");
      toast.success("Request declined");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const empty = EMPTY[role][scope];
  return (
    <div>
      <Tabs value={scope} onChange={setTab} tabs={tabs.map((t) => ({ ...t, count: t.value === "action" ? actionCount.data : undefined }))} className="mb-5" />
      {q.isLoading ? (
        <ListSkeleton />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.bookings.length ? (
        <EmptyState
          icon={role === "owner" ? <Inbox className="h-6 w-6" /> : <CalendarDays className="h-6 w-6" />}
          title={empty.title}
          description={empty.description}
          action={
            role === "renter" ? (
              <ButtonLink to="/search" icon={<Search className="h-4 w-4" />}>Browse items</ButtonLink>
            ) : (
              <ButtonLink to="/dashboard/listings" variant="outline">Manage listings</ButtonLink>
            )
          }
        />
      ) : (
        <>
          <div className={`space-y-3 transition-opacity ${q.isPlaceholderData ? "opacity-60" : ""}`}>
            {q.data.bookings.map((b) => (
              <BookingListCard
                key={b.id}
                b={b}
                actions={
                  role === "owner" && b.status === "REQUESTED" ? (
                    <>
                      <Button size="sm" variant="outline" icon={<X className="h-4 w-4" />} onClick={() => setDeclineId(b.id)}>
                        Decline
                      </Button>
                      <Button size="sm" icon={<Check className="h-4 w-4" />} loading={accept.isPending && accept.variables === b.id} onClick={() => accept.mutate(b.id)}>
                        Accept
                      </Button>
                    </>
                  ) : role === "renter" && b.status === "ACCEPTED" ? (
                    <ButtonLink size="sm" to={`/dashboard/bookings/${b.id}`}>Pay now</ButtonLink>
                  ) : role === "owner" && b.status === "RETURNED" ? (
                    <ButtonLink size="sm" to={`/dashboard/bookings/${b.id}`}>Inspect item</ButtonLink>
                  ) : undefined
                }
              />
            ))}
          </div>
          <Pagination page={page} totalPages={q.data.meta.totalPages} onChange={setPage} />
        </>
      )}

      <Modal
        open={Boolean(declineId)}
        onClose={() => setDeclineId(null)}
        title="Decline this request?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeclineId(null)}>Cancel</Button>
            <Button variant="danger" loading={decline.isPending} onClick={() => declineId && decline.mutate(declineId)}>Decline</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">The renter won't be charged and will be notified.</p>
        <Textarea className="mt-3" label="Reason (optional)" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Not available on these dates" />
      </Modal>
    </div>
  );
}
