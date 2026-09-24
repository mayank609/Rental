/**
 * Earnings & payouts: summary, payout history, payout account onboarding
 * (bank or UPI) and invoice downloads.
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import toast from "react-hot-toast";
import clsx from "clsx";
import { AlertTriangle, BadgeCheck, Banknote, CalendarClock, CheckCircle2, Clock, Download, FileText, Hourglass, Landmark, Lock, PauseCircle, Pencil, Phone, ShieldCheck, Smartphone, Wallet } from "lucide-react";
import { api, apiError, apiErrorCode } from "@/lib/api";
import { fmtDate, money } from "@/lib/format";
import type { PageMeta } from "@/lib/types";
import { useAuth } from "@/stores/auth";
import { Seo } from "@/components/Seo";
import { Alert, Badge, Button, Card, EmptyState, Input, Pagination, Skeleton, Stat, type Tone } from "@/components/ui";
import { ErrorState, INVOICE_TYPE_LABEL, PageHeader, useInvoiceDownload } from "@/components/dashboard/common";
import type { EarningsSummary, InvoiceRow, PayoutAccount, PayoutRow, PayoutStatus } from "@/components/dashboard/types";

const PAYOUT_STATUS: Record<PayoutStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "Pending", tone: "gray" },
  ON_HOLD: { label: "On hold", tone: "red" },
  SCHEDULED: { label: "Scheduled", tone: "blue" },
  PROCESSING: { label: "Processing", tone: "amber" },
  PAID: { label: "Paid", tone: "green" },
  FAILED: { label: "Failed", tone: "red" },
  CANCELLED: { label: "Cancelled", tone: "gray" },
};

export default function EarningsPage() {
  const [page, setPage] = useState(1);
  const { hash } = useLocation();

  const payouts = useQuery({
    queryKey: ["payouts", page],
    queryFn: async () => (await api.get<{ payouts: PayoutRow[]; summary: EarningsSummary; meta: PageMeta }>("/payouts", { params: { page } })).data,
    placeholderData: keepPreviousData,
  });
  const invoices = useQuery({ queryKey: ["invoices"], queryFn: async () => (await api.get<{ invoices: InvoiceRow[] }>("/invoices")).data.invoices });

  useEffect(() => {
    if (hash) setTimeout(() => document.querySelector(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
  }, [hash]);

  const s = payouts.data?.summary;
  return (
    <div>
      <Seo title="Earnings & payouts" noindex />
      <PageHeader title="Earnings & payouts" subtitle="Payouts are released after each rental completes and the deposit is settled." />

      {payouts.isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : payouts.isError ? (
        <ErrorState error={payouts.error} onRetry={() => payouts.refetch()} />
      ) : s ? (
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
          <Stat label="Paid out" value={money(s.paid)} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" sub="All time" />
          <Stat label="Upcoming" value={money(s.upcoming)} icon={<CalendarClock className="h-5 w-5" />} tone="blue" sub="Scheduled / processing" />
          <Stat label="Pending" value={money(s.pending)} icon={<Hourglass className="h-5 w-5" />} tone="gray" sub="Rentals in progress" />
          <Stat label="On hold" value={money(s.onHold)} icon={<PauseCircle className="h-5 w-5" />} tone={s.onHold ? "red" : "gray"} sub={s.onHold ? "Action needed" : "Nothing on hold"} />
        </div>
      ) : null}
      {s && s.failed > 0 && (
        <Alert tone="red" className="mt-3" icon={<AlertTriangle className="h-4 w-4" />} title={`${money(s.failed)} in failed payouts`}>
          Check your payout details below. We'll retry automatically once they're updated.
        </Alert>
      )}

      <div className="mt-8 grid gap-8 xl:grid-cols-5">
        <div className="space-y-8 xl:col-span-3">
          {/* Payout history */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-900">Payout history</h2>
            {payouts.isLoading ? (
              <Skeleton className="h-48 rounded-2xl" />
            ) : !payouts.data?.payouts.length ? (
              <EmptyState icon={<Wallet className="h-6 w-6" />} title="No payouts yet" description="When renters book your items, your earnings will appear here." />
            ) : (
              <Card padded={false} className={clsx("overflow-hidden", payouts.isPlaceholderData && "opacity-60")}>
                {/* Mobile list */}
                <ul className="divide-y divide-slate-100 sm:hidden">
                  {payouts.data.payouts.map((p) => (
                    <li key={p.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {p.booking ? (
                            <Link to={`/dashboard/bookings/${p.booking.id}`} className="block truncate text-sm font-semibold text-slate-900 hover:text-brand-700">{p.booking.listing.title}</Link>
                          ) : (
                            <p className="text-sm font-semibold text-slate-900">{p.note ?? "Adjustment"}</p>
                          )}
                          <p className="text-xs text-slate-500">{p.booking ? `#${p.booking.code} · ` : ""}{payoutDate(p)}</p>
                        </div>
                        <div className="text-right">
                          <p className={clsx("font-bold", p.amount < 0 ? "text-red-600" : "text-slate-900")}>{money(p.amount)}</p>
                          <Badge tone={PAYOUT_STATUS[p.status]?.tone ?? "gray"}>{PAYOUT_STATUS[p.status]?.label ?? p.status}</Badge>
                        </div>
                      </div>
                      {p.failureReason && <p className="mt-1 text-xs text-red-600">{p.failureReason}</p>}
                    </li>
                  ))}
                </ul>
                {/* Desktop table */}
                <table className="hidden w-full text-sm sm:table">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Booking</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payouts.data.payouts.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/60">
                        <td className="max-w-[240px] px-4 py-3">
                          {p.booking ? (
                            <Link to={`/dashboard/bookings/${p.booking.id}`} className="block truncate font-medium text-slate-900 hover:text-brand-700">
                              {p.booking.listing.title}
                              <span className="block text-xs font-normal text-slate-500">#{p.booking.code}</span>
                            </Link>
                          ) : (
                            <span className="text-slate-700">{p.note ?? "Adjustment"}</span>
                          )}
                          {p.failureReason && <span className="block text-xs text-red-600">{p.failureReason}</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{payoutDate(p)}</td>
                        <td className="px-4 py-3">
                          <Badge tone={PAYOUT_STATUS[p.status]?.tone ?? "gray"}>{PAYOUT_STATUS[p.status]?.label ?? p.status}</Badge>
                        </td>
                        <td className={clsx("px-4 py-3 text-right font-semibold tabular-nums", p.amount < 0 ? "text-red-600" : "text-slate-900")}>{money(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
            <Pagination page={page} totalPages={payouts.data?.meta.totalPages ?? 1} onChange={setPage} />
            <HowPayoutsWork />
          </section>

          {/* Invoices */}
          <InvoicesSection q={invoices} />
        </div>

        <div className="xl:col-span-2">
          <PayoutAccountCard />
        </div>
      </div>
    </div>
  );
}

const payoutDate = (p: PayoutRow) => (p.paidAt ? `Paid ${fmtDate(p.paidAt)}` : p.scheduledFor ? `Scheduled ${fmtDate(p.scheduledFor)}` : `Created ${fmtDate(p.createdAt)}`);

function HowPayoutsWork() {
  const steps = [
    { icon: <Clock className="h-4 w-4" />, t: "Rental completes", d: "After the item is returned and inspected (or the inspection window ends)." },
    { icon: <CalendarClock className="h-4 w-4" />, t: "Payout scheduled", d: "Your share (rent minus commission) is scheduled for transfer." },
    { icon: <Banknote className="h-4 w-4" />, t: "Money in your account", d: "Sent to your bank or UPI, usually within 1–3 working days." },
  ];
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      {steps.map((s, i) => (
        <div key={s.t} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <div className="flex items-center gap-2 text-brand-700">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50">{s.icon}</span>
            <span className="text-xs font-bold">STEP {i + 1}</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-900">{s.t}</p>
          <p className="mt-0.5 text-xs text-slate-500">{s.d}</p>
        </div>
      ))}
    </div>
  );
}

function InvoicesSection({ q }: { q: UseQueryResult<InvoiceRow[]> }) {
  const { busy, download } = useInvoiceDownload();
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-slate-900">Invoices & statements</h2>
      {q.isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState icon={<FileText className="h-6 w-6" />} title="No invoices yet" description="GST invoices for rentals, commissions, boosts and Pro are listed here." />
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-slate-100">
            {q.data.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{INVOICE_TYPE_LABEL[inv.type] ?? inv.type}</p>
                  <p className="truncate text-xs text-slate-500">
                    {inv.number} · {fmtDate(inv.createdAt)}
                    {inv.bookingId && (
                      <>
                        {" · "}
                        <Link to={`/dashboard/bookings/${inv.bookingId}`} className="link">booking</Link>
                      </>
                    )}
                  </p>
                </div>
                <span className="hidden text-sm font-semibold text-slate-900 sm:block">{money(inv.amount)}</span>
                <Button size="sm" variant="outline" loading={busy === inv.id} onClick={() => download(inv)} icon={<Download className="h-4 w-4" />} aria-label={`Download ${inv.number}`}>
                  PDF
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Payout account                                                      */
/* ------------------------------------------------------------------ */

function PayoutAccountCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["payouts", "account"], queryFn: async () => (await api.get<{ account: PayoutAccount | null; kycStatus: string }>("/payouts/account")).data });
  const [editing, setEditing] = useState(false);
  const [method, setMethod] = useState<"BANK" | "UPI">("BANK");
  const [f, setF] = useState({ accountHolderName: "", accountNumber: "", confirm: "", ifsc: "", upiId: "", pan: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const acct = q.data?.account;
  const kyc = q.data?.kycStatus ?? user?.kycStatus;

  useEffect(() => {
    if (acct) setMethod(acct.method);
    if (!acct && q.isSuccess) setEditing(true);
    if (user && !f.accountHolderName) setF((x) => ({ ...x, accountHolderName: acct?.accountHolderName ?? user.name }));
  }, [acct, q.isSuccess]);

  const save = useMutation({
    mutationFn: async () => {
      const base = { method, accountHolderName: f.accountHolderName.trim(), ...(f.pan.trim() ? { pan: f.pan.trim().toUpperCase() } : {}) };
      const body = method === "BANK" ? { ...base, accountNumber: f.accountNumber.trim(), ifsc: f.ifsc.trim().toUpperCase() } : { ...base, upiId: f.upiId.trim() };
      return (await api.put<{ account: PayoutAccount }>("/payouts/account", body)).data.account;
    },
    onSuccess: (a) => {
      qc.setQueryData(["payouts", "account"], (d: { account: PayoutAccount | null; kycStatus: string } | undefined) => ({ kycStatus: d?.kycStatus ?? "NONE", account: a }));
      qc.invalidateQueries({ queryKey: ["payouts"] });
      setEditing(false);
      setF((x) => ({ ...x, accountNumber: "", confirm: "", upiId: "", pan: "" }));
      toast.success(a.status === "VERIFIED" ? "Payout details saved & verified" : "Payout details saved");
    },
    onError: (e) => {
      if (apiErrorCode(e) === "PHONE_VERIFICATION_REQUIRED") toast.error("Verify your phone number before adding payout details.");
      else toast.error(apiError(e));
    },
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (f.accountHolderName.trim().length < 2) e.accountHolderName = "Enter the name as per bank records";
    if (method === "BANK") {
      if (!/^\d{9,18}$/.test(f.accountNumber.trim())) e.accountNumber = "Enter a valid account number (9–18 digits)";
      if (f.confirm.trim() !== f.accountNumber.trim()) e.confirm = "Account numbers don't match";
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.ifsc.trim().toUpperCase())) e.ifsc = "Enter a valid IFSC, e.g. HDFC0001234";
    } else if (!/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(f.upiId.trim())) e.upiId = "Enter a valid UPI ID, e.g. name@okhdfcbank";
    if (f.pan.trim() && !/^[A-Z]{5}\d{4}[A-Z]$/.test(f.pan.trim().toUpperCase())) e.pan = "Enter a valid PAN, e.g. ABCDE1234F";
    setErrors(e);
    return !Object.keys(e).length;
  };

  return (
    <div id="payout-account" className="scroll-mt-24">
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <Landmark className="h-5 w-5 text-brand-600" /> Payout method
        </h2>
        {acct && !editing && (
          <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>
            Change
          </Button>
        )}
      </div>

      {/* KYC notice */}
      {kyc !== "VERIFIED" && (
        <Alert tone={kyc === "REJECTED" ? "red" : kyc === "PENDING" ? "blue" : "amber"} className="mt-4" icon={<ShieldCheck className="h-4 w-4" />} title={kyc === "PENDING" ? "ID verification in review" : kyc === "REJECTED" ? "ID verification rejected" : "ID verification required for payouts"}>
          {kyc === "PENDING" ? "Payouts will be released once your ID is verified." : "As required by RBI guidelines, payouts are sent only to KYC-verified owners."}{" "}
          {kyc !== "PENDING" && <Link to="/dashboard/settings#kyc" className="font-semibold underline">Verify your ID</Link>}
        </Alert>
      )}
      {user && !user.phoneVerified && (
        <Alert tone="amber" className="mt-3" icon={<Phone className="h-4 w-4" />}>
          Verify your phone to add payout details. <Link to="/verify-phone?next=/dashboard/earnings" className="font-semibold underline">Verify now</Link>
        </Alert>
      )}

      {q.isLoading ? (
        <Skeleton className="mt-4 h-40 rounded-2xl" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} className="mt-4" />
      ) : acct && !editing ? (
        <div className="mt-4 rounded-2xl border border-slate-200 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">{acct.method === "BANK" ? <Landmark className="h-5 w-5" /> : <Smartphone className="h-5 w-5" />}</div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">{acct.method === "BANK" ? `Bank account •••• ${acct.accountNumberLast4}` : `UPI · ${acct.upiId}`}</p>
              <p className="text-sm text-slate-600">{acct.accountHolderName}{acct.ifsc ? ` · ${acct.ifsc}` : ""}</p>
              {acct.panLast4 && <p className="text-xs text-slate-500">PAN ••••{acct.panLast4}</p>}
            </div>
            <Badge tone={acct.status === "VERIFIED" ? "green" : acct.status === "FAILED" ? "red" : "amber"} icon={acct.status === "VERIFIED" ? <BadgeCheck className="h-3 w-3" /> : undefined}>
              {acct.status === "VERIFIED" ? "Verified" : acct.status === "FAILED" ? "Failed" : "Pending"}
            </Badge>
          </div>
          {acct.status !== "VERIFIED" && <p className="mt-3 text-xs text-slate-500">Your account will be verified automatically once your ID (KYC) is approved.</p>}
        </div>
      ) : (
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (validate()) save.mutate();
          }}
          noValidate
        >
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payout method">
            {(["BANK", "UPI"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)} className={clsx("flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold", method === m ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-700 hover:bg-slate-50")}>
                {m === "BANK" ? <Landmark className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />} {m === "BANK" ? "Bank account" : "UPI ID"}
              </button>
            ))}
          </div>
          <Input label="Account holder name" value={f.accountHolderName} onChange={(e) => setF({ ...f, accountHolderName: e.target.value })} error={errors.accountHolderName} autoComplete="name" />
          {method === "BANK" ? (
            <>
              <Input label="Account number" inputMode="numeric" autoComplete="off" value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value.replace(/\D/g, "") })} error={errors.accountNumber} />
              <Input label="Confirm account number" inputMode="numeric" autoComplete="off" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value.replace(/\D/g, "") })} error={errors.confirm} onPaste={(e) => e.preventDefault()} hint="Re-type to avoid mistakes" />
              <Input label="IFSC code" value={f.ifsc} maxLength={11} onChange={(e) => setF({ ...f, ifsc: e.target.value.toUpperCase() })} error={errors.ifsc} placeholder="HDFC0001234" className="[&_input]:uppercase" />
            </>
          ) : (
            <Input label="UPI ID" value={f.upiId} onChange={(e) => setF({ ...f, upiId: e.target.value })} error={errors.upiId} placeholder="yourname@okhdfcbank" autoComplete="off" />
          )}
          <Input label="PAN (optional)" value={f.pan} maxLength={10} onChange={(e) => setF({ ...f, pan: e.target.value.toUpperCase() })} error={errors.pan} placeholder="ABCDE1234F" hint="Needed for TDS compliance on higher earnings" />
          <div className="flex gap-2">
            {acct && (
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
            <Button type="submit" block loading={save.isPending} icon={<Lock className="h-4 w-4" />}>
              Save payout details
            </Button>
          </div>
          <p className="flex items-start gap-1.5 text-xs text-slate-500">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Encrypted and stored securely. Only the last 4 digits are ever shown.
          </p>
        </form>
      )}
    </Card>
    </div>
  );
}
