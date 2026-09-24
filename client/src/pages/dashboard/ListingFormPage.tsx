/**
 * Create / edit listing wizard:
 *   Photos → Details → Pricing → Location → Rules & policies → Review.
 * - Prices are entered in ₹ and sent as paise.
 * - New-listing progress is auto-saved to localStorage (restore prompt).
 * - Edits send `version` for optimistic concurrency; FIELDS_LOCKED errors
 *   disable the fields that can't change while bookings exist.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import clsx from "clsx";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Ban, Camera, Check, CheckCircle2, Crosshair, Crown, FileText, IndianRupee, Info, Lock, MapPin, MapPinned,
  Phone, RotateCcw, Save, Search, ShieldCheck, Sparkles, Tag, Truck, Zap,
} from "lucide-react";
import { api, apiError, apiErrorCode } from "@/lib/api";
import { CONDITION_LABEL, money, pct, toPaise, toRupees } from "@/lib/format";
import type { CancellationPolicy, Condition, Listing, ListingImage, PlatformConfig } from "@/lib/types";
import { useAuth } from "@/stores/auth";
import { useLocationStore } from "@/stores/location";
import { useCategories, usePlatformConfig } from "@/hooks/useConfig";
import { Seo } from "@/components/Seo";
import { Alert, Badge, Button, ButtonLink, Card, Input, Modal, Select, Skeleton, Spinner, Textarea, Toggle } from "@/components/ui";
import { ErrorState, PageHeader } from "@/components/dashboard/common";
import { ListingPhotos } from "@/components/dashboard/ListingPhotos";
import { getCoords } from "@/components/dashboard/EvidenceUploader";
import type { SavedAddress } from "@/components/dashboard/types";

const LocationPinMap = lazy(() => import("@/components/dashboard/LocationPinMap"));

/* ------------------------------------------------------------------ */
/* Form model                                                          */
/* ------------------------------------------------------------------ */

type Unit = "hours" | "days";
interface AddressFields {
  line1: string;
  line2: string;
  locality: string;
  city: string;
  state: string;
  pincode: string;
  lat: number | null;
  lng: number | null;
}
interface FormState {
  images: ListingImage[];
  title: string;
  description: string;
  categoryId: string;
  subcategoryId: string;
  condition: Condition;
  priceHourly: string;
  priceDaily: string;
  priceWeekly: string;
  priceMonthly: string;
  securityDeposit: string;
  minValue: string;
  minUnit: Unit;
  maxValue: string;
  maxUnit: Unit;
  instantBooking: boolean;
  pickupAvailable: boolean;
  deliveryAvailable: boolean;
  deliveryFee: string;
  deliveryRadiusKm: string;
  addressMode: "saved" | "new";
  addressId: string;
  address: AddressFields;
  rules: string;
  cancellationPolicy: CancellationPolicy;
}

const EMPTY_ADDRESS: AddressFields = { line1: "", line2: "", locality: "", city: "", state: "", pincode: "", lat: null, lng: null };
const EMPTY: FormState = {
  images: [],
  title: "",
  description: "",
  categoryId: "",
  subcategoryId: "",
  condition: "GOOD",
  priceHourly: "",
  priceDaily: "",
  priceWeekly: "",
  priceMonthly: "",
  securityDeposit: "",
  minValue: "1",
  minUnit: "days",
  maxValue: "",
  maxUnit: "days",
  instantBooking: false,
  pickupAvailable: true,
  deliveryAvailable: false,
  deliveryFee: "",
  deliveryRadiusKm: "5",
  addressMode: "new",
  addressId: "",
  address: EMPTY_ADDRESS,
  rules: "",
  cancellationPolicy: "MODERATE",
};

const splitHours = (h: number | null): [string, Unit] => (h == null ? ["", "days"] : h % 24 === 0 ? [String(h / 24), "days"] : [String(h), "hours"]);
const toHours = (v: string, u: Unit) => (v.trim() === "" ? null : Math.round(Number(v) * (u === "days" ? 24 : 1)));

function fromListing(l: Listing): FormState {
  const [minValue, minUnit] = splitHours(l.minRentalHours);
  const [maxValue, maxUnit] = splitHours(l.maxRentalHours);
  const a = l.address;
  return {
    images: l.images,
    title: l.title,
    description: l.description ?? "",
    categoryId: l.category?.id ?? "",
    subcategoryId: l.subcategory?.id ?? "",
    condition: l.condition,
    priceHourly: toRupees(l.pricing.hourly),
    priceDaily: toRupees(l.pricing.daily),
    priceWeekly: toRupees(l.pricing.weekly),
    priceMonthly: toRupees(l.pricing.monthly),
    securityDeposit: toRupees(l.pricing.securityDeposit),
    minValue,
    minUnit,
    maxValue,
    maxUnit,
    instantBooking: l.instantBooking,
    pickupAvailable: l.pickupAvailable,
    deliveryAvailable: l.deliveryAvailable,
    deliveryFee: toRupees(l.deliveryFee),
    deliveryRadiusKm: l.deliveryRadiusKm ? String(l.deliveryRadiusKm) : "5",
    addressMode: a ? "saved" : "new",
    addressId: a?.id ?? "",
    address: a
      ? { line1: a.line1, line2: a.line2 ?? "", locality: a.locality ?? "", city: a.city, state: a.state ?? "", pincode: a.pincode ?? "", lat: a.lat, lng: a.lng }
      : { ...EMPTY_ADDRESS, lat: l.exactLocation?.lat ?? null, lng: l.exactLocation?.lng ?? null },
    rules: l.rules ?? "",
    cancellationPolicy: l.cancellationPolicy,
  };
}

/** Fields the server keeps fixed while a listing has active bookings. */
type LockKey = "categoryId" | "subcategoryId" | "securityDeposit" | "cancellationPolicy" | "address" | "condition" | "minRentalHours" | "maxRentalHours";
const LOCK_LABEL: Record<LockKey, string> = {
  categoryId: "Category",
  subcategoryId: "Subcategory",
  securityDeposit: "Security deposit",
  cancellationPolicy: "Cancellation policy",
  address: "Pickup address",
  condition: "Condition",
  minRentalHours: "Minimum rental period",
  maxRentalHours: "Maximum rental period",
};
function parseLocked(message: string): LockKey[] {
  const list = message.split(":").pop() ?? "";
  const keys = list.split(",").map((s) => s.trim()).map((s) => (s === "addressId" ? "address" : s));
  return Array.from(new Set(keys.filter((k): k is LockKey => k in LOCK_LABEL)));
}

