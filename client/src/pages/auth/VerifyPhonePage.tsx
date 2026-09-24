/** Link & verify a mobile number (required before booking or listing). */
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import { api, apiError, apiErrorCode } from "@/lib/api";
import type { User } from "@/lib/types";
import { useAuth } from "@/stores/auth";
import { Seo } from "@/components/Seo";
import { Alert, Button, ButtonLink, Input } from "@/components/ui";
import { AuthShell, DevCodeHint, OtpField, isValidIndianMobile, normalisePhone, safeNext, useCooldown } from "@/components/public/auth";

interface OtpRequestResponse {
  sent: boolean;
  expiresIn: number;
  devCode?: string;
}

export default function VerifyPhonePage() {
  const [sp] = useSearchParams();
  const next = safeNext(sp.get("next"));
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [phone, setPhone] = useState(user?.phone?.replace(/^\+91/, "") ?? "");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<OtpRequestResponse | null>(null);
  const [changing, setChanging] = useState(false);
  const cooldown = useCooldown(30);

  const request = useMutation({
    mutationFn: async () => (await api.post<OtpRequestResponse>("/auth/phone/request", { phone: normalisePhone(phone) })).data,
    onSuccess: (r) => {
      setSent(r);
      setCode("");
      cooldown.start();
      toast.success("Code sent by SMS");
    },
  });
  const verify = useMutation({
    mutationFn: async () => (await api.post<{ user: User }>("/auth/phone/verify", { phone: normalisePhone(phone), code })).data.user,
    onSuccess: (u) => {
      setUser(u);
      toast.success("Phone verified — you're all set!");
      navigate(next, { replace: true });
    },
  });

  if (user?.phoneVerified && !sent && !changing) {
    return (
      <AuthShell title="Your phone is verified" subtitle={`${user.phone ?? "Your number"} is linked to your account.`}>
        <Seo title="Verify phone" noindex />
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-emerald-50 p-6 text-center ring-1 ring-emerald-100">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          <p className="text-sm text-emerald-800">You can book and list items. You can change your number anytime.</p>
        </div>
        <div className="mt-6 flex gap-2">
          <ButtonLink to={next} block>Continue</ButtonLink>
          <Button variant="outline" block onClick={() => { setPhone(""); setChanging(true); }}>Change number</Button>
        </div>
      </AuthShell>
    );
  }

  const requestCode = apiErrorCode(request.error);

  return (
    <AuthShell
      title="Verify your mobile number"
      subtitle="For everyone's safety, a verified number is required to book or list items. We never share it until a booking is confirmed."
      footer={<Link to={next} className="font-medium text-slate-500 hover:text-slate-800">Skip for now</Link>}
    >
      <Seo title="Verify phone" noindex />
      {!sent ? (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (isValidIndianMobile(phone)) request.mutate(); }}>
          {request.isError && <Alert tone="red">{requestCode === "PHONE_TAKEN" ? "This number is linked to another account. Sign in with it using Mobile OTP, or use a different number." : apiError(request.error)}</Alert>}
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
          />
          <Button type="submit" block size="lg" loading={request.isPending} disabled={!isValidIndianMobile(phone)}>Send code</Button>
          <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Standard SMS rates may apply.</p>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (code.length === 6) verify.mutate(); }}>
          <button type="button" onClick={() => setSent(null)} className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> {normalisePhone(phone)} · change
          </button>
          <OtpField value={code} onChange={setCode} error={verify.isError ? apiError(verify.error) : null} />
          <DevCodeHint code={sent.devCode} onUse={setCode} />
          <Button type="submit" block size="lg" loading={verify.isPending} disabled={code.length !== 6}>Verify</Button>
          <p className="text-center text-sm text-slate-600">
            Didn't get it?{" "}
            {cooldown.left > 0 ? <span className="text-slate-400">Resend in {cooldown.left}s</span> : <button type="button" className="link" onClick={() => request.mutate()}>Resend code</button>}
          </p>
        </form>
      )}
    </AuthShell>
  );
}
