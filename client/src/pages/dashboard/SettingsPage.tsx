/**
 * Account settings, in anchored sections:
 *   #profile · #verification · #kyc · #notifications · #security · #privacy
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import clsx from "clsx";
import {
  AlertTriangle, BadgeCheck, Bell, BellRing, Camera, CheckCircle2, Clock, Download, FileUp, KeyRound, Lock, LogOut, Mail, Phone, ShieldCheck, Trash2, User as UserIcon, XCircle,
} from "lucide-react";
import { api, apiError, apiErrorCode } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { uploadImages } from "@/lib/upload";
import type { User } from "@/lib/types";
import { useAuth } from "@/stores/auth";
import { Seo } from "@/components/Seo";
import { Alert, Avatar, Badge, Button, Card, Input, Modal, Select, Skeleton, Spinner, Textarea, Toggle } from "@/components/ui";
import { PageHeader, downloadFromApi } from "@/components/dashboard/common";
import type { KycInfo } from "@/components/dashboard/types";

const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "verification", label: "Contact" },
  { id: "kyc", label: "ID verification" },
  { id: "notifications", label: "Notifications" },
  { id: "security", label: "Security" },
  { id: "privacy", label: "Privacy & data" },
];

export default function SettingsPage() {
  const { hash } = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (!hash) return;
    const t = setTimeout(() => document.querySelector(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    return () => clearTimeout(t);
  }, [hash]);

  if (!user) return null;
  return (
    <div>
      <Seo title="Settings" noindex />
      <PageHeader title="Settings" subtitle="Manage your profile, verification, notifications and privacy." />
      <nav className="scrollbar-none sticky top-16 z-20 -mx-4 mb-6 flex gap-2 overflow-x-auto bg-slate-50/95 px-4 py-2 backdrop-blur" aria-label="Settings sections">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className={clsx("chip shrink-0", hash === `#${s.id}` && "chip-active")}>
            {s.label}
          </a>
        ))}
      </nav>
      <div className="space-y-6">
        <ProfileSection user={user} />
        <ContactSection user={user} />
        <KycSection user={user} />
        <NotificationsSection user={user} />
        <SecuritySection user={user} />
        <PrivacySection />
      </div>
    </div>
  );
}

function Section({ id, title, subtitle, icon, children, badge }: { id: string; title: string; subtitle?: string; icon: ReactNode; children: ReactNode; badge?: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32">
      <Card>
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">{icon}</div>
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold text-slate-900">
              {title} {badge}
            </h2>
            {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}
          </div>
        </div>
        {children}
      </Card>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

function ProfileSection({ user }: { user: User }) {
  const { setUser, refreshUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio ?? "");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = name.trim() !== user.name || (bio.trim() || null) !== (user.bio ?? null);

  const save = useMutation({
    mutationFn: async () => (await api.patch<{ user: User }>("/users/me", { name: name.trim(), bio: bio.trim() || null })).data.user,
    onSuccess: (u) => {
      setUser(u);
      toast.success("Profile updated");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const onAvatar = async (file?: File) => {
    if (!file) return;
    setAvatarBusy(true);
    try {
      const r = await uploadImages([file], "avatar");
      if (!r.images.length) throw new Error(r.failed[0]?.error ?? "Upload failed");
      await refreshUser();
      toast.success("Profile photo updated");
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setAvatarBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Section id="profile" title="Profile" subtitle="Shown on your public profile, listings and reviews." icon={<UserIcon className="h-5 w-5" />}>
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="flex flex-col items-center gap-2">
          <div className="relative">
            <Avatar name={user.name} src={user.avatarUrl} size={96} />
            <button onClick={() => fileRef.current?.click()} disabled={avatarBusy} className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white shadow ring-2 ring-white hover:bg-brand-700" aria-label="Change profile photo">
              {avatarBusy ? <Spinner className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onAvatar(e.target.files?.[0])} aria-label="Profile photo" />
          <p className="text-xs text-slate-500">JPG or PNG</p>
        </div>
        <form
          className="flex-1 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length < 2) return void toast.error("Name must be at least 2 characters");
            save.mutate();
          }}
        >
          <Input label="Full name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <Textarea label="About you" value={bio} maxLength={500} onChange={(e) => setBio(e.target.value)} placeholder="A line or two about yourself — renters and owners like to know who they're dealing with." hint={`${bio.length}/500`} />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">Member since {fmtDate(user.createdAt)}</p>
            <Button type="submit" disabled={!dirty} loading={save.isPending}>Save profile</Button>
          </div>
        </form>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Contact & verification                                              */
