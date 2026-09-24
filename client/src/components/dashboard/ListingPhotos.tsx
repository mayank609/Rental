/**
 * Listing photo manager: drag & drop or pick up to 10 photos, per-file
 * upload progress with retry, reorder (drag or arrow buttons), remove.
 * The first photo is the cover. Compression happens inside uploadImages.
 */
import { useEffect, useRef, useState, type DragEvent } from "react";
import clsx from "clsx";
import { AlertCircle, ArrowLeft, ArrowRight, ImagePlus, Loader2, RotateCcw, Star, Trash2, UploadCloud } from "lucide-react";
import toast from "react-hot-toast";
import { uploadImages } from "@/lib/upload";
import type { ListingImage } from "@/lib/types";

export const MAX_PHOTOS = 10;

interface Pending {
  key: string;
  file: File;
  preview: string;
  progress: number;
  error: string | null;
}

export function ListingPhotos({ images, onChange, onBusyChange }: { images: ListingImage[]; onChange: (update: (prev: ListingImage[]) => ListingImage[]) => void; onBusyChange?: (busy: boolean) => void }) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploading = pending.some((p) => !p.error);
  useEffect(() => onBusyChange?.(uploading), [uploading, onBusyChange]);
  // Release object URLs on unmount.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => () => pendingRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  const upload = async (p: Pending) => {
    setPending((arr) => arr.map((x) => (x.key === p.key ? { ...x, error: null, progress: 0 } : x)));
    const res = await uploadImages([p.file], "listing", (pct) => setPending((arr) => arr.map((x) => (x.key === p.key ? { ...x, progress: pct } : x)))).catch(() => ({ images: [], failed: [{ name: p.file.name, error: "Network error" }] }));
    if (res.images[0]) {
      onChange((prev) => [...prev, res.images[0]].slice(0, MAX_PHOTOS));
      URL.revokeObjectURL(p.preview);
      setPending((arr) => arr.filter((x) => x.key !== p.key));
    } else {
      setPending((arr) => arr.map((x) => (x.key === p.key ? { ...x, error: res.failed[0]?.error ?? "Upload failed" } : x)));
    }
  };

  const addFiles = (list: FileList | File[] | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    const room = MAX_PHOTOS - images.length - pending.length;
    if (!files.length) return;
    if (room <= 0) return void toast.error(`You can add up to ${MAX_PHOTOS} photos`);
    if (files.length > room) toast(`Only the first ${room} photo${room > 1 ? "s" : ""} were added (max ${MAX_PHOTOS}).`);
    const items = files.slice(0, room).map((file) => ({ key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`, file, preview: URL.createObjectURL(file), progress: 0, error: null }));
    setPending((arr) => [...arr, ...items]);
    items.forEach((it) => void upload(it));
    if (inputRef.current) inputRef.current.value = "";
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length || from === to) return;
    onChange((prev) => {
      const next = [...prev];
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      return next;
    });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const full = images.length + pending.length >= MAX_PHOTOS;
  return (
    <div>
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={clsx("rounded-3xl border-2 border-dashed p-6 text-center transition", dragOver ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-white", full && "opacity-60")}
      >
        <UploadCloud className="mx-auto h-10 w-10 text-brand-500" />
        <p className="mt-2 font-semibold text-slate-900">Drag photos here or</p>
        <button type="button" disabled={full} onClick={() => inputRef.current?.click()} className="mt-2 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
          <ImagePlus className="h-4 w-4" /> Choose photos
        </button>
        <p className="mt-2 text-xs text-slate-500">
          Up to {MAX_PHOTOS} photos · JPG, PNG, WEBP or HEIC · We compress them automatically to save data
        </p>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} aria-label="Choose photos" />
      </div>

      {(images.length > 0 || pending.length > 0) && (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Listing photos">
          {images.map((img, i) => (
            <li
              key={img.id}
              draggable
              onDragStart={(e) => {
                setDragIdx(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragIdx != null) e.preventDefault();
              }}
              onDrop={(e) => {
                if (dragIdx == null) return;
                e.preventDefault();
                e.stopPropagation();
                move(dragIdx, i);
                setDragIdx(null);
              }}
              onDragEnd={() => setDragIdx(null)}
              className={clsx("group relative aspect-square cursor-grab overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200 active:cursor-grabbing", dragIdx === i && "opacity-40", i === 0 && "ring-2 ring-brand-500")}
            >
              <img src={img.thumbUrl || img.mediumUrl} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" draggable={false} />
              {i === 0 && (
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white shadow">
                  <Star className="h-3 w-3 fill-white" /> Cover
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent p-2">
                <div className="flex gap-1">
                  <IconBtn label="Move left" disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowLeft className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn label="Move right" disabled={i === images.length - 1} onClick={() => move(i, i + 1)}><ArrowRight className="h-3.5 w-3.5" /></IconBtn>
                </div>
                <IconBtn label="Remove photo" onClick={() => onChange((prev) => prev.filter((x) => x.id !== img.id))} danger><Trash2 className="h-3.5 w-3.5" /></IconBtn>
              </div>
              {i !== 0 && (
                <button type="button" onClick={() => move(i, 0)} className="absolute right-2 top-2 hidden rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-slate-800 shadow group-hover:block focus:block">
                  Make cover
                </button>
              )}
            </li>
          ))}
          {pending.map((p) => (
            <li key={p.key} className="relative aspect-square overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200">
              <img src={p.preview} alt="" className={clsx("h-full w-full object-cover", !p.error && "opacity-60")} />
              {p.error ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-red-900/60 p-2 text-center text-white">
                  <AlertCircle className="h-5 w-5" />
                  <p className="line-clamp-2 text-[11px]">{p.error}</p>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => upload(p)} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-900">
                      <RotateCcw className="h-3 w-3" /> Retry
                    </button>
                    <button type="button" onClick={() => { URL.revokeObjectURL(p.preview); setPending((arr) => arr.filter((x) => x.key !== p.key)); }} className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-brand-700" />
                  <div className="h-1.5 w-2/3 overflow-hidden rounded-full bg-white/80">
                    <div className="h-full bg-brand-600 transition-all" style={{ width: `${p.progress}%` }} />
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate-500">
        {images.length}/{MAX_PHOTOS} photos · Drag to reorder — the first photo is your cover. Tip: shoot in daylight and include accessories.
      </p>
    </div>
  );
}

function IconBtn({ children, label, onClick, disabled, danger }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className={clsx("rounded-full bg-white/90 p-1.5 text-slate-800 shadow transition hover:bg-white disabled:opacity-40", danger && "hover:text-red-600")}>
      {children}
    </button>
  );
}
