/**
 * User detail: profile, KYC documents (secure viewer), payout account,
 * flags, recent bookings/listings and audit trail. Staff can suspend, ban
 * or reactivate; only ADMIN can change roles.
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Ban, Eye, PauseCircle, PlayCircle, ShieldAlert, UserCog } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { fmtDate, fmtDateTime, fromNow, money } from "@/lib/format";
import type { Role } from "@/lib/types";
import { Avatar, Button, Modal, PageLoader, Select, VerifiedBadge } from "@/components/ui";
import { AdminOnly, ErrorPanel, KeyValue, Mono, PageHeader, Panel, SeverityPill, StatusPill } from "@/components/admin/AdminUi";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { JsonViewer } from "@/components/admin/JsonViewer";
import { KycDocumentModal } from "@/components/admin/KycDocumentViewer";
import { useAdminMutation } from "@/components/admin/hooks";
import type { AdminUserDetail } from "@/components/admin/types";

type StatusAction = { status: "ACTIVE" | "SUSPENDED" | "BANNED"; title: string; label: string; description: string };

const STATUS_ACTIONS: Record<string, StatusAction> = {
  suspend: { status: "SUSPENDED", title: "Suspend user", label: "Suspend", description: "The user is signed out everywhere and their active listings are paused. They can be reactivated later." },
  ban: { status: "BANNED", title: "Ban user", label: "Ban permanently", description: "The user is signed out, their listings are paused and payouts stop. Use for fraud or serious policy violations." },
  reactivate: { status: "ACTIVE", title: "Reactivate user", label: "Reactivate", description: "Restore full access. Paused listings stay paused until the owner re-activates them." },
};

export default function AdminUserDetailPage() {
  const { id = "" } = useParams();
  const { isAdmin, user: me } = useAuth();
  const [action, setAction] = useState<StatusAction | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [role, setRole] = useState<Role>("USER");
  const [viewDoc, setViewDoc] = useState<{ id: string; title: string } | null>(null);

  const q = useQuery({ queryKey: ["admin", "users", id], queryFn: async () => (await api.get<AdminUserDetail>(`/admin/users/${id}`)).data });

  const update = useAdminMutation<{ status?: string; statusReason?: string; role?: Role }>({
    fn: (body) => api.patch(`/admin/users/${id}`, body),
    invalidate: [["admin", "users"], ["admin", "dashboard"]],
    success: "User updated",
    onSuccess: () => {
      setAction(null);
      setRoleOpen(false);
    },
  });

  if (q.isLoading) return <PageLoader />;
  if (q.isError || !q.data) return <ErrorPanel message={apiError(q.error, "User not found")} onRetry={() => q.refetch()} />;
  const { user: u, payoutAccount, kycDocuments, flags, bookings, listings, audits } = q.data;
  const isSelf = me?.id === u.id;

  return (
    <div>
      <PageHeader
        back={{ to: "/admin/users", label: "Users" }}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={u.name} src={u.avatarUrl} size={40} />
            {u.name}
          </span>
        }
        badge={
          <>
            <StatusPill status={u.status} />
            <StatusPill status={u.role} />
            <VerifiedBadge user={u} />
          </>
        }
        subtitle={<>Joined {fmtDate(u.createdAt)} · Last login {u.lastLoginAt ? fromNow(u.lastLoginAt) : "never"} · <Mono>{u.id}</Mono></>}
        actions={
          isSelf ? (
            <span className="text-sm text-slate-500">This is your account</span>
          ) : (
            <>
              <AdminOnly>
                <Button variant="outline" size="sm" icon={<UserCog className="h-4 w-4" />} onClick={() => { setRole(u.role); setRoleOpen(true); }}>
                  Change role
                </Button>
              </AdminOnly>
              {u.status === "ACTIVE" ? (
                <>
                  <Button variant="outline" size="sm" icon={<PauseCircle className="h-4 w-4" />} onClick={() => setAction(STATUS_ACTIONS.suspend)}>
                    Suspend
                  </Button>
                  <Button variant="danger" size="sm" icon={<Ban className="h-4 w-4" />} onClick={() => setAction(STATUS_ACTIONS.ban)}>
                    Ban
                  </Button>
                </>
              ) : u.status !== "DELETED" ? (
                <Button size="sm" icon={<PlayCircle className="h-4 w-4" />} onClick={() => setAction(STATUS_ACTIONS.reactivate)}>
                  Reactivate
                </Button>
              ) : null}
            </>
          )
        }
      />

      {u.status !== "ACTIVE" && u.statusReason && (
        <div className="mb-4 flex gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200">
          <ShieldAlert className="h-4 w-4 shrink-0" /> <span><b>{u.status.toLowerCase()}:</b> {u.statusReason}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Profile">
            <KeyValue
              items={[
                { label: "Email", value: <>{u.email ?? "—"} {u.email && <span className="text-xs text-slate-500">({u.emailVerified ? "verified" : "unverified"})</span>}</> },
                { label: "Phone", value: <>{u.phone ?? "—"} {u.phone && <span className="text-xs text-slate-500">({u.phoneVerified ? "verified" : "unverified"})</span>}</> },
                { label: "KYC", value: <StatusPill status={u.kycStatus} /> },
                { label: "Sign-in", value: [u.hasPassword && "Password", u.googleLinked && "Google"].filter(Boolean).join(", ") || "—" },
                { label: "Owner rating", value: u.ownerRating.count ? `${u.ownerRating.avg.toFixed(1)} ★ (${u.ownerRating.count})` : "—" },
                { label: "Renter rating", value: u.renterRating.count ? `${u.renterRating.avg.toFixed(1)} ★ (${u.renterRating.count})` : "—" },
                { label: "Cancellations", value: u.cancellationCount },
                { label: "Off-platform attempts", value: u.offPlatformAttempts },
                { label: "Subscription", value: u.subscription ? `${u.subscription.plan} · ${u.subscription.status.toLowerCase()}${u.subscription.currentPeriodEnd ? ` until ${fmtDate(u.subscription.currentPeriodEnd)}` : ""}` : "Free" },
                { label: "Preferred city", value: u.preferredLocation?.citySlug ?? "—" },
                { label: "Bio", value: u.bio, hidden: !u.bio },
              ]}
            />
          </Panel>

          <Panel title={`Recent bookings (${bookings.length})`} padded={false}>
            {bookings.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No bookings.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {bookings.map((b) => (
                  <li key={b.id}>
                    <Link to={`/admin/bookings/${b.id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-slate-50">
                      <Mono className="w-24 shrink-0 font-semibold text-slate-800">{b.code}</Mono>
                      <span className="w-16 shrink-0 text-xs text-slate-500">{b.renterId === u.id ? "Renter" : "Owner"}</span>
                      <StatusPill status={b.status} kind="booking" />
                      <span className="ml-auto tabular-nums text-slate-700">{money(b.totalAmount)}</span>
                      <span className="hidden w-24 text-right text-xs text-slate-500 sm:block">{fmtDate(b.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={`Listings (${listings.length})`} padded={false}>
            {listings.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No listings.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {listings.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <Link to={`/admin/listings?q=${l.id}`} className="min-w-0 flex-1 truncate font-medium text-slate-800 hover:text-brand-700">
                      {l.title}
                    </Link>
                    {l.deletedAt ? <StatusPill status="DELETED" /> : <StatusPill status={l.status} />}
                    <span className="hidden w-24 text-right text-xs text-slate-500 sm:block">{fmtDate(l.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Audit trail" padded={false}>
            {audits.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No audit entries for this user.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {audits.map((a) => (
                  <li key={a.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Mono className="font-semibold text-slate-800">{a.action}</Mono>
                      <span className="text-xs text-slate-500">{fmtDateTime(a.createdAt)}</span>
                    </div>
                    {(a.before != null || a.after != null) && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <JsonViewer label="Before" value={a.before} />
                        <JsonViewer label="After" value={a.after} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="KYC documents" action={<Link to="/admin/kyc" className="link text-xs">KYC queue</Link>} padded={false}>
            {kycDocuments.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No documents submitted.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {kycDocuments.map((d) => (
                  <li key={d.id} className="px-5 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-900">{d.docType.replace(/_/g, " ")}</p>
                        <Mono>{d.docNumberMasked}</Mono>
                      </div>
                      <StatusPill status={d.status} />
                    </div>
                    {d.rejectionReason && <p className="mt-1 text-xs text-red-700">{d.rejectionReason}</p>}
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-slate-500">{fmtDate(d.createdAt)}</span>
                      <Button variant="ghost" size="sm" className="h-7" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => setViewDoc({ id: d.id, title: `${u.name} · ${d.docType}` })}>
                        View file
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Payout account">
            {payoutAccount ? (
              <KeyValue
                cols={1}
                items={[
                  { label: "Method", value: payoutAccount.method },
                  { label: "Status", value: <StatusPill status={payoutAccount.status} /> },
                  { label: "Account", value: payoutAccount.last4 ? `•••• ${payoutAccount.last4} · ${payoutAccount.ifsc ?? ""}` : null, hidden: !payoutAccount.last4 },
                  { label: "UPI", value: payoutAccount.upiId, hidden: !payoutAccount.upiId },
                ]}
              />
            ) : (
              <p className="text-sm text-slate-500">Not set up.</p>
            )}
          </Panel>

          <Panel title={`Flags (${flags.length})`} action={<Link to="/admin/trust?tab=flags" className="link text-xs">All flags</Link>} padded={false}>
            {flags.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No flags raised.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {flags.map((fl) => (
                  <li key={fl.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-800">{fl.type.replace(/_/g, " ").toLowerCase()}</span>
                      <SeverityPill severity={fl.severity} />
                      <StatusPill status={fl.status} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{fmtDateTime(fl.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(action)}
        onClose={() => setAction(null)}
        title={action?.title}
        description={action?.description}
        confirmLabel={action?.label}
        tone={action?.status === "ACTIVE" ? "primary" : "danger"}
        reason
        reasonRequired={action?.status !== "ACTIVE"}
        reasonPlaceholder="e.g. Repeated off-platform payment requests"
        loading={update.isPending}
        onConfirm={(reason) => action && update.mutate({ status: action.status, statusReason: reason || undefined })}
      />

      <Modal
        open={roleOpen}
        onClose={() => setRoleOpen(false)}
        title="Change role"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRoleOpen(false)}>Cancel</Button>
            <Button loading={update.isPending} disabled={!isAdmin || role === u.role} onClick={() => update.mutate({ role })}>
              Save role
            </Button>
          </>
        }
      >
        <Select label="Role" name="role" value={role} onChange={(e) => setRole(e.target.value as Role)} hint="SUPPORT can moderate, review KYC and handle disputes. ADMIN can also move money and change settings.">
          <option value="USER">User</option>
          <option value="SUPPORT">Support</option>
          <option value="ADMIN">Admin</option>
        </Select>
      </Modal>

      <KycDocumentModal docId={viewDoc?.id ?? null} title={viewDoc?.title} onClose={() => setViewDoc(null)} />
    </div>
  );
}