const STEPS = [
  { key: "photos", label: "Photos", icon: Camera },
  { key: "details", label: "Details", icon: Tag },
  { key: "pricing", label: "Pricing", icon: IndianRupee },
  { key: "location", label: "Location", icon: MapPin },
  { key: "policies", label: "Rules & policies", icon: FileText },
  { key: "review", label: "Review", icon: CheckCircle2 },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

type Errors = Partial<Record<string, string>>;

function validateStep(step: StepKey, f: FormState): Errors {
  const e: Errors = {};
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  if (step === "photos") {
    if (!f.images.length) e.images = "Add at least one photo — listings with 4+ photos get up to 3× more requests.";
  }
  if (step === "details") {
    if (f.title.trim().length < 5) e.title = "Title must be at least 5 characters";
    if (f.title.trim().length > 100) e.title = "Keep the title under 100 characters";
    if (f.description.trim().length < 20) e.description = "Describe the item in at least 20 characters";
    if (!f.categoryId) e.categoryId = "Choose a category";
  }
  if (step === "pricing") {
    const prices = { priceHourly: num(f.priceHourly), priceDaily: num(f.priceDaily), priceWeekly: num(f.priceWeekly), priceMonthly: num(f.priceMonthly), securityDeposit: num(f.securityDeposit) };
    for (const [k, v] of Object.entries(prices)) if (v != null && (!Number.isFinite(v) || v < 0 || v > 1_000_000)) e[k] = "Enter an amount between ₹0 and ₹10,00,000";
    if (!prices.priceDaily && !prices.priceHourly) e.priceDaily = "Set a daily or hourly price";
    const min = toHours(f.minValue, f.minUnit);
    const max = toHours(f.maxValue, f.maxUnit);
    if (!min || min < 1) e.min = "Minimum must be at least 1 hour";
    if (max != null && (max < 1 || (min && max < min))) e.max = "Maximum must be at least the minimum";
    if (!f.pickupAvailable && !f.deliveryAvailable) e.fulfilment = "Offer pickup, delivery or both";
    if (f.deliveryAvailable) {
      if (f.deliveryFee.trim() === "" || Number(f.deliveryFee) < 0) e.deliveryFee = "Set a delivery fee (0 for free delivery)";
      const r = num(f.deliveryRadiusKm);
      if (!r || r < 1 || r > 100) e.deliveryRadiusKm = "Radius must be 1–100 km";
    }
  }
  if (step === "location") {
    if (f.addressMode === "saved") {
      if (!f.addressId) e.addressId = "Choose an address";
    } else {
      if (f.address.line1.trim().length < 3) e.line1 = "Enter the house / flat / street";
      if (f.address.city.trim().length < 2) e.city = "Enter the city";
      if (f.address.pincode && !/^\d{6}$/.test(f.address.pincode)) e.pincode = "Enter a valid 6-digit pincode";
    }
  }
  return e;
}

const draftKey = (uid: string) => `rn-listing-draft:${uid}`;
const hasContent = (f: FormState) => Boolean(f.images.length || f.title || f.description || f.priceDaily || f.priceHourly);

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function ListingFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: config } = usePlatformConfig();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [step, setStep] = useState(0);
  const [maxVisited, setMaxVisited] = useState(isEdit ? STEPS.length - 1 : 0);
  const [errors, setErrors] = useState<Errors>({});
  const [photosBusy, setPhotosBusy] = useState(false);
  const [locked, setLocked] = useState<LockKey[]>([]);
  const [banner, setBanner] = useState<{ code: string; message: string } | null>(null);
  const [limitOpen, setLimitOpen] = useState(false);
  const original = useRef<Listing | null>(null);

  const set = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v })), []);
  const setAddr = useCallback((patch: Partial<AddressFields>) => setForm((f) => ({ ...f, address: { ...f.address, ...patch } })), []);

  /* ----- Load for edit ----- */
  const listingQ = useQuery({
    queryKey: ["listing", id, "owner"],
    queryFn: async () => (await api.get<{ listing: Listing; isOwner: boolean }>(`/listings/${id}`)).data,
    enabled: isEdit,
    staleTime: 0,
  });
  useEffect(() => {
    if (listingQ.data?.listing && original.current?.version !== listingQ.data.listing.version) {
      original.current = listingQ.data.listing;
      setForm(fromListing(listingQ.data.listing));
    }
  }, [listingQ.data]);

  /* ----- Draft persistence (new listings only) ----- */
  const [draftPrompt, setDraftPrompt] = useState<{ form: FormState; step: number; savedAt: string } | null>(null);
  const draftReady = useRef(isEdit);
  useEffect(() => {
    if (isEdit || !user) return;
    try {
      const raw = localStorage.getItem(draftKey(user.id));
      const d = raw ? (JSON.parse(raw) as { form: FormState; step: number; savedAt: string }) : null;
      if (d?.form && hasContent(d.form)) setDraftPrompt(d);
      else draftReady.current = true;
    } catch {
      draftReady.current = true;
    }
  }, [isEdit, user]);
  useEffect(() => {
    if (isEdit || !user || !draftReady.current) return;
    const t = setTimeout(() => {
      try {
        if (hasContent(form)) localStorage.setItem(draftKey(user.id), JSON.stringify({ form, step, savedAt: new Date().toISOString() }));
      } catch {
        /* storage full / disabled — ignore */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [form, step, isEdit, user]);
  const clearDraft = () => {
    try {
      if (user) localStorage.removeItem(draftKey(user.id));
    } catch {
      /* ignore */
    }
  };

  /* ----- Navigation ----- */
  const cur = STEPS[step].key;
  const goTo = (i: number) => {
    setStep(i);
    setMaxVisited((m) => Math.max(m, i));
    setErrors({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const next = () => {
    const e = validateStep(cur, form);
    if (cur === "photos" && photosBusy) e.images = "Please wait for uploads to finish";
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error(Object.values(e)[0]!);
      return;
    }
    goTo(Math.min(step + 1, STEPS.length - 1));
  };
  /** First step that fails validation (used before submit). */
  const firstInvalid = () => STEPS.findIndex((s) => Object.keys(validateStep(s.key, form)).length > 0);

  /* ----- Submit ----- */
  const buildPayload = () => {
    const f = form;
    const payload: Record<string, unknown> = {
      title: f.title.trim(),
      description: f.description.trim(),
      categoryId: f.categoryId,
      subcategoryId: f.subcategoryId || null,
      condition: f.condition,
      priceHourly: toPaise(f.priceHourly),
      priceDaily: toPaise(f.priceDaily),
      priceWeekly: toPaise(f.priceWeekly),
      priceMonthly: toPaise(f.priceMonthly),
      securityDeposit: toPaise(f.securityDeposit) ?? 0,
      minRentalHours: toHours(f.minValue, f.minUnit) ?? 24,
      maxRentalHours: toHours(f.maxValue, f.maxUnit),
      instantBooking: f.instantBooking,
      pickupAvailable: f.pickupAvailable,
      deliveryAvailable: f.deliveryAvailable,
      deliveryFee: f.deliveryAvailable ? toPaise(f.deliveryFee) ?? 0 : null,
      deliveryRadiusKm: f.deliveryAvailable ? Number(f.deliveryRadiusKm) || null : null,
      rules: f.rules.trim() || null,
      cancellationPolicy: f.cancellationPolicy,
      imageIds: f.images.map((i) => i.id),
    };
    // Address: only send when new, or when it changed while editing.
    const o = original.current;
    const newAddress = () => {
      const a = f.address;
      const out: Record<string, unknown> = { line1: a.line1.trim(), city: a.city.trim() };
      if (a.line2.trim()) out.line2 = a.line2.trim();
      if (a.locality.trim()) out.locality = a.locality.trim();
      if (a.state.trim()) out.state = a.state.trim();
      if (a.pincode.trim()) out.pincode = a.pincode.trim();
      if (a.lat != null && a.lng != null) Object.assign(out, { lat: a.lat, lng: a.lng });
      return out;
    };
    if (f.addressMode === "saved") {
      if (!o || o.address?.id !== f.addressId) payload.addressId = f.addressId;
    } else if (!o || JSON.stringify(fromListing(o).address) !== JSON.stringify(f.address)) {
      payload.address = newAddress();
    }
    if (o) {
      payload.version = o.version;
      // Never resend fields the server told us are locked.
      for (const k of locked) {
        delete payload[k];
        if (k === "address") {
          delete payload.address;
          delete payload.addressId;
        }
      }
    }
    return payload;
  };

  const handleError = (e: unknown) => {
    const code = apiErrorCode(e);
    const message = apiError(e);
    switch (code) {
      case "LISTING_LIMIT":
        setLimitOpen(true);
        return;
      case "FIELDS_LOCKED": {
        const keys = parseLocked(message);
        setLocked((l) => Array.from(new Set([...l, ...keys])));
        // Revert locked fields to their saved values so a re-save succeeds.
        if (original.current) {
          const orig = fromListing(original.current);
          setForm((f) => {
            const n = { ...f };
            if (keys.includes("categoryId") || keys.includes("subcategoryId")) Object.assign(n, { categoryId: orig.categoryId, subcategoryId: orig.subcategoryId });
            if (keys.includes("securityDeposit")) n.securityDeposit = orig.securityDeposit;
            if (keys.includes("cancellationPolicy")) n.cancellationPolicy = orig.cancellationPolicy;
            if (keys.includes("condition")) n.condition = orig.condition;
            if (keys.includes("minRentalHours")) Object.assign(n, { minValue: orig.minValue, minUnit: orig.minUnit });
            if (keys.includes("maxRentalHours")) Object.assign(n, { maxValue: orig.maxValue, maxUnit: orig.maxUnit });
            if (keys.includes("address")) Object.assign(n, { addressMode: orig.addressMode, addressId: orig.addressId, address: orig.address });
            return n;
          });
        }
        setBanner({ code, message: `These fields can't be changed while the listing has active or upcoming bookings: ${keys.map((k) => LOCK_LABEL[k]).join(", ")}. We've restored their saved values — save again to apply your other changes.` });
        return;
      }
      case "PROHIBITED_ITEM":
        setBanner({ code, message });
        goTo(1);
        return;
      case "INVALID_ADDRESS":
        setErrors({ line1: message });
        setBanner({ code, message });
        goTo(3);
        return;
      case "VERIFICATION_REQUIRED":
        set("instantBooking", false);
        setBanner({ code, message });
        goTo(2);
        return;
      case "PHONE_VERIFICATION_REQUIRED":
      case "STALE_VERSION":
        setBanner({ code, message });
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      default:
        toast.error(message);
    }
  };

  const save = useMutation({
    mutationFn: async ({ publish }: { publish: boolean }) => {
      const payload = buildPayload();
      if (!isEdit) return { listing: (await api.post<{ listing: Listing }>("/listings", { ...payload, publish })).data.listing, published: publish };
      let listing = (await api.patch<{ listing: Listing }>(`/listings/${id}`, payload)).data.listing;
      if (publish && (listing.status === "DRAFT" || listing.status === "PAUSED")) {
        const r = await api.post<{ status: Listing["status"] }>(`/listings/${id}/status`, { status: "ACTIVE" });
        listing = { ...listing, status: r.data.status };
      }
      return { listing, published: publish };
    },
    onSuccess: ({ listing }) => {
      clearDraft();
      qc.invalidateQueries({ queryKey: ["listings", "mine"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.removeQueries({ queryKey: ["listing", id, "owner"] });
      const msg: Record<string, string> = {
        ACTIVE: isEdit ? "Changes saved — your listing is live" : "Your listing is live! 🎉",
        PENDING_REVIEW: "Submitted for review — we'll notify you once it's approved",
        DRAFT: "Saved as draft",
        PAUSED: "Changes saved (listing is paused)",
        REJECTED: "Changes saved",
      };
      toast.success(msg[listing.status] ?? "Saved");
      navigate(listing.status === "DRAFT" ? "/dashboard/listings?status=DRAFT" : "/dashboard/listings");
    },
    onError: handleError,
  });

  const submit = (publish: boolean) => {
    setBanner(null);
    if (photosBusy) return void toast.error("Please wait for photo uploads to finish");
    // Drafts only need the basics; publishing needs every step valid.
    if (publish || isEdit) {
      const bad = firstInvalid();
      if (bad !== -1) {
        goTo(bad);
        setErrors(validateStep(STEPS[bad].key, form));
        toast.error(`Please complete “${STEPS[bad].label}”`);
        return;
      }
    } else {
      const e = { ...validateStep("details", form), ...validateStep("pricing", form), ...validateStep("location", form) };
      if (Object.keys(e).length) {
        const bad = firstInvalid();
        goTo(bad === -1 ? 1 : bad);
        setErrors(e);
        toast.error("Drafts need a title, description, category, price and address");
        return;
      }
    }
    save.mutate({ publish });
  };

  /* ----- Render ----- */
  if (isEdit && listingQ.isLoading) {
    return (
      <div>
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="mt-6 h-12 w-full rounded-2xl" />
        <Skeleton className="mt-6 h-96 w-full rounded-2xl" />
      </div>
    );
  }
  if (isEdit && listingQ.isError) return <ErrorState error={listingQ.error} onRetry={() => listingQ.refetch()} />;

  const l = original.current;
  const isLocked = (k: LockKey) => locked.includes(k);
  const commission = user?.isPro ? config?.fees.proOwnerCommissionRate : config?.fees.ownerCommissionRate;

  return (
    <div className="pb-28 lg:pb-8">
      <Seo title={isEdit ? "Edit listing" : "List an item"} noindex />
      <PageHeader
        back={{ to: "/dashboard/listings", label: "My listings" }}
        title={isEdit ? "Edit listing" : "List an item"}
        subtitle={isEdit ? l?.title : "It takes about 5 minutes. Your progress is saved automatically on this device."}
        action={isEdit && l ? <Badge tone={l.status === "ACTIVE" ? "green" : l.status === "REJECTED" ? "red" : "gray"}>{l.status.replace("_", " ").toLowerCase()}</Badge> : undefined}
      />

      {/* Restore draft prompt */}
      {draftPrompt && (
        <Alert tone="brand" className="mb-5" icon={<RotateCcw className="h-4 w-4" />} title="Continue where you left off?">
          <p>You have an unsaved listing{draftPrompt.form.title ? ` “${draftPrompt.form.title}”` : ""} from {new Date(draftPrompt.savedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.</p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                setForm({ ...EMPTY, ...draftPrompt.form, address: { ...EMPTY_ADDRESS, ...draftPrompt.form.address } });
                setStep(Math.min(draftPrompt.step ?? 0, STEPS.length - 1));
                setMaxVisited(Math.min(draftPrompt.step ?? 0, STEPS.length - 1));
                setDraftPrompt(null);
                draftReady.current = true;
              }}
            >
              Restore draft
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                clearDraft();
                setDraftPrompt(null);
                draftReady.current = true;
              }}
            >
              Start fresh
            </Button>
          </div>
        </Alert>
      )}

      {/* Verification / quota notices */}
      {user && !user.phoneVerified && (
        <Alert tone="amber" className="mb-5" icon={<Phone className="h-4 w-4" />} title="Verify your phone to publish">
          You can prepare your listing now, but saving requires a verified phone number.{" "}
          <Link className="font-semibold underline" to={`/verify-phone?next=${encodeURIComponent(loc.pathname)}`}>Verify phone</Link>
        </Alert>
      )}
      {isEdit && l?.status === "REJECTED" && l.rejectionReason && (
        <Alert tone="red" className="mb-5" icon={<Ban className="h-4 w-4" />} title="Your listing needs changes">
          {l.rejectionReason} — update the listing and save to resubmit it for review.
        </Alert>
      )}
      {banner && <ErrorBanner banner={banner} onReload={() => { setBanner(null); original.current = null; listingQ.refetch(); }} next={loc.pathname} />}
      {locked.length > 0 && !banner && (
        <Alert tone="gray" className="mb-5" icon={<Lock className="h-4 w-4" />} title="Some fields are locked">
          {locked.map((k) => LOCK_LABEL[k]).join(", ")} can't be changed while this listing has active or upcoming bookings.
        </Alert>
      )}

      {/* Progress */}
      <StepProgress step={step} maxVisited={maxVisited} onJump={(i) => i <= maxVisited && goTo(i)} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card className="min-w-0">
          {cur === "photos" && (
            <StepSection title="Add photos" subtitle="Great photos are the #1 reason renters choose an item. Show it from every angle, plus accessories.">
              <ListingPhotos images={form.images} onChange={(upd) => setForm((f) => ({ ...f, images: upd(f.images) }))} onBusyChange={setPhotosBusy} />
              {errors.images && <p className="mt-2 text-sm text-red-600">{errors.images}</p>}
            </StepSection>
          )}
          {cur === "details" && <DetailsStep form={form} set={set} errors={errors} isLocked={isLocked} config={config} />}
          {cur === "pricing" && <PricingStep form={form} set={set} errors={errors} isLocked={isLocked} commission={commission} gst={config?.fees.gstRate ?? 0.18} verified={Boolean(user?.isVerified)} />}
          {cur === "location" && <LocationStep form={form} set={set} setAddr={setAddr} errors={errors} locked={isLocked("address")} />}
          {cur === "policies" && <PoliciesStep form={form} set={set} isLocked={isLocked} config={config} />}
          {cur === "review" && <ReviewStep form={form} goTo={goTo} commission={commission} gst={config?.fees.gstRate ?? 0.18} />}

          {/* Step nav (desktop) */}
          <div className="mt-8 hidden items-center justify-between gap-3 border-t border-slate-100 pt-5 lg:flex">
            <Button variant="ghost" disabled={step === 0} onClick={() => goTo(step - 1)} icon={<ArrowLeft className="h-4 w-4" />}>
              Back
            </Button>
            <div className="flex gap-2">
              {(!isEdit || l?.status === "DRAFT") && (
                <Button variant="outline" loading={save.isPending && save.variables?.publish === false} onClick={() => submit(false)} icon={<Save className="h-4 w-4" />}>
                  {isEdit ? "Save draft" : "Save draft"}
                </Button>
              )}
              {isEdit && l?.status !== "DRAFT" && (
                <Button variant={cur === "review" ? "primary" : "outline"} loading={save.isPending} onClick={() => submit(false)} icon={<Save className="h-4 w-4" />}>
                  Save changes
                </Button>
              )}
              {cur !== "review" ? (
                <Button onClick={next} icon={<ArrowRight className="h-4 w-4" />}>Continue</Button>
              ) : (
                (!isEdit || l?.status === "DRAFT") && (
                  <Button loading={save.isPending && save.variables?.publish === true} onClick={() => submit(true)} icon={<Sparkles className="h-4 w-4" />}>
                    Publish listing
                  </Button>
                )
              )}
            </div>
          </div>
        </Card>

        {/* Tips sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-4">
            <TipsCard step={cur} />
            {form.images[0] && (
              <Card padded={false} className="overflow-hidden">
                <img src={form.images[0].mediumUrl || form.images[0].thumbUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                <div className="p-4">
                  <p className="line-clamp-1 font-semibold text-slate-900">{form.title || "Your item title"}</p>
                  <p className="text-sm text-slate-600">
                    {form.priceDaily ? `${money(toPaise(form.priceDaily))} / day` : form.priceHourly ? `${money(toPaise(form.priceHourly))} / hour` : "Set a price"}
                  </p>
                </div>
              </Card>
            )}
          </div>
        </aside>
      </div>

      {/* Sticky mobile nav */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:bottom-0 lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <Button variant="ghost" disabled={step === 0} onClick={() => goTo(step - 1)} aria-label="Back" icon={<ArrowLeft className="h-4 w-4" />} />
          <Button variant="outline" className="flex-1" loading={save.isPending && save.variables?.publish === false} onClick={() => submit(false)}>
            {isEdit && l?.status !== "DRAFT" ? "Save" : "Save draft"}
          </Button>
          {cur !== "review" ? (
            <Button className="flex-1" onClick={next}>Continue</Button>
          ) : (
            (!isEdit || l?.status === "DRAFT") && (
              <Button className="flex-1" loading={save.isPending && save.variables?.publish === true} onClick={() => submit(true)}>Publish</Button>
            )
          )}
        </div>
      </div>

      {/* Listing limit → upgrade */}
      <Modal
        open={limitOpen}
        onClose={() => setLimitOpen(false)}
        title="You've reached your listing limit"
        footer={
          <>
            <Button variant="ghost" onClick={() => setLimitOpen(false)}>Not now</Button>
            <ButtonLink to="/dashboard/pro" icon={<Crown className="h-4 w-4" />}>Upgrade to Pro</ButtonLink>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Free accounts can have a limited number of listings. Upgrade to <b>Owner Pro</b> to list many more items, pay a lower commission and unlock analytics. Your progress here is saved as a local draft.
        </p>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function StepSection({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function StepProgress({ step, maxVisited, onJump }: { step: number; maxVisited: number; onJump: (i: number) => void }) {
  return (
    <nav aria-label="Progress">
      <div className="mb-2 flex items-center justify-between text-sm sm:hidden">
        <span className="font-semibold text-slate-900">{STEPS[step].label}</span>
        <span className="text-slate-500">Step {step + 1} of {STEPS.length}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 sm:hidden">
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>
      <ol className="hidden items-center gap-2 sm:flex">
        {STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          const Icon = s.icon;
          return (
            <li key={s.key} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => onJump(i)}
                disabled={i > maxVisited}
                aria-current={active ? "step" : undefined}
                className={clsx(
                  "flex min-w-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-medium transition",
                  active ? "bg-brand-50 text-brand-700" : done ? "text-slate-700 hover:bg-slate-100" : "text-slate-400",
                  i > maxVisited && "cursor-not-allowed",
                )}
              >
                <span className={clsx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", active ? "bg-brand-600 text-white" : done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500")}>
                  {done ? <Check className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
                </span>
                <span className="hidden truncate xl:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && <span className={clsx("h-px flex-1", i < step ? "bg-emerald-400" : "bg-slate-200")} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ErrorBanner({ banner, onReload, next }: { banner: { code: string; message: string }; onReload: () => void; next: string }) {
  const map: Record<string, { title: string; tone: "red" | "amber"; action?: ReactNode }> = {
    STALE_VERSION: { title: "This listing was changed elsewhere", tone: "amber", action: <Button size="sm" variant="outline" onClick={onReload} icon={<RotateCcw className="h-4 w-4" />}>Reload latest version</Button> },
    PHONE_VERIFICATION_REQUIRED: { title: "Verify your phone number first", tone: "amber", action: <ButtonLink size="sm" to={`/verify-phone?next=${encodeURIComponent(next)}`} icon={<Phone className="h-4 w-4" />}>Verify phone</ButtonLink> },
    PROHIBITED_ITEM: { title: "This item can't be listed", tone: "red", action: <Link to="/terms" className="font-semibold underline">Prohibited items policy</Link> },
    FIELDS_LOCKED: { title: "Some changes weren't allowed", tone: "amber" },
    VERIFICATION_REQUIRED: { title: "Instant booking needs ID verification", tone: "amber", action: <Link to="/dashboard/settings#kyc" className="font-semibold underline">Verify your ID</Link> },
    INVALID_ADDRESS: { title: "We couldn't find this address", tone: "red" },
  };
  const m = map[banner.code] ?? { title: "Couldn't save", tone: "red" as const };
  return (
    <Alert tone={m.tone} className="mb-5" icon={<AlertTriangle className="h-4 w-4" />} title={m.title}>
      <p>{banner.message}</p>
      {m.action && <div className="mt-2">{m.action}</div>}
    </Alert>
  );
}

const TIPS: Record<StepKey, { title: string; tips: string[] }> = {
  photos: { title: "Photo tips", tips: ["Use natural light and a plain background", "Show accessories, cables and cases", "Include a close-up of the model/serial label", "Landscape photos look best in search"] },
  details: { title: "Writing tips", tips: ["Include brand & model in the title", "Mention what's included in the box", "Be honest about wear and tear", "Add who it's great for (e.g. travel, events)"] },
  pricing: { title: "Pricing tips", tips: ["Check similar items nearby", "Weekly/monthly discounts win longer rentals", "Deposit ≈ 20–40% of item value is typical", "Instant booking gets ~2× more bookings"] },
  location: { title: "Your privacy", tips: ["Renters only see an approximate area", "The exact address is shared after payment", "Pick a convenient, safe pickup spot"] },
  policies: { title: "Policy tips", tips: ["Moderate is the most popular choice", "Keep rules short and clear", "Mention ID or usage requirements"] },
  review: { title: "Almost done", tips: ["Double-check prices and deposit", "Listings may be reviewed before going live", "You can edit or pause any time"] },
};
function TipsCard({ step }: { step: StepKey }) {
  const t = TIPS[step];
  return (
    <Card className="bg-gradient-to-br from-brand-50 to-white">
      <p className="flex items-center gap-2 font-semibold text-brand-800">
        <Sparkles className="h-4 w-4" /> {t.title}
      </p>
      <ul className="mt-3 space-y-2 text-sm text-slate-700">
        {t.tips.map((x) => (
          <li key={x} className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /> {x}
          </li>
        ))}
      </ul>
    </Card>
  );
}

type SetFn = <K extends keyof FormState>(k: K, v: FormState[K]) => void;
const LockHint = () => (
  <span className="ml-1 inline-flex items-center gap-0.5 text-xs font-normal text-slate-500">
    <Lock className="h-3 w-3" /> locked
  </span>
);

/* ------------------------------------------------------------------ */
/* Details                                                             */
/* ------------------------------------------------------------------ */

function DetailsStep({ form, set, errors, isLocked, config }: { form: FormState; set: SetFn; errors: Errors; isLocked: (k: LockKey) => boolean; config?: PlatformConfig }) {
  const cats = useCategories();
  const parent = cats.data?.find((c) => c.id === form.categoryId);
  const hit = useMemo(() => {
    const text = `${form.title} ${form.description}`.toLowerCase();
    return config?.prohibitedKeywords.find((k) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
  }, [form.title, form.description, config]);

  return (
    <StepSection title="Describe your item" subtitle="Clear, honest details build trust and reduce questions.">
      <div className="space-y-5">
        <Input label="Title" name="title" value={form.title} maxLength={100} onChange={(e) => set("title", e.target.value)} error={errors.title} placeholder="e.g. Sony A7 III mirrorless camera with 28-70mm lens" hint={`${form.title.length}/100`} />
        <Textarea
          label="Description"
          name="description"
          value={form.description}
          maxLength={5000}
          rows={7}
          onChange={(e) => set("description", e.target.value)}
          error={errors.description}
          placeholder={"What's included, condition details, ideal uses, anything renters should know…"}
          hint={`${form.description.length}/5000`}
        />
        {hit && (
          <Alert tone="red" icon={<Ban className="h-4 w-4" />} title="Possible prohibited item">
            Your text mentions “{hit}”. Items like weapons, drugs, alcohol and counterfeit goods can't be listed.
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={<>Category{isLocked("categoryId") && <LockHint />}</>}
            name="categoryId"
            value={form.categoryId}
            disabled={isLocked("categoryId") || cats.isLoading}
            onChange={(e) => {
              set("categoryId", e.target.value);
              set("subcategoryId", "");
            }}
            error={errors.categoryId}
          >
            <option value="">{cats.isLoading ? "Loading…" : "Choose a category"}</option>
            {cats.data?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Select
            label={<>Subcategory{isLocked("subcategoryId") && <LockHint />}</>}
            name="subcategoryId"
            value={form.subcategoryId}
            disabled={!parent?.children?.length || isLocked("subcategoryId")}
            onChange={(e) => set("subcategoryId", e.target.value)}
          >
            <option value="">{parent?.children?.length ? "Optional" : "—"}</option>
            {parent?.children?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <fieldset disabled={isLocked("condition")}>
          <legend className="label">Condition{isLocked("condition") && <LockHint />}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(CONDITION_LABEL) as Condition[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set("condition", c)}
                aria-pressed={form.condition === c}
                className={clsx("rounded-xl border px-3 py-2.5 text-sm font-medium transition disabled:opacity-60", form.condition === c ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-700 hover:bg-slate-50")}
              >
                {CONDITION_LABEL[c]}
              </button>
            ))}
          </div>
        </fieldset>
        {config && config.prohibitedKeywords.length > 0 && (
          <details className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-700">What can't be listed?</summary>
            <p className="mt-2">Weapons, drugs, alcohol, tobacco, counterfeit or stolen goods, wildlife products, prescription medicines and adult services are not allowed. Listings mentioning terms like: {config.prohibitedKeywords.slice(0, 12).join(", ")}… are blocked automatically.</p>
          </details>
        )}
      </div>
    </StepSection>
  );
}

/* ------------------------------------------------------------------ */
/* Pricing                                                             */
/* ------------------------------------------------------------------ */

function PricingStep({ form, set, errors, isLocked, commission, gst, verified }: { form: FormState; set: SetFn; errors: Errors; isLocked: (k: LockKey) => boolean; commission?: number; gst: number; verified: boolean }) {
  const daily = Number(form.priceDaily) || 0;
  const earn = (rupees: number) => (commission == null ? null : Math.round(rupees * 100 * (1 - commission * (1 + gst))));
  const suggest = (k: "priceWeekly" | "priceMonthly", mult: number) =>
    daily > 0 && !form[k] ? (
      <button type="button" className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => set(k, String(Math.round(daily * mult)))}>
        Use suggested {money(Math.round(daily * mult * 100))}
      </button>
    ) : null;

  return (
    <StepSection title="Set your price" subtitle="All prices in ₹. Renters pay a separate service fee — you set what you earn before commission.">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Daily price" prefix="₹" type="number" inputMode="decimal" min={0} name="priceDaily" value={form.priceDaily} onChange={(e) => set("priceDaily", e.target.value)} error={errors.priceDaily} placeholder="e.g. 800" hint="Most renters book by the day" />
          <Input label="Hourly price (optional)" prefix="₹" type="number" inputMode="decimal" min={0} name="priceHourly" value={form.priceHourly} onChange={(e) => set("priceHourly", e.target.value)} error={errors.priceHourly} placeholder="e.g. 150" />
          <div>
            <Input label="Weekly price (optional)" prefix="₹" type="number" inputMode="decimal" min={0} name="priceWeekly" value={form.priceWeekly} onChange={(e) => set("priceWeekly", e.target.value)} error={errors.priceWeekly} placeholder={daily ? String(Math.round(daily * 5.5)) : ""} />
            <div className="mt-1">{suggest("priceWeekly", 5.5)}</div>
          </div>
          <div>
            <Input label="Monthly price (optional)" prefix="₹" type="number" inputMode="decimal" min={0} name="priceMonthly" value={form.priceMonthly} onChange={(e) => set("priceMonthly", e.target.value)} error={errors.priceMonthly} placeholder={daily ? String(Math.round(daily * 18)) : ""} />
            <div className="mt-1">{suggest("priceMonthly", 18)}</div>
          </div>
        </div>

        {commission != null && (daily > 0 || Number(form.priceHourly) > 0) && (
          <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-inset ring-emerald-200">
            <p className="text-sm font-semibold text-emerald-800">You'll earn</p>
            <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-emerald-900">
              {daily > 0 && <span><b className="text-xl">{money(earn(daily))}</b> / day</span>}
              {Number(form.priceHourly) > 0 && <span><b className="text-xl">{money(earn(Number(form.priceHourly)))}</b> / hour</span>}
              {Number(form.priceWeekly) > 0 && <span><b>{money(earn(Number(form.priceWeekly)))}</b> / week</span>}
            </div>
            <p className="mt-1 text-xs text-emerald-700">After {pct(commission)} platform commission + {pct(gst)} GST on commission.</p>
          </div>
        )}

        <Input
          label={<>Refundable security deposit{isLocked("securityDeposit") && <LockHint />}</>}
          prefix="₹"
          type="number"
          inputMode="decimal"
          min={0}
          name="securityDeposit"
          value={form.securityDeposit}
          disabled={isLocked("securityDeposit")}
          onChange={(e) => set("securityDeposit", e.target.value)}
          error={errors.securityDeposit}
          placeholder="e.g. 5000"
          hint="Held by the platform and refunded to the renter after return & inspection. Used to cover damage or late fees."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <PeriodField label={<>Minimum rental{isLocked("minRentalHours") && <LockHint />}</>} value={form.minValue} unit={form.minUnit} onValue={(v) => set("minValue", v)} onUnit={(u) => set("minUnit", u)} error={errors.min} disabled={isLocked("minRentalHours")} />
          <PeriodField label={<>Maximum rental (optional){isLocked("maxRentalHours") && <LockHint />}</>} value={form.maxValue} unit={form.maxUnit} onValue={(v) => set("maxValue", v)} onUnit={(u) => set("maxUnit", u)} error={errors.max} disabled={isLocked("maxRentalHours")} placeholder="No limit" />
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <Toggle
            checked={form.instantBooking}
            onChange={(v) => set("instantBooking", v)}
            label={<span className="inline-flex items-center gap-1.5"><Zap className="h-4 w-4 text-brand-600" /> Instant booking</span>}
            description="Renters can book without waiting for your approval. Available to ID-verified owners only."
          />
          {form.instantBooking && !verified && (
            <p className="mt-2 text-xs text-amber-700">
              You'll need a verified phone and ID to enable this. <Link to="/dashboard/settings#kyc" className="font-semibold underline">Verify now</Link>
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900"><Truck className="h-4 w-4 text-slate-500" /> Pickup & delivery</p>
          <div className="space-y-4">
            <Toggle checked={form.pickupAvailable} onChange={(v) => set("pickupAvailable", v)} label="Renter picks up" description="From your address (shared after payment)" />
            <Toggle checked={form.deliveryAvailable} onChange={(v) => set("deliveryAvailable", v)} label="I can deliver" description="You drop off and collect the item" />
            {form.deliveryAvailable && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Delivery fee (round trip)" prefix="₹" type="number" min={0} inputMode="decimal" value={form.deliveryFee} onChange={(e) => set("deliveryFee", e.target.value)} error={errors.deliveryFee} placeholder="0 for free" />
                <Input label="Delivery radius" suffix="km" type="number" min={1} max={100} value={form.deliveryRadiusKm} onChange={(e) => set("deliveryRadiusKm", e.target.value)} error={errors.deliveryRadiusKm} />
              </div>
            )}
            {errors.fulfilment && <p className="text-sm text-red-600">{errors.fulfilment}</p>}
          </div>
        </div>
      </div>
    </StepSection>
  );
}

function PeriodField({ label, value, unit, onValue, onUnit, error, disabled, placeholder }: { label: ReactNode; value: string; unit: Unit; onValue: (v: string) => void; onUnit: (u: Unit) => void; error?: string; disabled?: boolean; placeholder?: string }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex gap-2">
        <input type="number" min={1} className={clsx("input", error && "border-red-400")} value={value} onChange={(e) => onValue(e.target.value)} disabled={disabled} placeholder={placeholder} aria-label={typeof label === "string" ? label : "Rental period"} />
        <select className="input w-28 shrink-0" value={unit} onChange={(e) => onUnit(e.target.value as Unit)} disabled={disabled} aria-label="Unit">
          <option value="hours">hours</option>
          <option value="days">days</option>
        </select>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Location                                                            */
/* ------------------------------------------------------------------ */

function LocationStep({ form, set, setAddr, errors, locked }: { form: FormState; set: SetFn; setAddr: (p: Partial<AddressFields>) => void; errors: Errors; locked: boolean }) {
  const addresses = useQuery({ queryKey: ["addresses"], queryFn: async () => (await api.get<{ addresses: SavedAddress[] }>("/users/me/addresses")).data.addresses });
  const userLoc = useLocationStore((s) => s.location);
  const [locating, setLocating] = useState(false);
  const fallback = { lat: userLoc?.lat ?? 12.9716, lng: userLoc?.lng ?? 77.5946 };
  const a = form.address;

  // Default to a saved address when the user has one and hasn't typed anything.
  const didDefault = useRef(false);
  useEffect(() => {
    if (didDefault.current || !addresses.data?.length) return;
    didDefault.current = true;
    if (!form.addressId && !a.line1 && form.addressMode === "new") {
      const def = addresses.data.find((x) => x.isDefault) ?? addresses.data[0];
      set("addressMode", "saved");
      set("addressId", def.id);
    }
  }, [addresses.data, form.addressId, form.addressMode, a.line1, set]);

  /** Fill empty text fields from a reverse-geocoded pin. */
  const reverseFill = async (lat: number, lng: number) => {
    try {
      const r = await api.get<{ place: { city: string | null; locality?: string; state?: string; pincode?: string } }>("/locations/reverse", { params: { lat, lng } });
      const p = r.data.place;
      setAddr({
        lat,
        lng,
        ...(p.city && !a.city ? { city: p.city } : {}),
        ...(p.locality && !a.locality ? { locality: p.locality } : {}),
        ...(p.state && !a.state ? { state: p.state } : {}),
        ...(p.pincode && !a.pincode ? { pincode: p.pincode } : {}),
      });
    } catch {
      /* the pin itself is still set */
    }
  };
  const onPin = (lat: number, lng: number) => {
    setAddr({ lat, lng });
    if (!a.city || !a.locality) void reverseFill(lat, lng);
  };
  const locateFromText = async () => {
    const q = [a.line2, a.locality, a.city, a.pincode].filter((s) => s.trim()).join(", ");
    if (q.length < 3) return void toast.error("Enter a locality, city or pincode first");
    setLocating(true);
    try {
      const r = await api.get<{ results: { lat: number; lng: number }[] }>("/locations/search", { params: { q } });
      const hit = r.data.results[0];
      if (hit) setAddr({ lat: hit.lat, lng: hit.lng });
      else toast.error("Couldn't find that place — drop the pin manually.");
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setLocating(false);
    }
  };
  const useGps = async () => {
    setLocating(true);
    const c = await getCoords();
    setLocating(false);
    if (!c) return void toast.error("Location permission denied or unavailable");
    onPin(c.lat, c.lng);
    void reverseFill(c.lat, c.lng);
  };

  return (
    <StepSection title="Where's the item?" subtitle="Renters see only an approximate area (about 500 m) until a booking is paid.">
      {locked && (
        <Alert tone="gray" className="mb-4" icon={<Lock className="h-4 w-4" />}>
          The pickup address is locked while this listing has active or upcoming bookings.
        </Alert>
      )}
      <fieldset disabled={locked} className="space-y-4">
        {addresses.isLoading ? (
          <Skeleton className="h-20 w-full rounded-2xl" />
        ) : (
          addresses.data &&
          addresses.data.length > 0 && (
            <div className="space-y-2" role="radiogroup" aria-label="Pickup address">
              {addresses.data.map((ad) => (
                <label key={ad.id} className={clsx("flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition", form.addressMode === "saved" && form.addressId === ad.id ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50")}>
                  <input type="radio" name="address" className="mt-1 text-brand-600" checked={form.addressMode === "saved" && form.addressId === ad.id} onChange={() => { set("addressMode", "saved"); set("addressId", ad.id); }} />
                  <span className="min-w-0 text-sm">
                    <span className="flex items-center gap-2 font-semibold text-slate-900">
                      {ad.label || ad.locality}
                      {ad.isDefault && <Badge tone="brand">Default</Badge>}
                    </span>
                    <span className="block text-slate-600">{[ad.line1, ad.line2, ad.locality, ad.city, ad.pincode].filter(Boolean).join(", ")}</span>
                  </span>
                </label>
              ))}
              <label className={clsx("flex cursor-pointer items-center gap-3 rounded-2xl border p-3.5 text-sm font-semibold transition", form.addressMode === "new" ? "border-brand-500 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-700 hover:bg-slate-50")}>
                <input type="radio" name="address" className="text-brand-600" checked={form.addressMode === "new"} onChange={() => set("addressMode", "new")} />
                Use a new address
              </label>
              {errors.addressId && <p className="text-sm text-red-600">{errors.addressId}</p>}
            </div>
          )
        )}

        {form.addressMode === "new" && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="House / flat / street" name="line1" value={a.line1} onChange={(e) => setAddr({ line1: e.target.value })} error={errors.line1} placeholder="e.g. 12, 3rd Cross, HAL 2nd Stage" autoComplete="address-line1" />
              <Input label="Landmark / area (optional)" name="line2" value={a.line2} onChange={(e) => setAddr({ line2: e.target.value })} placeholder="e.g. Near Metro station" autoComplete="address-line2" />
              <Input label="Locality" name="locality" value={a.locality} onChange={(e) => setAddr({ locality: e.target.value })} placeholder="e.g. Indiranagar" />
              <Input label="City" name="city" value={a.city} onChange={(e) => setAddr({ city: e.target.value })} error={errors.city} placeholder="e.g. Bengaluru" autoComplete="address-level2" />
              <Input label="State (optional)" name="state" value={a.state} onChange={(e) => setAddr({ state: e.target.value })} placeholder="e.g. Karnataka" autoComplete="address-level1" />
              <Input label="Pincode" name="pincode" inputMode="numeric" maxLength={6} value={a.pincode} onChange={(e) => setAddr({ pincode: e.target.value.replace(/\D/g, "") })} error={errors.pincode} placeholder="560038" autoComplete="postal-code" />
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700"><MapPinned className="h-4 w-4" /> Drop a pin on the exact spot</p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={locateFromText} disabled={locating} icon={<Search className="h-4 w-4" />}>Find on map</Button>
                  <Button type="button" size="sm" variant="outline" onClick={useGps} disabled={locating} icon={locating ? <Spinner className="h-4 w-4" /> : <Crosshair className="h-4 w-4" />}>My location</Button>
                </div>
              </div>
              <Suspense fallback={<Skeleton className="h-72 w-full rounded-2xl sm:h-80" />}>
                <LocationPinMap lat={a.lat} lng={a.lng} fallback={fallback} onChange={onPin} />
              </Suspense>
              <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                {a.lat != null ? `Pin set at ${a.lat.toFixed(5)}, ${a.lng!.toFixed(5)}. ` : "Tap the map to place the pin (optional — we'll locate the address otherwise). "}
                Only an approximate location is shown publicly.
              </p>
            </div>
          </div>
        )}
      </fieldset>
    </StepSection>
  );
}

/* ------------------------------------------------------------------ */
/* Rules & policies                                                    */
/* ------------------------------------------------------------------ */

function describeTier(t: { hoursBefore: number; refundPercent: number }, i: number, all: { hoursBefore: number }[]) {
  const when = t.hoursBefore === 0 ? (i > 0 ? `Less than ${fmtHours(all[i - 1].hoursBefore)} before` : "Any time before start") : `${fmtHours(t.hoursBefore)}+ before start`;
  return `${when}: ${t.refundPercent}% refund of rent`;
}
const fmtHours = (h: number) => (h >= 24 && h % 24 === 0 ? `${h / 24} day${h / 24 > 1 ? "s" : ""}` : `${h} hours`);

const POLICY_BLURB: Record<CancellationPolicy, string> = {
  FLEXIBLE: "Most attractive to renters",
  MODERATE: "Balanced — most popular",
  STRICT: "Best for high-demand items",
};

function PoliciesStep({ form, set, isLocked, config }: { form: FormState; set: SetFn; isLocked: (k: LockKey) => boolean; config?: PlatformConfig }) {
  const lockedPolicy = isLocked("cancellationPolicy");
  return (
    <StepSection title="Rules & cancellation" subtitle="Set expectations up front to avoid misunderstandings.">
      <div className="space-y-6">
        <Textarea
          label="Rules for renters (optional)"
          value={form.rules}
          maxLength={2000}
          rows={5}
          onChange={(e) => set("rules", e.target.value)}
          placeholder={"e.g.\n• Government ID required at pickup\n• Not for commercial shoots\n• Return fully charged"}
          hint={`${form.rules.length}/2000`}
        />
        <div>
          <p className="label">Cancellation policy{lockedPolicy && <LockHint />}</p>
          <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Cancellation policy">
            {(["FLEXIBLE", "MODERATE", "STRICT"] as CancellationPolicy[]).map((p) => {
              const tiers = [...(config?.cancellationPolicies[p] ?? [])].sort((a, b) => b.hoursBefore - a.hoursBefore);
              const active = form.cancellationPolicy === p;
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={lockedPolicy}
                  onClick={() => set("cancellationPolicy", p)}
                  className={clsx("rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60", active ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 hover:bg-slate-50")}
                >
                  <p className="flex items-center justify-between font-semibold text-slate-900">
                    {p.charAt(0) + p.slice(1).toLowerCase()}
                    {active && <CheckCircle2 className="h-5 w-5 text-brand-600" />}
                  </p>
                  <p className="text-xs font-medium text-brand-700">{POLICY_BLURB[p]}</p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {tiers.map((t, i) => (
                      <li key={t.hoursBefore}>{describeTier(t, i, tiers)}</li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Deposits are always refunded in full on cancellation. If you cancel a paid booking, the renter gets a full refund and a penalty applies to you.
          </p>
        </div>
      </div>
    </StepSection>
  );
}

/* ------------------------------------------------------------------ */
/* Review                                                              */
/* ------------------------------------------------------------------ */

function ReviewStep({ form, goTo, commission, gst }: { form: FormState; goTo: (i: number) => void; commission?: number; gst: number }) {
  const cats = useCategories();
  const cat = cats.data?.find((c) => c.id === form.categoryId);
  const sub = cat?.children?.find((c) => c.id === form.subcategoryId);
  const addresses = useQuery({ queryKey: ["addresses"], queryFn: async () => (await api.get<{ addresses: SavedAddress[] }>("/users/me/addresses")).data.addresses });
  const saved = addresses.data?.find((x) => x.id === form.addressId);
  const addr = form.addressMode === "saved" ? saved : form.address;
  const issues = STEPS.slice(0, 5).filter((s) => Object.keys(validateStep(s.key, form)).length);
  const period = (v: string, u: Unit) => (v ? `${v} ${u}` : "No limit");

  const Section = ({ i, title, children }: { i: number; title: string; children: ReactNode }) => (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-semibold text-slate-900">{title}</p>
        <button type="button" onClick={() => goTo(i)} className="text-sm font-semibold text-brand-600 hover:underline">Edit</button>
      </div>
      <div className="text-sm text-slate-700">{children}</div>
    </div>
  );

  return (
    <StepSection title="Review & publish" subtitle="Check everything looks right. You can edit your listing any time after publishing.">
      {issues.length > 0 && (
        <Alert tone="amber" className="mb-4" icon={<AlertTriangle className="h-4 w-4" />} title="A few things need attention">
          {issues.map((s) => (
            <button key={s.key} type="button" className="mr-3 font-semibold underline" onClick={() => goTo(STEPS.findIndex((x) => x.key === s.key))}>{s.label}</button>
          ))}
        </Alert>
      )}
      <div className="space-y-3">
        <Section i={0} title={`Photos (${form.images.length})`}>
          <div className="flex gap-2 overflow-x-auto">
            {form.images.map((img) => <img key={img.id} src={img.thumbUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />)}
            {!form.images.length && <span className="text-red-600">No photos yet</span>}
          </div>
        </Section>
        <Section i={1} title="Details">
          <p className="font-semibold text-slate-900">{form.title || "—"}</p>
          <p className="mt-1 line-clamp-3 whitespace-pre-line">{form.description || "—"}</p>
          <p className="mt-2 text-slate-500">{[cat?.name, sub?.name].filter(Boolean).join(" › ") || "No category"} · {CONDITION_LABEL[form.condition]}</p>
        </Section>
        <Section i={2} title="Pricing">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            {form.priceDaily && <div><dt className="text-xs text-slate-500">Daily</dt><dd className="font-semibold">{money(toPaise(form.priceDaily))}</dd></div>}
            {form.priceHourly && <div><dt className="text-xs text-slate-500">Hourly</dt><dd className="font-semibold">{money(toPaise(form.priceHourly))}</dd></div>}
            {form.priceWeekly && <div><dt className="text-xs text-slate-500">Weekly</dt><dd className="font-semibold">{money(toPaise(form.priceWeekly))}</dd></div>}
            {form.priceMonthly && <div><dt className="text-xs text-slate-500">Monthly</dt><dd className="font-semibold">{money(toPaise(form.priceMonthly))}</dd></div>}
            <div><dt className="text-xs text-slate-500">Deposit</dt><dd className="font-semibold">{money(toPaise(form.securityDeposit) ?? 0)}</dd></div>
            <div><dt className="text-xs text-slate-500">Rental period</dt><dd>{period(form.minValue, form.minUnit)} – {period(form.maxValue, form.maxUnit)}</dd></div>
          </dl>
          <p className="mt-2 text-slate-500">
            {[form.instantBooking && "Instant booking", form.pickupAvailable && "Pickup", form.deliveryAvailable && `Delivery (${money(toPaise(form.deliveryFee) ?? 0)}, ${form.deliveryRadiusKm} km)`].filter(Boolean).join(" · ")}
          </p>
          {commission != null && form.priceDaily && (
            <p className="mt-1 text-emerald-700">You'll earn about {money(Math.round(Number(form.priceDaily) * 100 * (1 - commission * (1 + gst))))} per day.</p>
          )}
        </Section>
        <Section i={3} title="Location">
          {addr ? <p>{[addr.line1, addr.line2, addr.locality, addr.city, addr.pincode].filter(Boolean).join(", ") || "—"}</p> : <p className="text-red-600">No address</p>}
        </Section>
        <Section i={4} title="Rules & policy">
          <p>{form.cancellationPolicy.charAt(0) + form.cancellationPolicy.slice(1).toLowerCase()} cancellation</p>
          {form.rules && <p className="mt-1 line-clamp-3 whitespace-pre-line text-slate-500">{form.rules}</p>}
        </Section>
      </div>
      <p className="mt-4 text-xs text-slate-500">
        By publishing you confirm you own this item, it's safe to use and it isn't a prohibited item under our <Link to="/terms" className="link">Terms</Link>. Listings may be reviewed by our team before going live.
      </p>
    </StepSection>
  );
}
