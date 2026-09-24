import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import clsx from "clsx";

interface FieldWrap {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
}

export function FieldWrapper({ label, hint, error, className, children, htmlFor }: FieldWrap & { children: ReactNode; htmlFor?: string }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}
        </label>
      )}
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldWrap & { prefix?: ReactNode; suffix?: ReactNode }>(function Input(
  { label, hint, error, className, prefix, suffix, id, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <FieldWrapper label={label} hint={hint} error={error} className={className} htmlFor={inputId}>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">{prefix}</span>}
        <input ref={ref} id={inputId} className={clsx("input", prefix && "pl-8", suffix && "pr-12", error && "border-red-400 focus:border-red-500 focus:ring-red-100")} {...rest} />
        {suffix && <span className="absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">{suffix}</span>}
      </div>
    </FieldWrapper>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldWrap>(function Textarea(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <FieldWrapper label={label} hint={hint} error={error} className={className} htmlFor={inputId}>
      <textarea ref={ref} id={inputId} className={clsx("input min-h-[100px]", error && "border-red-400")} {...rest} />
    </FieldWrapper>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldWrap>(function Select(
  { label, hint, error, className, id, children, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <FieldWrapper label={label} hint={hint} error={error} className={className} htmlFor={inputId}>
      <select ref={ref} id={inputId} className={clsx("input appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%2364748b%22><path d=%22M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z%22/></svg>')] bg-[length:1.25rem] bg-[right_0.6rem_center] bg-no-repeat pr-9", error && "border-red-400")} {...rest}>
        {children}
      </select>
    </FieldWrapper>
  );
});

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={clsx("flex cursor-pointer items-start justify-between gap-4", disabled && "cursor-not-allowed opacity-60")}>
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx("relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-brand-600" : "bg-slate-300")}
      >
        <span className={clsx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </label>
  );
}

export function Checkbox({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; className?: string }) {
  return (
    <label className={clsx("flex cursor-pointer items-start gap-2.5 text-sm text-slate-700", className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
      <span>{label}</span>
    </label>
  );
}