/* ------------------------------------------------------------------ */

function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      label="6-digit code"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      className="[&_input]:text-center [&_input]:text-lg [&_input]:tracking-[0.5em]"
      autoFocus
    />
  );
}

function ContactSection({ user }: { user: User }) {
  const { setUser } = useAuth();
  // Phone flow
  const [phoneStep, setPhoneStep] = useState<"idle" | "enter" | "code">("idle");
  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [devHint, setDevHint] = useState<string | null>(null);
  // Email flow
  const [emailStep, setEmailStep] = useState<"idle" | "enter" | "code">("idle");
  const [email, setEmail] = useState(user.email ?? "");
  const [emailCode, setEmailCode] = useState("");

  const reqPhone = useMutation({
    mutationFn: async () => (await api.post<{ sent: boolean; devCode?: string; code?: string }>("/auth/phone/request", { phone: phone.trim() })).data,
    onSuccess: (d) => {
      setPhoneStep("code");
      setDevHint(d.devCode ?? d.code ?? null);
      toast.success("OTP sent by SMS");
    },
    onError: (e) => toast.error(apiErrorCode(e) === "PHONE_TAKEN" ? "This number is linked to another account." : apiError(e)),
  });
  const verifyPhone = useMutation({
    mutationFn: async () => (await api.post<{ user: User }>("/auth/phone/verify", { phone: phone.trim(), code: phoneCode })).data.user,
    onSuccess: (u) => {
      setUser(u);
      setPhoneStep("idle");
      setPhoneCode("");
      setDevHint(null);
      toast.success("Phone number verified ✅");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const saveEmail = useMutation({
    mutationFn: async () => {
      let u = user;
      if (email.trim().toLowerCase() !== (user.email ?? "")) u = (await api.patch<{ user: User }>("/users/me", { email: email.trim() })).data.user;
      await api.post("/auth/email/request");
      return u;
    },
    onSuccess: (u) => {
      setUser(u);
      setEmailStep("code");
      toast.success(`Code sent to ${email.trim()}`);
    },
    onError: (e) => toast.error(apiErrorCode(e) === "EMAIL_TAKEN" ? "This email is already used by another account." : apiError(e)),
  });
  const verifyEmail = useMutation({
    mutationFn: async () => (await api.post<{ user: User }>("/auth/email/verify", { code: emailCode })).data.user,
    onSuccess: (u) => {
      setUser(u);
      setEmailStep("idle");
      setEmailCode("");
      toast.success("Email verified ✅");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const Verified = () => <Badge tone="green" icon={<BadgeCheck className="h-3 w-3" />}>Verified</Badge>;
  const Unverified = () => <Badge tone="amber">Not verified</Badge>;

  return (
    <Section id="verification" title="Contact & verification" subtitle="A verified phone is required to book or list. Contact details are shared only after a booking is confirmed." icon={<Phone className="h-5 w-5" />}>
      <div className="divide-y divide-slate-100">
        {/* Phone */}
        <div className="pb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Phone className="h-5 w-5 text-slate-400" />
              <div>
                <p className="text-sm font-medium text-slate-900">{user.phone ?? "No phone number"}</p>
                <div className="mt-0.5">{user.phoneVerified ? <Verified /> : <Unverified />}</div>
              </div>
            </div>
            {phoneStep === "idle" && (
              <Button size="sm" variant={user.phoneVerified ? "outline" : "primary"} onClick={() => { setPhone(user.phone?.replace(/^\+91/, "") ?? ""); setPhoneStep("enter"); }}>
                {user.phoneVerified ? "Change number" : user.phone ? "Verify number" : "Add number"}
              </Button>
            )}
          </div>
          {phoneStep === "enter" && (
            <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); reqPhone.mutate(); }}>
              <Input label="Mobile number" prefix="+91" inputMode="tel" autoComplete="tel-national" className="flex-1 [&_input]:pl-12" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ""))} placeholder="98765 43210" autoFocus />
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setPhoneStep("idle")}>Cancel</Button>
                <Button type="submit" loading={reqPhone.isPending} disabled={phone.replace(/\D/g, "").length < 10}>Send OTP</Button>
              </div>
            </form>
          )}
          {phoneStep === "code" && (
            <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); verifyPhone.mutate(); }}>
              <p className="text-sm text-slate-600">Enter the code sent to <b>{phone}</b>. {devHint && <span className="text-xs text-slate-400">(dev code: {devHint})</span>}</p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="sm:w-56"><OtpInput value={phoneCode} onChange={setPhoneCode} /></div>
                <div className="flex gap-2">
                  <Button type="submit" loading={verifyPhone.isPending} disabled={phoneCode.length !== 6}>Verify</Button>
                  <Button type="button" variant="ghost" loading={reqPhone.isPending} onClick={() => reqPhone.mutate()}>Resend</Button>
                  <Button type="button" variant="ghost" onClick={() => setPhoneStep("enter")}>Edit number</Button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Email */}
        <div className="pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Mail className="h-5 w-5 shrink-0 text-slate-400" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{user.email ?? "No email address"}</p>
                {user.email && <div className="mt-0.5">{user.emailVerified ? <Verified /> : <Unverified />}</div>}
              </div>
            </div>
            {emailStep === "idle" && (
              <div className="flex gap-2">
                {user.email && !user.emailVerified && (
                  <Button size="sm" loading={saveEmail.isPending} onClick={() => { setEmail(user.email!); saveEmail.mutate(); }}>Verify email</Button>
                )}
                <Button size="sm" variant="outline" onClick={() => { setEmail(user.email ?? ""); setEmailStep("enter"); }}>{user.email ? "Change" : "Add email"}</Button>
              </div>
            )}
          </div>
          {emailStep === "enter" && (
            <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); saveEmail.mutate(); }}>
              <Input label="Email address" type="email" autoComplete="email" className="flex-1" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setEmailStep("idle")}>Cancel</Button>
                <Button type="submit" loading={saveEmail.isPending} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())}>Save & send code</Button>
              </div>
            </form>
          )}
          {emailStep === "code" && (
            <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); verifyEmail.mutate(); }}>
              <p className="text-sm text-slate-600">We emailed a 6-digit code to <b>{user.email}</b>.</p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="sm:w-56"><OtpInput value={emailCode} onChange={setEmailCode} /></div>
                <div className="flex gap-2">
                  <Button type="submit" loading={verifyEmail.isPending} disabled={emailCode.length !== 6}>Verify</Button>
                  <Button type="button" variant="ghost" onClick={() => setEmailStep("idle")}>Later</Button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* KYC                                                                 */
