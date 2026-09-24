/** Password reset: email → 6-digit code + new password. */
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ArrowLeft, MailCheck } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { Seo } from "@/components/Seo";
import { Alert, Button, Input } from "@/components/ui";
import { AuthShell, OtpField, useCooldown } from "@/components/public/auth";

const strong = (p: string) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

export default function ForgotPasswordPage() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState(sp.get("email") ?? "");
  const [step, setStep] = useState<"email" | "reset">("email");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const cooldown = useCooldown(30);

  const forgot = useMutation({
    mutationFn: () => api.post("/auth/password/forgot", { email: email.trim() }),
    onSuccess: () => {
      setStep("reset");
      cooldown.start();
    },
    onError: (e) => toast.error(apiError(e)),
  });
  const reset = useMutation({
    mutationFn: () => api.post("/auth/password/reset", { email: email.trim(), code, password }),
    onSuccess: () => {
      toast.success("Password updated. Please sign in.");
      navigate("/login", { replace: true });
    },
  });

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const pwError = !strong(password) ? "Use 8+ characters with a letter and a number" : null;
  const confirmError = confirm !== password ? "Passwords don't match" : null;

  return (
    <AuthShell
      title={step === "email" ? "Reset your password" : "Check your email"}
      subtitle={step === "email" ? "Enter your account email and we'll send you a 6-digit code." : <>If an account exists for <b>{email}</b>, we've sent a code. It expires in a few minutes.</>}
      footer={<Link to="/login" className="link">Back to sign in</Link>}
    >
      <Seo title="Reset password" noindex />
      {step === "email" ? (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (emailOk) forgot.mutate(); }}>
          <Input label="Email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
          <Button type="submit" block size="lg" loading={forgot.isPending} disabled={!emailOk}>Send code</Button>
          <p className="text-center text-xs text-slate-500">Signed up with your phone? Just <Link to="/login" className="link">sign in with Mobile OTP</Link> — no password needed.</p>
        </form>
      ) : (
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (code.length === 6 && !pwError && !confirmError) reset.mutate();
          }}
        >
          <button type="button" onClick={() => setStep("email")} className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Use a different email
          </button>
          <div className="flex items-center gap-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-800"><MailCheck className="h-5 w-5 shrink-0" /> Code sent to {email}</div>
          {reset.isError && <Alert tone="red">{apiError(reset.error)}</Alert>}
          <OtpField value={code} onChange={setCode} />
          <Input label="New password" name="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={touched ? pwError : null} hint="8+ characters with a letter and a number" />
          <Input label="Confirm new password" name="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={touched ? confirmError : null} />
          <Button type="submit" block size="lg" loading={reset.isPending} disabled={code.length !== 6}>Update password</Button>
          <p className="text-center text-sm text-slate-600">
            {cooldown.left > 0 ? <span className="text-slate-400">Resend code in {cooldown.left}s</span> : <button type="button" className="link" onClick={() => forgot.mutate()}>Resend code</button>}
          </p>
        </form>
      )}
    </AuthShell>
  );
}
