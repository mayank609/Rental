/**
 * Sign in: mobile OTP (default, also creates the account on first login),
 * email + password or email one-time code, and Google when configured.
 */
import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ArrowLeft, KeyRound, Mail, Smartphone } from "lucide-react";
import { api, apiError } from "@/lib/api";
import type { User } from "@/lib/types";
import { useAuth } from "@/stores/auth";
import { usePlatformConfig } from "@/hooks/useConfig";
import { Seo } from "@/components/Seo";
import { Alert, Button, Input, PageLoader, Tabs } from "@/components/ui";
import { AuthShell, DevCodeHint, GoogleButton, LegalNote, OrDivider, OtpField, isValidIndianMobile, normalisePhone, safeNext, useCooldown } from "@/components/public/auth";

type Method = "phone" | "email";
interface SessionResponse {
  accessToken: string;
  user: User;
}
interface OtpRequestResponse {
  sent: boolean;
  expiresIn: number;
  devCode?: string;
}

export default function LoginPage() {
  const [sp] = useSearchParams();
  const next = safeNext(sp.get("next"));
  const navigate = useNavigate();
  const { user, loading, setSession } = useAuth();
  const config = usePlatformConfig();
  const [method, setMethod] = useState<Method>("phone");

  /** Common post-login handling; nudges email/Google users to add a phone. */
  const onAuthed = (r: SessionResponse, via: "phone" | "email" | "google") => {
    setSession(r.accessToken, r.user);
    toast.success(`Welcome${r.user.name ? `, ${r.user.name.split(" ")[0]}` : ""}!`);
    if (via !== "phone" && !r.user.phoneVerified) {
      navigate(`/verify-phone?next=${encodeURIComponent(next)}`, { replace: true });
    } else {
      navigate(next, { replace: true });
    }
  };

  const google = useMutation({
    mutationFn: async (idToken: string) => (await api.post<SessionResponse>("/auth/google", { idToken })).data,
    onSuccess: (r) => onAuthed(r, "google"),
    onError: (e) => toast.error(apiError(e, "Google sign-in failed")),
  });

  if (loading) return <PageLoader />;
  if (user) return <Navigate to={next} replace />;

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in or create an account in seconds."
      footer={<>New here? <Link to={`/register${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="link">Create an account with email</Link></>}
    >
      <Seo title="Sign in" noindex />
      {config.data?.googleClientId && (
        <>
          <GoogleButton clientId={config.data.googleClientId} onCredential={(t) => google.mutate(t)} />
          {google.isPending && <p className="mt-2 text-center text-xs text-slate-500">Signing you in…</p>}
          <OrDivider />
        </>
      )}

      <Tabs<Method>
        value={method}
        onChange={setMethod}
        className="mb-6"
        tabs={[
          { value: "phone", label: <span className="inline-flex items-center gap-1.5"><Smartphone className="h-4 w-4" /> Mobile OTP</span> },
          { value: "email", label: <span className="inline-flex items-center gap-1.5"><Mail className="h-4 w-4" /> Email</span> },
        ]}
      />
      {method === "phone" ? <PhoneOtpForm onAuthed={(r) => onAuthed(r, "phone")} /> : <EmailForm onAuthed={(r) => onAuthed(r, "email")} />}
      <LegalNote />
    </AuthShell>
  );
}

/* ------------------------------------------------------------ mobile OTP */

function PhoneOtpForm({ onAuthed }: { onAuthed: (r: SessionResponse) => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [sent, setSent] = useState<OtpRequestResponse | null>(null);
  const cooldown = useCooldown(30);

  const request = useMutation({
    mutationFn: async () => (await api.post<OtpRequestResponse>("/auth/otp/request", { phone: normalisePhone(phone) })).data,
    onSuccess: (r) => {
      setSent(r);
      setCode("");
      cooldown.start();
      toast.success("Code sent by SMS");
    },
    onError: (e) => toast.error(apiError(e)),
  });
  const verify = useMutation({
    mutationFn: async () => (await api.post<SessionResponse>("/auth/otp/verify", { phone: normalisePhone(phone), code, ...(name.trim().length >= 2 ? { name: name.trim() } : {}) })).data,
    onSuccess: onAuthed,
  });

  if (!sent) {
    return (
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (isValidIndianMobile(phone)) request.mutate(); }}>
        <Input
          label="Mobile number"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          prefix="+91"
          className="[&_input]:pl-12"
          placeholder="98765 43210"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={phone.length >= 10 && !isValidIndianMobile(phone) ? "Enter a valid 10-digit mobile number" : null}
          autoFocus
          required
        />
        <Button type="submit" block size="lg" loading={request.isPending} disabled={!isValidIndianMobile(phone)}>Send code</Button>
        <p className="text-center text-xs text-slate-500">New here? We'll create your account automatically.</p>
      </form>
    );
  }

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (code.length === 6) verify.mutate(); }}>
      <button type="button" onClick={() => setSent(null)} className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> {normalisePhone(phone)} · change
      </button>
      <OtpField value={code} onChange={setCode} error={verify.isError ? apiError(verify.error) : null} />
      <DevCodeHint code={sent.devCode} onUse={setCode} />
      <Input label="Your name (if you're new)" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} hint="Shown to owners and renters. You can change it later." />
      <Button type="submit" block size="lg" loading={verify.isPending} disabled={code.length !== 6}>Verify & continue</Button>
      <p className="text-center text-sm text-slate-600">
        Didn't get it?{" "}
        {cooldown.left > 0 ? <span className="text-slate-400">Resend in {cooldown.left}s</span> : <button type="button" className="link" onClick={() => request.mutate()} disabled={request.isPending}>Resend code</button>}
      </p>
    </form>
  );
}

/* ------------------------------------------------------------------ email */

function EmailForm({ onAuthed }: { onAuthed: (r: SessionResponse) => void }) {
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [otp, setOtp] = useState<OtpRequestResponse | null>(null);
  const cooldown = useCooldown(30);

  const login = useMutation({
    mutationFn: async () => (await api.post<SessionResponse>("/auth/login", { email: email.trim(), password })).data,
    onSuccess: onAuthed,
  });
  const requestOtp = useMutation({
    mutationFn: async () => (await api.post<OtpRequestResponse>("/auth/otp/request", { email: email.trim() })).data,
    onSuccess: (r) => {
      setOtp(r);
      cooldown.start();
      toast.success("Code sent to your email");
    },
    onError: (e) => toast.error(apiError(e)),
  });
  const verifyOtp = useMutation({
    mutationFn: async () => (await api.post<SessionResponse>("/auth/otp/verify", { email: email.trim(), code })).data,
    onSuccess: onAuthed,
  });
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());

  if (mode === "otp") {
    return (
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!otp) requestOtp.mutate(); else if (code.length === 6) verifyOtp.mutate(); }}>
        <Input label="Email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={Boolean(otp)} required />
        {otp && (
          <>
            <OtpField value={code} onChange={setCode} error={verifyOtp.isError ? apiError(verifyOtp.error) : null} />
            <DevCodeHint code={otp.devCode} onUse={setCode} />
          </>
        )}
        <Button type="submit" block size="lg" loading={requestOtp.isPending || verifyOtp.isPending} disabled={!emailOk || (Boolean(otp) && code.length !== 6)}>
          {otp ? "Verify & sign in" : "Email me a code"}
        </Button>
        <div className="flex justify-between text-sm">
          <button type="button" className="link" onClick={() => { setMode("password"); setOtp(null); setCode(""); }}>Use password instead</button>
          {otp && (cooldown.left > 0 ? <span className="text-slate-400">Resend in {cooldown.left}s</span> : <button type="button" className="link" onClick={() => requestOtp.mutate()}>Resend</button>)}
        </div>
      </form>
    );
  }

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (emailOk && password) login.mutate(); }}>
      {login.isError && <Alert tone="red">{apiError(login.error)}</Alert>}
      <Input label="Email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
      <div>
        <Input label="Password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <div className="mt-1.5 text-right">
          <Link to={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="text-xs font-medium text-brand-600 hover:underline">Forgot password?</Link>
        </div>
      </div>
      <Button type="submit" block size="lg" loading={login.isPending} disabled={!emailOk || !password}>Sign in</Button>
      <button type="button" onClick={() => setMode("otp")} className="flex w-full items-center justify-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <KeyRound className="h-4 w-4" /> Email me a one-time code instead
      </button>
    </form>
  );
}