/* ------------------------------------------------------------------ */

const DOC_TYPES = [
  { value: "AADHAAR", label: "Aadhaar card", hint: "12 digits" },
  { value: "PAN", label: "PAN card", hint: "e.g. ABCDE1234F" },
  { value: "DRIVING_LICENSE", label: "Driving licence", hint: "As printed on the licence" },
  { value: "PASSPORT", label: "Passport", hint: "e.g. K1234567" },
  { value: "VOTER_ID", label: "Voter ID", hint: "EPIC number" },
];
const docLabel = (v: string) => DOC_TYPES.find((d) => d.value === v)?.label ?? v;

function KycSection({ user }: { user: User }) {
  const { refreshUser } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["kyc"], queryFn: async () => (await api.get<KycInfo>("/users/me/kyc")).data });
  const [docType, setDocType] = useState("AADHAAR");
  const [docNumber, setDocNumber] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const status = q.data?.status ?? user.kycStatus;
  const latest = q.data?.documents[0];

  const submit = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("docType", docType);
      fd.append("docNumber", docNumber.trim().replace(/\s/g, ""));
      fd.append("file", file!);
      return api.post("/users/me/kyc", fd, { headers: { "Content-Type": "multipart/form-data" }, timeout: 120_000 });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kyc"] });
      qc.invalidateQueries({ queryKey: ["payouts", "account"] });
      refreshUser().catch(() => undefined);
      setDocNumber("");
      setFile(null);
      toast.success("Document submitted. We'll review it within 24 hours.");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const badge =
    status === "VERIFIED" ? <Badge tone="green" icon={<BadgeCheck className="h-3 w-3" />}>Verified</Badge> : status === "PENDING" ? <Badge tone="blue">In review</Badge> : status === "REJECTED" ? <Badge tone="red">Rejected</Badge> : <Badge tone="gray">Not started</Badge>;

  const fileOk = file && file.size <= 8 * 1024 * 1024;
  return (
    <Section id="kyc" title="ID verification" subtitle="Verified members get a trust badge. Owners need it for payouts and instant booking." icon={<ShieldCheck className="h-5 w-5" />} badge={badge}>
      {q.isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : status === "VERIFIED" ? (
        <Alert tone="green" icon={<CheckCircle2 className="h-4 w-4" />} title="Your identity is verified">
          {latest ? `${docLabel(latest.docType)} ${latest.docNumberMasked} · verified` : "Thanks for helping keep the community safe."}
        </Alert>
      ) : status === "PENDING" ? (
        <Alert tone="blue" icon={<Clock className="h-4 w-4" />} title="We're reviewing your document">
          {latest ? `${docLabel(latest.docType)} ${latest.docNumberMasked}, submitted ${fmtDate(latest.createdAt)}. ` : ""}Reviews usually take less than 24 hours. We'll notify you when it's done.
        </Alert>
      ) : (
        <>
          {status === "REJECTED" && latest && (
            <Alert tone="red" className="mb-4" icon={<XCircle className="h-4 w-4" />} title="Your last document was rejected">
              {latest.rejectionReason ?? "The document couldn't be verified."} Please upload a clear, uncropped photo of a valid ID.
            </Alert>
          )}
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (docNumber.trim().length < 6) return void toast.error("Enter the full document number");
              if (!file) return void toast.error("Upload a photo or scan of the document");
              if (!fileOk) return void toast.error("File must be under 8 MB");
              submit.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Document type" value={docType} onChange={(e) => setDocType(e.target.value)}>
                {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </Select>
              <Input label="Document number" value={docNumber} maxLength={20} onChange={(e) => setDocNumber(e.target.value.toUpperCase())} hint={DOC_TYPES.find((d) => d.value === docType)?.hint} autoComplete="off" />
            </div>
            <label className={clsx("flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition", file ? "border-brand-400 bg-brand-50" : "border-slate-300 hover:border-brand-300 hover:bg-slate-50")}>
              <FileUp className="h-7 w-7 text-brand-500" />
              {file ? (
                <span className="text-sm font-medium text-slate-900">{file.name} <span className="text-slate-500">({(file.size / 1024 / 1024).toFixed(1)} MB)</span></span>
              ) : (
                <span className="text-sm text-slate-600"><b className="text-brand-700">Upload a photo or scan</b> · JPG, PNG, WEBP or PDF up to 8 MB</span>
              )}
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            {file && !fileOk && <p className="text-sm text-red-600">File is larger than 8 MB.</p>}
            <div className="flex flex-col-reverse items-start justify-between gap-3 sm:flex-row sm:items-center">
              <p className="flex items-start gap-1.5 text-xs text-slate-500">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Stored encrypted in private storage. We keep only the last 4 characters of your ID number, per UIDAI masking rules.
              </p>
              <Button type="submit" loading={submit.isPending} icon={<ShieldCheck className="h-4 w-4" />}>Submit for verification</Button>
            </div>
          </form>
        </>
      )}
      {q.data && q.data.documents.length > 1 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-slate-600">Submission history</summary>
          <ul className="mt-2 space-y-1 text-slate-600">
            {q.data.documents.map((d) => (
              <li key={d.id}>{fmtDate(d.createdAt)} · {docLabel(d.docType)} {d.docNumberMasked} · {d.status.toLowerCase()}{d.rejectionReason ? ` — ${d.rejectionReason}` : ""}</li>
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function NotificationsSection({ user }: { user: User }) {
  const { setUser } = useAuth();
  const prefs = { email: true, sms: true, whatsapp: true, push: true, ...user.notificationPrefs };
  const pushSupported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const vapid = useQuery({ queryKey: ["push", "vapid"], queryFn: async () => (await api.get<{ publicKey: string | null }>("/users/push/vapid-key")).data.publicKey, enabled: pushSupported, staleTime: Infinity });
  const [pushState, setPushState] = useState<"unknown" | "on" | "off" | "denied">("unknown");
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported) return;
    if (Notification.permission === "denied") return setPushState("denied");
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setPushState(sub ? "on" : "off"))
      .catch(() => setPushState("off"));
  }, [pushSupported]);

  const update = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => (await api.patch<{ user: User }>("/users/me", patch)).data.user,
    onMutate: (patch) => {
      // Optimistic toggle
      const prev = user;
      setUser({ ...user, ...("notificationPrefs" in patch ? { notificationPrefs: { ...user.notificationPrefs, ...(patch.notificationPrefs as object) } } : {}), ...("marketingOptIn" in patch ? { marketingOptIn: patch.marketingOptIn as boolean } : {}) });
      return { prev };
    },
    onSuccess: (u) => setUser(u),
    onError: (e, _p, ctx) => {
      if (ctx?.prev) setUser(ctx.prev);
      toast.error(apiError(e));
    },
  });

  const enablePush = async () => {
    if (!vapid.data) return;
    setPushBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPushState(perm === "denied" ? "denied" : "off");
        return void toast.error("Notifications permission was not granted");
      }
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Service worker isn't ready. Install or reload the app and try again.")), 8000))]);
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid.data) });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await api.post("/users/me/push-subscriptions", { endpoint: json.endpoint, keys: json.keys });
      setPushState("on");
      if (!prefs.push) update.mutate({ notificationPrefs: { push: true } });
      toast.success("Push notifications enabled on this device");
    } catch (e) {
      toast.error(apiError(e, "Couldn't enable push notifications"));
    } finally {
      setPushBusy(false);
    }
  };
  const disablePush = async () => {
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api.delete("/users/me/push-subscriptions", { data: { endpoint: sub.endpoint } }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setPushState("off");
      toast.success("Push notifications turned off on this device");
    } finally {
      setPushBusy(false);
    }
  };

  const channels: { key: "email" | "sms" | "whatsapp" | "push"; label: string; desc: string }[] = [
    { key: "email", label: "Email", desc: "Booking confirmations, receipts, payouts and invoices" },
    { key: "sms", label: "SMS", desc: "Time-sensitive alerts like new requests and reminders" },
    { key: "whatsapp", label: "WhatsApp", desc: "Pickup reminders and booking updates" },
    { key: "push", label: "Push notifications", desc: "Instant alerts for messages and requests on your devices" },
  ];

  return (
    <Section id="notifications" title="Notifications" subtitle="Choose how we reach you. Important security and legal notices are always sent by email." icon={<Bell className="h-5 w-5" />}>
      <div className="space-y-4">
        {channels.map((c) => (
          <Toggle key={c.key} checked={Boolean(prefs[c.key])} onChange={(v) => update.mutate({ notificationPrefs: { [c.key]: v } })} label={c.label} description={c.desc} />
        ))}
        <div className="border-t border-slate-100 pt-4">
          <Toggle checked={user.marketingOptIn} onChange={(v) => update.mutate({ marketingOptIn: v })} label="Tips & offers" description="Occasional emails about new features and deals near you" />
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <BellRing className="mt-0.5 h-5 w-5 text-brand-600" />
            <div>
              <p className="text-sm font-semibold text-slate-900">Browser push on this device</p>
              <p className="text-xs text-slate-500">
                {!pushSupported
                  ? "Not supported by this browser. On iPhone, add RentNest to your home screen first."
                  : vapid.isSuccess && !vapid.data
                    ? "Push notifications aren't configured on this server yet."
                    : pushState === "denied"
                      ? "Blocked in your browser settings. Allow notifications for this site to enable."
                      : pushState === "on"
                        ? "Enabled — you'll get alerts even when the app is closed."
                        : "Get instant alerts for messages and booking requests."}
              </p>
            </div>
          </div>
          {pushSupported && vapid.data && pushState !== "denied" && (
            pushState === "on" ? (
              <Button size="sm" variant="outline" loading={pushBusy} onClick={disablePush}>Turn off</Button>
            ) : (
              <Button size="sm" loading={pushBusy || vapid.isLoading} onClick={enablePush}>Enable push</Button>
            )
          )}
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Security                                                            */
/* ------------------------------------------------------------------ */

function SecuritySection({ user }: { user: User }) {
  const { logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);

  const pwErr = next && (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) ? "At least 8 characters with a letter and a number" : null;
  const change = useMutation({
    mutationFn: () => api.post("/auth/password/change", { ...(user.hasPassword ? { currentPassword: cur } : {}), newPassword: next }),
    onSuccess: () => {
      setCur("");
      setNext("");
      setConfirm("");
      refreshUser().catch(() => undefined);
      toast.success(user.hasPassword ? "Password changed" : "Password set — you can now sign in with email & password");
    },
    onError: (e) => toast.error(apiError(e)),
  });
  const logoutAll = useMutation({
    mutationFn: () => api.post("/auth/logout-all"),
    onSuccess: async () => {
      await logout();
      toast.success("Signed out on all devices");
      navigate("/login");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Section id="security" title="Security" subtitle={user.googleLinked ? "Your account is linked with Google." : "Keep your account secure."} icon={<KeyRound className="h-5 w-5" />}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (pwErr) return void toast.error(pwErr);
          if (next !== confirm) return void toast.error("Passwords don't match");
          change.mutate();
        }}
      >
        <p className="text-sm font-semibold text-slate-900">{user.hasPassword ? "Change password" : "Set a password"}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {user.hasPassword && <Input label="Current password" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />}
          <Input label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={pwErr} />
          <Input label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={confirm && confirm !== next ? "Passwords don't match" : null} />
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={change.isPending} disabled={!next || !confirm || (user.hasPassword && !cur)}>{user.hasPassword ? "Update password" : "Set password"}</Button>
        </div>
      </form>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
        <div>
          <p className="text-sm font-semibold text-slate-900">Sign out everywhere</p>
          <p className="text-xs text-slate-500">Signs you out on all phones, tablets and browsers — including this one.</p>
        </div>
        <Button variant="outline" icon={<LogOut className="h-4 w-4" />} onClick={() => setConfirmAll(true)}>Sign out all devices</Button>
      </div>
      <Modal
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title="Sign out of all devices?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmAll(false)}>Cancel</Button>
            <Button variant="danger" loading={logoutAll.isPending} onClick={() => logoutAll.mutate()}>Sign out everywhere</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">You'll need to sign in again on every device. Do this if you think someone else has access to your account.</p>
      </Modal>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Privacy (DPDP Act)                                                  */
/* ------------------------------------------------------------------ */

function PrivacySection() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const check = useQuery({
    queryKey: ["deletion-check"],
    queryFn: async () => (await api.get<{ canDelete: boolean; blockers: string[] }>("/users/me/deletion-check")).data,
    enabled: open,
    staleTime: 0,
  });
  const del = useMutation({
    mutationFn: () => api.delete("/users/me", { data: { confirm: "DELETE" } }),
    onSuccess: async () => {
      await logout();
      toast.success("Your account has been deleted. We're sorry to see you go.");
      navigate("/");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const exportData = async () => {
    setExporting(true);
    try {
      await downloadFromApi("/users/me/export", `rentnest-my-data-${new Date().toISOString().slice(0, 10)}.json`);
      toast.success("Your data export has been downloaded");
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Section id="privacy" title="Privacy & data" subtitle="Your rights under India's Digital Personal Data Protection Act, 2023." icon={<Lock className="h-5 w-5" />}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Download my data</p>
          <p className="text-xs text-slate-500">A copy of your profile, listings, bookings, messages and reviews (JSON).</p>
        </div>
        <Button variant="outline" loading={exporting} onClick={exportData} icon={<Download className="h-4 w-4" />}>Download</Button>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
        <div>
          <p className="text-sm font-semibold text-red-700">Delete account</p>
          <p className="text-xs text-slate-500">Permanently removes your profile and listings. Tax records are retained anonymously as required by law.</p>
        </div>
        <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => { setTyped(""); setOpen(true); }}>Delete account</Button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Delete your account?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="danger" loading={del.isPending} disabled={!check.data?.canDelete || typed !== "DELETE"} onClick={() => del.mutate()}>Permanently delete</Button>
          </>
        }
      >
        {check.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : check.isError ? (
          <Alert tone="red">{apiError(check.error)}</Alert>
        ) : check.data && !check.data.canDelete ? (
          <Alert tone="amber" icon={<AlertTriangle className="h-4 w-4" />} title="Your account can't be deleted yet">
            <p>Please settle the following first:</p>
            <ul className="mt-1 list-disc pl-5">
              {check.data.blockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
          </Alert>
        ) : (
          <div className="space-y-4">
            <Alert tone="red" icon={<AlertTriangle className="h-4 w-4" />} title="This can't be undone">
              Your profile, listings, wishlist and saved addresses will be deleted and your personal data anonymised. Completed booking and invoice records are kept (without your identity) for tax purposes.
            </Alert>
            <Input label={<>Type <b>DELETE</b> to confirm</>} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        )}
      </Modal>
    </Section>
  );
}
