/**
 * Camera-friendly photo picker for evidence (checklists, damage reports,
 * disputes). Photos upload immediately (compressed client-side) and are
 * stamped with the capture time and, when permitted, GPS coordinates.
 */
import { useRef, useState } from "react";
import { Camera, Loader2, MapPin, X } from "lucide-react";
import toast from "react-hot-toast";
import { uploadImages, type UploadPurpose } from "@/lib/upload";
import type { ChecklistPhoto } from "@/lib/types";

/** Best-effort current position (resolves null when denied/unavailable). */
export function getCoords(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

export function EvidenceUploader({
  value,
  onChange,
  purpose,
  max = 12,
  withLocation = false,
  onBusyChange,
  label = "Add photos",
}: {
  value: ChecklistPhoto[];
  onChange: (v: ChecklistPhoto[]) => void;
  purpose: UploadPurpose;
  max?: number;
  withLocation?: boolean;
  onBusyChange?: (busy: boolean) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  // Keep the latest value for async callbacks.
  const latest = useRef(value);
  latest.current = value;

  const onFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? []).slice(0, Math.max(0, max - value.length));
    if (!files.length) {
      if (list?.length) toast.error(`You can add up to ${max} photos`);
      return;
    }
    setBusy(true);
    onBusyChange?.(true);
    setProgress(0);
    const takenAt = new Date().toISOString();
    try {
      const [res, coords] = await Promise.all([uploadImages(files, purpose, setProgress), withLocation ? getCoords() : Promise.resolve(null)]);
      const added: ChecklistPhoto[] = res.images.map((img) => ({ url: img.mediumUrl || img.url, takenAt, ...(coords ?? {}) }));
      if (added.length) onChange([...latest.current, ...added]);
      if (res.failed.length) toast.error(`${res.failed.length} photo${res.failed.length > 1 ? "s" : ""} failed: ${res.failed[0].error}`);
    } catch {
      toast.error("Upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {value.map((p, i) => (
          <div key={`${p.url}-${i}`} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
            <img src={p.url} alt={`Evidence ${i + 1}`} className="h-full w-full object-cover" />
            {p.lat != null && (
              <span className="absolute bottom-1 left-1 inline-flex items-center rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white" title="Location attached">
                <MapPin className="h-3 w-3" />
              </span>
            )}
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-slate-700 shadow hover:bg-white" aria-label={`Remove photo ${i + 1}`}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {value.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-xs font-semibold text-slate-600 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-70"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            {busy ? `${progress}%` : label}
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} aria-label={label} />
      <p className="mt-1.5 text-xs text-slate-500">
        {value.length}/{max} photos{withLocation ? " · time & location are recorded automatically" : ""}
      </p>
    </div>
  );
}
