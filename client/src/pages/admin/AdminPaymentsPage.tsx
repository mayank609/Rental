/**
 * Payments & refunds: gateway payments with expandable refunds, manual
 * refunds (ADMIN), and a webhook log with retry (ADMIN).
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CreditCard, RefreshCw, RotateCcw, Webhook } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { fmtDateTime, money, toPaise } from "@/lib/format";
import { Button, Input, Modal, Tabs, Textarea } from "@/components/ui";
import { AdminOnly, FilterBar, FilterSelect, Mono, PageHeader, SearchInput, StatusPill } from "@/components/admin/AdminUi";
import { CellActions, DataTable, type Column } from "@/components/admin/DataTable";
import { cleanParams, useAdminMutation, useUrlFilters } from "@/components/admin/hooks";
import type { PageMeta, PaymentRow, WebhookRow } from "@/components/admin/types";

const PAYMENT_STATUSES = ["CREATED", "AUTHORIZED", "CAPTURED", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"];

export default function AdminPaymentsPage() {
  const { isAdmin } = useAuth();
  const [f, setF] = useUrlFilters({ tab: "payments", q: "", status: "", page: "1" });
  return (
    <div>
      <PageHeader title="Payments & refunds" subtitle="Gateway payments, refunds and webhook deliveries." />
      <Tabs
        className="mb-4"
        value={f.tab}
        onChange={(v) => setF({ tab: v, status: "", q: "" })}
        tabs={[
          { value: "payments", label: "Payments" },
          { value: "webhooks", label: <span className="inline-flex items-center gap-1">Webhooks{!isAdmin && <span className="text-[10px] font-normal">(admin)</span>}</span> },
        ]}
      />
      {f.tab === "webhooks" ? (
        isAdmin ? <WebhooksTab status={f.status} page={f.page} setF={setF} /> : <p className="card p-6 text-sm text-slate-500">Webhook logs are available to administrators only.</p>
      ) : (
        <PaymentsTab f={f} setF={setF} />
      )}
    </div>
  );
}

type Filters = { tab: string; q: string; status: string; page: string };
type SetF = (p: Partial<Filters>) => void;

function PaymentsTab({ f, setF }: { f: Filters; setF: SetF }) {
  const [refunding, setRefunding] = useState<PaymentRow | null>(null);
  const q = useQuery({
    queryKey: ["admin", "payments", { q: f.q, status: f.status, page: f.page }],
    queryFn: async () => (await api.get<{ payments: PaymentRow[]; meta: PageMeta }>("/admin/payments", { params: cleanParams({ q: f.q, status: f.status, page: f.page }) })).data,
    placeholderData: keepPreviousData,
  });

  const columns: Column<PaymentRow>[] = [
    { key: "created", header: "Created", sort: (p) => p.createdAt, cell: (p) => <span className="whitespace-nowrap text-xs">{fmtDateTime(p.createdAt)}</span> },
    { key: "user", header: "Payer", sort: (p) => p.user.name, cell: (p) => <Link to={`/admin/users/${p.user.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-brand-700">{p.user.name}</Link> },
    { key: "purpose", header: "Purpose", hideBelow: "sm", sort: (p) => p.purpose, cell: (p) => <span className="text-xs font-medium capitalize">{p.purpose.replace("_", " ").toLowerCase()}</span> },
    { key: "booking", header: "Booking", hideBelow: "md", cell: (p) => (p.booking ? <Link to={`/admin/bookings/${p.booking.id}`} className="font-mono text-xs hover:text-brand-700">{p.booking.code}</Link> : "—") },
    { key: "order", header: "Order / payment ID", hideBelow: "lg", cell: (p) => <div className="max-w-[200px] truncate"><Mono>{p.providerOrderId}</Mono>{p.providerPaymentId && <Mono className="block truncate text-slate-400">{p.providerPaymentId}</Mono>}</div> },
    { key: "method", header: "Method", hideBelow: "lg", cell: (p) => <span className="text-xs uppercase">{p.method ?? "—"}</span> },
    { key: "status", header: "Status", sort: (p) => p.status, cell: (p) => <StatusPill status={p.status} /> },
    {
      key: "amount", header: "Amount", align: "right", sort: (p) => p.amount,
      cell: (p) => (
        <span className="tabular-nums">
          <b>{money(p.amount)}</b>
          {p.refundedAmount > 0 && <span className="block text-xs text-violet-700">−{money(p.refundedAmount)} refunded</span>}
        </span>
      ),
    },
    {
      key: "actions", header: <span className="sr-only">Actions</span>, align: "right",
      cell: (p) => {
        const refundable = ["CAPTURED", "PARTIALLY_REFUNDED"].includes(p.status) && p.amount - p.refundedAmount > 0;
        return refundable ? (
          <CellActions>
            <AdminOnly reason="Only administrators can issue refunds">
              <Button variant="outline" size="sm" className="h-8" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setRefunding(p)}>
                Refund
              </Button>
            </AdminOnly>
          </CellActions>
        ) : null;
      },
    },
  ];

  return (
    <>
      <FilterBar>
        <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Booking code, order/payment ID" />
        <FilterSelect label="Status" value={f.status} onChange={(v) => setF({ status: v })} options={[{ value: "", label: "Any status" }, ...PAYMENT_STATUSES.map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase() }))]} />
      </FilterBar>
      <DataTable
        caption="Payments"
        columns={columns}
        rows={q.data?.payments}
        rowKey={(p) => p.id}
        loading={q.isLoading}
        expand={(p) => <RefundList payment={p} />}
        canExpand={(p) => p.refunds.length > 0 || Boolean(p.failureReason)}
        meta={q.data?.meta}
        onPageChange={(p) => setF({ page: String(p) })}
        empty={{ title: "No payments found", icon: <CreditCard className="h-5 w-5" /> }}
      />
      <RefundModal payment={refunding} onClose={() => setRefunding(null)} />
    </>
  );
}

function RefundList({ payment: p }: { payment: PaymentRow }) {
  return (
    <div className="space-y-2 text-sm">
      {p.failureReason && <p className="text-red-700">Failure: {p.failureReason}</p>}
      {p.refunds.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1 pr-3 font-medium">Refund</th>
              <th className="py-1 pr-3 font-medium">Amount</th>
              <th className="py-1 pr-3 font-medium">Status</th>
              <th className="py-1 pr-3 font-medium">Reason</th>
              <th className="py-1 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {p.refunds.map((r) => (
              <tr key={r.id} className="border-t border-slate-200/70">
                <td className="py-1.5 pr-3"><Mono>{r.providerRefundId ?? r.id}</Mono></td>
                <td className="py-1.5 pr-3 font-semibold tabular-nums">{money(r.amount)}</td>
                <td className="py-1.5 pr-3"><StatusPill status={r.status} /> {r.failureReason && <span className="text-red-700">{r.failureReason}</span>}</td>
                <td className="py-1.5 pr-3 text-slate-700">{r.reason}</td>
                <td className="py-1.5 whitespace-nowrap text-slate-500">{fmtDateTime(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RefundModal({ payment, onClose }: { payment: PaymentRow | null; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const max = payment ? payment.amount - payment.refundedAmount : 0;
  const paise = toPaise(amount) ?? 0;
  const amountError = amount && (paise < 1 || paise > max) ? `Enter between ₹0.01 and ${money(max)}` : null;
  const close = () => {
    setAmount("");
    setReason("");
    onClose();
  };
  const refund = useAdminMutation({
    fn: () => api.post(`/admin/payments/${payment!.id}/refund`, { amount: paise, reason: reason.trim() }),
    invalidate: [["admin", "payments"], ["admin", "bookings"]],
    success: `Refund of ${money(paise)} initiated`,
    onSuccess: close,
  });
  return (
    <Modal
      open={Boolean(payment)}
      onClose={close}
      title="Manual refund"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="danger" loading={refund.isPending} disabled={!paise || Boolean(amountError) || reason.trim().length < 3} onClick={() => refund.mutate()}>
            Refund {paise ? money(paise) : ""}
          </Button>
        </>
      }
    >
      {payment && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Payment of <b>{money(payment.amount)}</b> by {payment.user.name}
            {payment.booking && <> for <Mono>{payment.booking.code}</Mono></>}. Already refunded: {money(payment.refundedAmount)}.
          </p>
          <div>
            <Input label="Amount" name="amount" type="number" prefix="₹" min={0} step="0.01" max={max / 100} value={amount} onChange={(e) => setAmount(e.target.value)} error={amountError} hint={`Max refundable ${money(max)}`} />
            <button type="button" className="link mt-1 text-xs" onClick={() => setAmount(String(max / 100))}>Refund full remaining amount</button>
          </div>
          <Textarea label="Reason" name="refund-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. Goodwill refund — item arrived late" hint="Shown on the renter's receipt and stored in the audit log." />
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Manual refunds don't adjust owner payouts. Hold or cancel the related payout separately if needed.</p>
        </div>
      )}
    </Modal>
  );
}

function WebhooksTab({ status, page, setF }: { status: string; page: string; setF: SetF }) {
  const q = useQuery({
    queryKey: ["admin", "webhooks", { status, page }],
    queryFn: async () => (await api.get<{ webhooks: WebhookRow[]; meta: PageMeta }>("/admin/webhooks", { params: cleanParams({ status, page }) })).data,
    placeholderData: keepPreviousData,
  });
  const retry = useAdminMutation<string, { webhook: { status: string; error: string | null } }>({
    fn: async (id) => (await api.post(`/admin/webhooks/${id}/retry`)).data,
    invalidate: [["admin", "webhooks"], ["admin", "payments"]],
    success: (d) => (d.webhook.status === "PROCESSED" ? "Webhook processed" : `Retry finished: ${d.webhook.status.toLowerCase()}${d.webhook.error ? ` — ${d.webhook.error}` : ""}`),
  });

  const columns: Column<WebhookRow>[] = [
    { key: "created", header: "Received", sort: (w) => w.createdAt, cell: (w) => <span className="whitespace-nowrap text-xs">{fmtDateTime(w.createdAt)}</span> },
    { key: "type", header: "Event", sort: (w) => w.type, cell: (w) => <div><Mono className="font-semibold text-slate-800">{w.type}</Mono><Mono className="block text-slate-400">{w.provider} · {w.eventId}</Mono></div> },
    { key: "status", header: "Status", sort: (w) => w.status, cell: (w) => <StatusPill status={w.status} /> },
    { key: "attempts", header: "Attempts", align: "center", sort: (w) => w.attempts, cell: (w) => w.attempts },
    { key: "error", header: "Error", hideBelow: "md", cell: (w) => <span className="block max-w-[260px] truncate text-xs text-red-700" title={w.error ?? ""}>{w.error ?? ""}</span> },
    { key: "processed", header: "Processed", hideBelow: "lg", cell: (w) => (w.processedAt ? <span className="text-xs">{fmtDateTime(w.processedAt)}</span> : "—") },
    {
      key: "actions", header: <span className="sr-only">Actions</span>, align: "right",
      cell: (w) =>
        w.status !== "PROCESSED" && (
          <CellActions>
            <Button variant="outline" size="sm" className="h-8" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={retry.isPending && retry.variables === w.id} onClick={() => retry.mutate(w.id)}>
              Retry
            </Button>
          </CellActions>
        ),
    },
  ];

  return (
    <>
      <FilterBar>
        <FilterSelect label="Status" value={status} onChange={(v) => setF({ status: v })} options={[{ value: "", label: "Any status" }, { value: "FAILED", label: "failed" }, { value: "RECEIVED", label: "received" }, { value: "PROCESSED", label: "processed" }]} />
      </FilterBar>
      <DataTable
        caption="Webhook events"
        columns={columns}
        rows={q.data?.webhooks}
        rowKey={(w) => w.id}
        loading={q.isLoading}
        meta={q.data?.meta}
        onPageChange={(p) => setF({ page: String(p) })}
        empty={{ title: "No webhook events", description: "Gateway webhook deliveries appear here.", icon: <Webhook className="h-5 w-5" /> }}
      />
    </>
  );
}
