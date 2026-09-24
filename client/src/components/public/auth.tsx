/**
 * Auth page building blocks: split-screen shell, Google Identity Services
 * button, OTP code input with resend timer and safe `next` handling.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, Lock, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/layout/Header";

/** Only allow same-origin relative redirects (prevents open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/** Normalise an Indian mobile to +91XXXXXXXXXX (server also normalises). */
export function normalisePhone(raw: string) {
  const d = raw.replace(/[^\d+]/g, "");
  if (/^[6-9]\d{9}$/.test(d)) return `+91${d}`;
  if (/^91[6-9]\d{9}$/.test(d)) return `+${d}`;
  return d;
}
export const isValidIndianMobile = (raw: string) => /^\+91[6-9]\d{9}$/.test(normalisePhone(raw)) || /^\+[1-9]\d{7,14}$/.test(normalisePhone(raw));

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-violet-600 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-0 h-80 w-80 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <div className="relative">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">Rent · Share · Earn</p>
          <h2 className="mt-4 max-w-md text-4xl font-extrabold leading-tight">India's neighbourhood rental marketplace.</h2>
          <p className="mt-4 max-w-md text-white/80">Rent cameras, gadgets, furniture, tools and more from verified people nearby — or earn from what you already own.</p>
        </div>
        <ul className="relative space-y-4">
          {[
            [BadgeCheck, "Verified community", "Phone-verified members, ID checks for high-value rentals"],
            [ShieldCheck, "Deposits held in escrow", "Released after the item is returned & inspected"],
            [Lock, "Secure Razorpay payments", "UPI, cards and netbanking"],
          ].map(([Icon, t, d]) => {
            const I = Icon as typeof BadgeCheck;
            return (
              <li key={t as string} className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20"><I className="h-5 w-5" /></span>
                <span><span className="block font-semibold">{t as string}</span><span className="text-sm text-white/70">{d as string}</span></span>
              </li>
            );
          })}
        </ul>
      </aside>
      <main className="flex items-start justify-center px-4 py-10 sm:items-center sm:py-16">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-600">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-sm text-slate-600">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

/** "or" divider */
export function OrDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="my-6 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-400">
      <span className="h-px flex-1 bg-slate-200" /> {label} <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

/** 6-digit OTP field (single input with one-time-code autofill). */
export function OtpField({ value, onChange, autoFocus = true, error }: { value: string; onChange: (v: string) => void; autoFocus?: boolean; error?: string | null }) {
  return (
    <div>
      <label htmlFor="otp" className="label">Enter the 6-digit code</label>
      <input
        id="otp"
        name="otp"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        autoFocus={autoFocus}
        placeholder="••••••"
        className="input text-center font-mono text-2xl tracking-[0.6em] placeholder:tracking-[0.6em]"
        aria-invalid={Boolean(error)}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** Dev helper: shows the echoed OTP when the server runs with OTP_DEV_ECHO. */
export function DevCodeHint({ code, onUse }: { code?: string | null; onUse: (c: string) => void }) {
  if (!code) return null;
  return (
    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
      Dev mode: your code is <button type="button" className="font-mono font-bold underline" onClick={() => onUse(code)}>{code}</button>
    </p>
  );
}

/** Countdown for "Resend code". */
export function useCooldown(seconds = 30) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return { left, start: () => setLeft(seconds) };
}

/* -------------------------------------------------------- Google sign-in */

interface GoogleId {
  accounts: {
    id: {
      initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string; auto_select?: boolean }) => void;
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
    };
  };
}
declare global {
  interface Window {
    google?: GoogleId;
  }
}

let gsiPromise: Promise<void> | null = null;
function loadGsi() {
  gsiPromise ??= new Promise<void>((resolve, reject) => {
    if (window.google?.accounts) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gsiPromise = null;
      reject(new Error("Couldn't load Google sign-in"));
    };
    document.head.appendChild(s);
  });
  return gsiPromise;
}

/** Renders the official Google button when a client ID is configured. */
export function GoogleButton({ clientId, onCredential, text = "continue_with" }: { clientId: string; onCredential: (idToken: string) => void; text?: "signin_with" | "signup_with" | "continue_with" }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({ client_id: clientId, callback: (r) => cb.current(r.credential) });
        window.google.accounts.id.renderButton(ref.current, { theme: "outline", size: "large", shape: "pill", text, width: Math.min(400, ref.current.clientWidth || 360), logo_alignment: "center" });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [clientId, text]);

  if (failed) return <p className="text-center text-xs text-slate-500">Google sign-in is unavailable right now.</p>;
  return <div ref={ref} className="flex min-h-[44px] w-full justify-center" />;
}

export function LegalNote() {
  return (
    <p className="mt-6 text-center text-xs text-slate-500">
      By continuing you agree to our <Link to="/terms" className="underline hover:text-slate-800">Terms</Link> and <Link to="/privacy" className="underline hover:text-slate-800">Privacy Policy</Link>.
    </p>
  );
}
