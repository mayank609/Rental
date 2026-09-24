/**
 * Checkout: confirm dates, fulfillment, protection and accept the rental
 * agreement, then create the booking. Instant-book listings go straight to
 * Razorpay; request-to-book shows a "request sent" success state.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, keepPreviousData } from "@tanstack/react-query";
import toast from "react-hot-toast";
import clsx from "clsx";
import { ArrowLeft, CalendarDays, CheckCircle2, FileText, Lock, MapPin, PhoneCall, ShieldAlert, ShieldCheck, Store, Truck, Zap } from "lucide-react";
import { api, apiError, apiErrorCode } from "@/lib/api";
import type { BookingDetail, CheckoutPayload, Listing, Quote } from "@/lib/types";
import { durationLabel, fmtDateTime, listingPath, money, pct } from "@/lib/format";
import { startCheckout } from "@/lib/payments";
import { useAuth } from "@/stores/auth";
import { usePlatformConfig } from "@/hooks/useConfig";
import { Seo } from "@/components/Seo";
import { PriceBreakdown } from "@/components/PriceBreakdown";
import { Alert, Avatar, Button, ButtonLink, Card, Checkbox, EmptyState, Input, Modal, Skeleton, Textarea, Toggle } from "@/components/ui";
import { ErrorState } from "@/components/public/common";
import { quoteParams, quoteToBreakdown, type Fulfillment } from "@/components/public/booking";
import { CancellationTiers, POLICY_LABEL } from "@/components/public/marketing";

interface Address {
  line1: string;
  line2: string;
  locality: string;
  city: string;
  pincode: string;
}
interface SavedAddress extends Partial<Address> {
  id: string;
  line1: string;
  city: string;
}

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export default function CheckoutPage() {
  const { listingId = "" } = useParams<{ listingId: string }>();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const config = usePlatformConfig();

  // ---- Period from the URL -------------------------------------------------
  const startAt = useMemo(() => (sp.get("startAt") ? new Date(sp.get("startAt")!) : null), [sp]);
  const endAt = useMemo(() => (sp.get("endAt") ? new Date(sp.get("endAt")!) : null), [sp]);
  const validPeriod = Boolean(startAt && endAt && !isNaN(startAt.getTime()) && !isNaN(endAt.getTime()) && endAt > startAt);

  const [fulfillment, setFulfillment] = useState<Fulfillment>(sp.get("fulfillment") === "DELIVERY" ? "DELIVERY" : "PICKUP");
  const [protection, setProtection] = useState(sp.get("protection") === "1");
  const [address, setAddress] = useState<Address>({ line1: "", line2: "", locality: "", city: "", pincode: "" });
  const [touched, setTouched] = useState(false);
  const [message, setMessage] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  // One idempotency key per checkout attempt (this page mount).
  const [idempotencyKey] = useState(newKey);
  const [requested, setRequested] = useState<BookingDetail | null>(null);
  const [paying, setPaying] = useState(false);

  // ---- Data ---------------------------------------------------------------
  const listingQ = useQuery({
    queryKey: ["listing", listingId],
    queryFn: async () => (await api.get<{ listing: Listing; isOwner: boolean; wishlisted: boolean }>(`/listings/${listingId}`)).data,
  });
  const listing = listingQ.data?.listing;

  const quote = useQuery({
    queryKey: ["quote", listingId, startAt?.toISOString(), endAt?.toISOString(), protection, fulfillment],
    queryFn: async () => (await api.get<Quote>(`/listings/${listingId}/quote`, { params: quoteParams(startAt!, endAt!, protection, fulfillment) })).data,
    enabled: validPeriod && Boolean(listing),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const agreement = useQuery({
    queryKey: ["rental-agreement"],
    queryFn: async () => (await api.get<{ version: string; text: string }>("/legal/rental-agreement")).data,
    staleTime: 30 * 60_000,
  });
  const saved = useQuery({
    queryKey: ["addresses"],
    queryFn: async () => (await api.get<{ addresses: SavedAddress[] }>("/users/me/addresses")).data.addresses,
    enabled: fulfillment === "DELIVERY",
  });

  // ---- Validation ---------------------------------------------------------
  const addrErrors: Partial<Record<keyof Address, string>> = {};
  if (fulfillment === "DELIVERY") {
    if (address.line1.trim().length < 3) addrErrors.line1 = "Enter your flat / house and street";
    if (address.city.trim().length < 2) addrErrors.city = "Enter your city";
    if (!/^\d{6}$/.test(address.pincode.trim())) addrErrors.pincode = "Enter a valid 6-digit pincode";
  }
  const addressOk = Object.keys(addrErrors).length === 0;
  const quoteOk = quote.data?.available && !quote.isError && !quote.isFetching;

  // ---- Payment ------------------------------------------------------------
  const pay = async (b: BookingDetail) => {
    setPaying(true);
    try {
      const r = await api.post<{ checkout: CheckoutPayload }>(`/bookings/${b.id}/pay`, { idempotencyKey });
      const result = await startCheckout(r.data.checkout, `${listing?.title ?? "Rental"} · ${b.code}`);
      if (result.status === "success") {
        toast.success(result.message ?? "Payment successful — your booking is confirmed! 🎉");
      } else if (result.status === "cancelled") {
        toast("Payment not completed. You can retry from your booking before it expires.", { icon: "⏳" });
      } else {
        toast.error(result.message ?? "Payment failed. You can retry from your booking.");
      }
    } catch (e) {
      toast.error(apiError(e, "Couldn't start payment. You can retry from your booking."));
    } finally {
      setPaying(false);
      navigate(`/dashboard/bookings/${b.id}`, { replace: true });
    }
  };

  const create = useMutation({
    mutationFn: async () => {
      const body = {
        listingId,
        startAt: startAt!.toISOString(),
        endAt: endAt!.toISOString(),
        fulfillment,
        protectionPlan: protection,
        agreementAccepted: true as const,
        agreementVersion: agreement.data?.version,
        ...(message.trim() ? { message: message.trim() } : {}),
        ...(fulfillment === "DELIVERY"
          ? {
              deliveryAddress: {
                line1: address.line1.trim(),
                ...(address.line2.trim() ? { line2: address.line2.trim() } : {}),
                ...(address.locality.trim() ? { locality: address.locality.trim() } : {}),
                city: address.city.trim(),
                pincode: address.pincode.trim(),
              },
            }
          : {}),
      };
      return (await api.post<{ booking: BookingDetail }>("/bookings", body)).data.booking;
    },
    onSuccess: (b) => {
      if (b.status === "ACCEPTED") void pay(b);
      else {
        setRequested(b);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!addressOk || !agreed || !quoteOk) return;
    create.mutate();
  };

  // ---- Render states ------------------------------------------------------
  const backToListing = listing ? `${listingPath(listing)}` : `/listing/${listingId}`;

  if (!validPeriod) {
    return (
      <div className="container-page py-16">
        <Seo title="Checkout" noindex />
        <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="Choose your dates first" description="Pick pickup and return dates on the listing to continue to checkout." action={<ButtonLink to={backToListing}>Back to listing</ButtonLink>} />
      </div>
    );
  }
  if (listingQ.isLoading) return <CheckoutSkeleton />;
  if (listingQ.isError || !listing) {
    return (
      <div className="container-page py-16">
        <Seo title="Checkout" noindex />
        <ErrorState error={listingQ.error} onRetry={() => listingQ.refetch()} />
      </div>
    );
  }
  if (listingQ.data?.isOwner) {
    return (
      <div className="container-page py-16">
        <Seo title="Checkout" noindex />
        <EmptyState icon={<Store className="h-6 w-6" />} title="You can't book your own listing" action={<ButtonLink to={backToListing}>Back to listing</ButtonLink>} />
      </div>
    );
  }

  if (requested) {
    return (
      <div className="container-page max-w-2xl py-12 sm:py-16">
        <Seo title="Request sent" noindex />
        <Card className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/50">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="mt-5 text-2xl font-extrabold text-slate-900">Request sent!</h1>
          <p className="mx-auto mt-2 max-w-md text-slate-600">
            {requested.owner.name} has {config.data?.booking.requestExpiryHours ?? 24}h to respond. We'll notify you the moment they accept — then you'll have a short window to pay and confirm.
          </p>
          <div className="mx-auto mt-6 max-w-sm rounded-2xl bg-slate-50 p-4 text-left text-sm">
            <p className="font-semibold text-slate-900">{listing.title}</p>
            <p className="mt-1 text-slate-600">{fmtDateTime(requested.startAt)} → {fmtDateTime(requested.endAt)}</p>
            <p className="mt-1 text-slate-600">Booking code <span className="font-mono font-semibold text-slate-900">{requested.code}</span></p>
          </div>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <ButtonLink to={`/dashboard/bookings/${requested.id}`}>View booking</ButtonLink>
            {requested.conversationId && <ButtonLink to={`/dashboard/messages/${requested.conversationId}`} variant="outline">Message owner</ButtonLink>}
          </div>
          <p className="mt-4 text-xs text-slate-500">You haven't been charged. No payment is taken until the owner accepts.</p>
        </Card>
      </div>
    );
  }

  const code = create.isError ? apiErrorCode(create.error) : undefined;
  const nextParam = encodeURIComponent(window.location.pathname + window.location.search);
  const busy = create.isPending || paying;
  const policy = listing.cancellationPolicy;

  return (
    <div className="container-page py-6 pb-28 sm:py-10 md:pb-10">
      <Seo title={`Checkout · ${listing.title}`} noindex />
      <Link to={backToListing} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to listing
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold text-slate-900 sm:text-3xl">{listing.instantBooking ? "Confirm and pay" : "Request to book"}</h1>

      {user && !user.phoneVerified && (
        <Alert tone="amber" className="mt-4" icon={<PhoneCall className="h-4 w-4" />} title="Verify your phone to book">
          For everyone's safety, bookings need a verified mobile number. <Link className="link" to={`/verify-phone?next=${nextParam}`}>Verify now</Link> — it takes 30 seconds.
        </Alert>
      )}

      <form onSubmit={submit} className="mt-6 grid gap-8 lg:grid-cols-[1fr_400px]" noValidate>
        {/* ---------------------------------------------------- form column */}
        <div className="min-w-0 space-y-6">
          <Card>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><CalendarDays className="h-5 w-5 text-brand-600" /> Your rental</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pickup</p>
                <p className="mt-0.5 font-semibold text-slate-900">{fmtDateTime(startAt!)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Return</p>
                <p className="mt-0.5 font-semibold text-slate-900">{fmtDateTime(endAt!)}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              {quote.data ? durationLabel(quote.data.hours) : ""} · <Link to={backToListing} className="link">Change dates</Link>
            </p>
          </Card>

          <Card>
            <h2 className="text-lg font-bold text-slate-900">Pickup or delivery</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Fulfillment">
              {listing.pickupAvailable && (
                <FulfillmentOption active={fulfillment === "PICKUP"} onClick={() => setFulfillment("PICKUP")} icon={<Store className="h-5 w-5" />} title="Pick up from owner" sub={`${[listing.location.locality?.name, listing.location.city?.name].filter(Boolean).join(", ")} · Free`} />
              )}
              {listing.deliveryAvailable && (
                <FulfillmentOption active={fulfillment === "DELIVERY"} onClick={() => setFulfillment("DELIVERY")} icon={<Truck className="h-5 w-5" />} title="Deliver to me" sub={`${listing.deliveryFee ? money(listing.deliveryFee) : "Free"}${listing.deliveryRadiusKm ? ` · within ${listing.deliveryRadiusKm} km` : ""}`} />
              )}
            </div>
            {fulfillment === "PICKUP" && <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" /> Exact pickup address is shared once your booking is confirmed.</p>}

            {fulfillment === "DELIVERY" && (
              <div className="mt-5 space-y-4">
                {(saved.data?.length ?? 0) > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Saved addresses</p>
                    <div className="flex flex-wrap gap-2">
                      {saved.data!.map((a) => (
                        <button key={a.id} type="button" className="chip max-w-full" onClick={() => setAddress({ line1: a.line1, line2: a.line2 ?? "", locality: a.locality ?? "", city: a.city, pincode: a.pincode ?? "" })}>
                          <MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{a.line1}, {a.city}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <Input label="Flat / house no., building, street" name="line1" autoComplete="address-line1" value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} error={touched ? addrErrors.line1 : null} required />
                <Input label="Landmark (optional)" name="line2" autoComplete="address-line2" value={address.line2} onChange={(e) => setAddress({ ...address, line2: e.target.value })} />
                <div className="grid gap-4 sm:grid-cols-3">
                  <Input label="Locality / area" name="locality" value={address.locality} onChange={(e) => setAddress({ ...address, locality: e.target.value })} />
                  <Input label="City" name="city" autoComplete="address-level2" value={address.city} placeholder={listing.location.city?.name} onChange={(e) => setAddress({ ...address, city: e.target.value })} error={touched ? addrErrors.city : null} required />
                  <Input label="Pincode" name="pincode" inputMode="numeric" autoComplete="postal-code" maxLength={6} value={address.pincode} onChange={(e) => setAddress({ ...address, pincode: e.target.value.replace(/\D/g, "") })} error={touched ? addrErrors.pincode : null} required />
                </div>
              </div>
            )}
          </Card>

          {(config.data?.fees.protectionPlan.enabled ?? quote.data?.protectionAvailable) && (
            <Card>
              <Toggle
                checked={protection}
                onChange={setProtection}
                label={<span className="inline-flex items-center gap-2 text-base font-bold text-slate-900"><ShieldCheck className="h-5 w-5 text-emerald-600" /> Add damage protection</span>}
                description={
                  config.data
                    ? `Covers accidental damage up to ${money(config.data.fees.protectionPlan.coverageCap)} so a mishap doesn't eat your deposit. ${config.data.fees.protectionPlan.type === "PERCENT" ? `${pct(config.data.fees.protectionPlan.value)} of rent` : money(config.data.fees.protectionPlan.value)}, minimum ${money(config.data.fees.protectionPlan.minFee)}.`
                    : "Covers accidental damage during your rental."
                }
              />
            </Card>
          )}

          <Card>
            <Textarea
              label={<span className="text-lg font-bold text-slate-900">Message to {listing.owner?.name ?? "the owner"} <span className="text-sm font-normal text-slate-500">(optional)</span></span>}
              name="message"
              maxLength={1000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Say hi and share what you'll use it for — owners respond faster to friendly requests."
            />
            <p className="mt-1 text-xs text-slate-500">Phone numbers and emails are hidden until the booking is confirmed.</p>
          </Card>

          <Card>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><FileText className="h-5 w-5 text-brand-600" /> Rental agreement</h2>
            {agreement.isLoading ? (
              <Skeleton className="mt-4 h-40 w-full" />
            ) : agreement.isError ? (
              <ErrorState className="mt-4" error={agreement.error} onRetry={() => agreement.refetch()} />
            ) : (
              <>
                <div tabIndex={0} aria-label="Rental agreement text" className="mt-4 max-h-48 overflow-y-auto whitespace-pre-line rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-700 ring-1 ring-slate-200">
                  {agreement.data?.text}
                </div>
                <button type="button" className="link mt-2 text-sm" onClick={() => setAgreementOpen(true)}>Read full agreement</button>
              </>
            )}
            <Checkbox
              className="mt-4"
              checked={agreed}
              onChange={setAgreed}
              label={<>I have read and accept the Rental Agreement{agreement.data ? ` (v${agreement.data.version})` : ""}, the <Link to="/terms" target="_blank" className="link">Terms</Link> and the <Link to="/refund-policy" target="_blank" className="link">Refund & Cancellation Policy</Link>.</>}
            />
            {touched && !agreed && <p className="mt-1 text-xs text-red-600">Please accept the rental agreement to continue.</p>}
          </Card>
        </div>

        {/* ------------------------------------------------- summary column */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <div className="flex gap-3">
              {listing.images[0] && <img src={listing.images[0].thumbUrl} alt="" className="h-20 w-24 shrink-0 rounded-xl object-cover" />}
              <div className="min-w-0">
                <p className="line-clamp-2 font-semibold text-slate-900">{listing.title}</p>
                {listing.owner && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                    <Avatar name={listing.owner.name} src={listing.owner.avatarUrl} size={20} /> {listing.owner.name}
                  </p>
                )}
                {listing.instantBooking && <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-700"><Zap className="h-3 w-3" /> Instant booking</p>}
              </div>
            </div>

            <div className="my-5 border-t border-slate-100" />
            <h2 className="mb-3 font-bold text-slate-900">Price details</h2>
            <div aria-live="polite">
              {quote.isLoading ? (
                <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
              ) : quote.isError ? (
                <Alert tone="red" icon={<ShieldAlert className="h-4 w-4" />}>
                  {apiError(quote.error)} <Link to={backToListing} className="link">Change dates</Link>
                </Alert>
              ) : quote.data ? (
                <div className={clsx("transition-opacity", quote.isFetching && "opacity-60")}>
                  {!quote.data.available && (
                    <Alert tone="red" className="mb-3" title="Not available for these dates">
                      Someone just booked some of these dates. <Link to={backToListing} className="link">Choose different dates</Link>
                    </Alert>
                  )}
                  <PriceBreakdown b={quoteToBreakdown(quote.data)} />
                </div>
              ) : null}
            </div>

            <div className="my-5 border-t border-slate-100" />
            <details className="group">
              <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                Cancellation: {POLICY_LABEL[policy]} <span className="text-xs font-normal text-brand-700 group-open:hidden">· view</span>
              </summary>
              <CancellationTiers className="mt-3" policy={policy} config={config.data} />
            </details>

            {create.isError && (
              <div className="mt-5">
                {code === "PHONE_VERIFICATION_REQUIRED" ? (
                  <Alert tone="amber" title="Verify your phone number">
                    Bookings need a verified mobile number. <Link to={`/verify-phone?next=${nextParam}`} className="link">Verify now</Link>
                  </Alert>
                ) : code === "KYC_REQUIRED" ? (
                  <Alert tone="amber" title="ID verification required">
                    {apiError(create.error)} <Link to="/dashboard/settings#kyc" className="link">Complete KYC</Link>
                  </Alert>
                ) : code === "DATES_UNAVAILABLE" ? (
                  <Alert tone="red" title="Dates no longer available">
                    {apiError(create.error)} <Link to={backToListing} className="link">Choose new dates</Link>
                  </Alert>
                ) : (
                  <Alert tone="red">{apiError(create.error)}</Alert>
                )}
              </div>
            )}

            <Button type="submit" block size="lg" className="mt-5" loading={busy} disabled={!quoteOk || busy} icon={listing.instantBooking ? <Lock className="h-4 w-4" /> : undefined}>
              {paying ? "Opening payment…" : listing.instantBooking ? `Pay ${quote.data ? money(quote.data.breakdown.totalAmount) : ""}` : "Send request"}
            </Button>
            <p className="mt-3 text-center text-xs text-slate-500">
              {listing.instantBooking
                ? "Secure payment via Razorpay · UPI, cards, netbanking. Deposit is refunded after return."
                : `You won't be charged now. The owner has ${config.data?.booking.requestExpiryHours ?? 24}h to accept.`}
            </p>
          </Card>
        </aside>
      </form>

      <Modal open={agreementOpen} onClose={() => setAgreementOpen(false)} title={`Rental agreement${agreement.data ? ` v${agreement.data.version}` : ""}`} size="lg" footer={<Button onClick={() => { setAgreed(true); setAgreementOpen(false); }}>I accept</Button>}>
        <div className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{agreement.data?.text}</div>
      </Modal>
    </div>
  );
}

function FulfillmentOption({ active, onClick, icon, title, sub }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onClick} className={clsx("flex items-start gap-3 rounded-xl border p-4 text-left transition", active ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-slate-300 hover:bg-slate-50")}>
      <span className={clsx("mt-0.5", active ? "text-brand-600" : "text-slate-500")}>{icon}</span>
      <span>
        <span className="block font-semibold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-xs text-slate-600">{sub}</span>
      </span>
    </button>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="container-page py-10" aria-busy="true">
      <Skeleton className="h-8 w-64" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}</div>
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    </div>
  );
}
