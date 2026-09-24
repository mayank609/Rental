/** Email sign-up with explicit DPDP consent (and optional marketing opt-in). */
import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import clsx from "clsx";
import { Eye, EyeOff } from "lucide-react";
import { api, apiError } from "@/lib/api";
import type { User } from "@/lib/types";
import { useAuth } from "@/stores/auth";
import { usePlatformConfig } from "@/hooks/useConfig";
import { Seo } from "@/components/Seo";
import { Alert, Button, Checkbox, Input, PageLoader } from "@/components/ui";
import { AuthShell, GoogleButton, OrDivider, isValidIndianMobile, normalisePhone, safeNext } from "@/components/public/auth";

interface SessionResponse {
  accessToken: string;
  user: User;
}

/** Mirrors the server rules: 8+ chars with a letter and a number. */
function passwordChecks(p: string) {
  return [
    { ok: p.length >= 8, label: "8+ characters" },
    { ok: /[A-Za-z]/.test(p), label: "a letter" },
    { ok: /\d/.test(p), label: "a number" },
  ];
}

export default function RegisterPage() {
  const [sp] = useSearchParams();
  const next = safeNext(sp.get("next"));
  const navigate = useNavigate();
  const { user, loading, setSession } = useAuth();
  const config = usePlatformConfig();

  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [touched, setTouched] = useState(false);

  const checks = passwordChecks(form.password);
  const errors = {
    name: form.name.trim().length < 2 ? "Enter your full name" : null,
    email: !/^\S+@\S+\.\S+$/.test(form.email.trim()) ? "Enter a valid email" : null,
    password: checks.every((c) => c.ok) ? null : "Password needs 8+ characters with a letter and a number",
    phone: form.phone && !isValidIndianMobile(form.phone) ? "Enter a valid 10-digit mobile number" : null,
    consent: consent ? null : "Please accept the Terms and Privacy Policy",
  };
  const valid = Object.values(errors).every((e) => !e);

  const afterAuth = (r: SessionResponse) => {
    setSession(r.accessToken, r.user);
    toast.success(`Welcome to ${config.data?.platformName ?? "RentNest"}, ${r.user.name.split(" ")[0]}!`);
    navigate(r.user.phoneVerified ? next : `/verify-phone?next=${encodeURIComponent(next)}`, { replace: true });
  };

  const register = useMutation({
    mutationFn: async () =>
      (
        await api.post<SessionResponse>("/auth/register", {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          ...(form.phone ? { phone: normalisePhone(form.phone) } : {}),
          consent: true,
          marketingOptIn: marketing,
        })
      ).data,
    onSuccess: afterAuth,
  });
  const google = useMutation({
    mutationFn: async (idToken: string) => (await api.post<SessionResponse>("/auth/google", { idToken, consent: true })).data,
    onSuccess: afterAuth,
    onError: (e) => toast.error(apiError(e, "Google sign-up failed")),
  });

  if (loading) return <PageLoader />;
  if (user) return <Navigate to={next} replace />;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <AuthShell
      title="Create your account"
      subtitle="Rent from neighbours and earn from your own stuff."
      footer={<>Already have an account? <Link to={`/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="link">Sign in</Link></>}
    >
      <Seo title="Create an account" noindex />
      {config.data?.googleClientId && (
        <>
          <GoogleButton clientId={config.data.googleClientId} text="signup_with" onCredential={(t) => (consent ? google.mutate(t) : toast.error("Please accept the Terms and Privacy Policy first"))} />
          <OrDivider label="or sign up with email" />
        </>
      )}
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (valid) register.mutate();
        }}
      >
        {register.isError && <Alert tone="red">{apiError(register.error)}</Alert>}
        <Input label="Full name" name="name" autoComplete="name" value={form.name} onChange={set("name")} error={touched ? errors.name : null} autoFocus required />
        <Input label="Email" name="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} error={touched ? errors.email : null} required />
        <div>
          <Input
            label="Password"
            name="password"
            type={showPw ? "text" : "password"}
            autoComplete="new-password"
            value={form.password}
            onChange={set("password")}
            error={touched ? errors.password : null}
            suffix={
              <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"} className="text-slate-500 hover:text-slate-800">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
            required
          />
          {form.password && (
            <ul className="mt-2 flex flex-wrap gap-2 text-xs" aria-label="Password requirements">
              {checks.map((c) => (
                <li key={c.label} className={clsx("rounded-full px-2 py-0.5 ring-1", c.ok ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-50 text-slate-500 ring-slate-200")}>
                  {c.ok ? "✓" : "○"} {c.label}
                </li>
              ))}
            </ul>
          )}
        </div>
        <Input
          label={<>Mobile number <span className="font-normal text-slate-400">(optional)</span></>}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          prefix="+91"
          className="[&_input]:pl-12"
          value={form.phone}
          onChange={set("phone")}
          error={touched ? errors.phone : null}
          hint="You'll need to verify a mobile number before booking or listing."
        />
        <div className="space-y-3 rounded-xl bg-slate-50 p-4">
          <Checkbox
            checked={consent}
            onChange={setConsent}
            label={
              <>
                I agree to the <Link to="/terms" target="_blank" className="link">Terms of Service</Link> and consent to the processing of my personal data as described in the{" "}
                <Link to="/privacy" target="_blank" className="link">Privacy Policy</Link> (Digital Personal Data Protection Act, 2023).
              </>
            }
          />
          {touched && errors.consent && <p className="-mt-1 pl-6 text-xs text-red-600">{errors.consent}</p>}
          <Checkbox checked={marketing} onChange={setMarketing} label="Send me occasional offers and tips (optional — you can opt out anytime)." />
        </div>
        <Button type="submit" block size="lg" loading={register.isPending}>Create account</Button>
      </form>
    </AuthShell>
  );
}
