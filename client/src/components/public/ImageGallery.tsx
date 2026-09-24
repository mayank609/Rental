/**
 * Listing photo gallery: responsive mosaic (1 large + 4 small on desktop,
 * swipeable strip on mobile) and a full-screen lightbox with keyboard
 * navigation. Images are lazy-loaded with srcset.
 */
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import type { ListingImage } from "@/lib/types";

const srcSet = (img: ListingImage) => `${img.thumbUrl} 400w, ${img.mediumUrl} 800w, ${img.url} 1600w`;

export function ImageGallery({ images, title }: { images: ListingImage[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);

  if (!images.length) {
    return <div className="flex aspect-[16/9] items-center justify-center rounded-3xl bg-slate-100 text-slate-400">No photos yet</div>;
  }
  const [first, ...rest] = images;

  return (
    <>
      {/* Mobile: swipeable strip */}
      <div className="scrollbar-none -mx-4 flex snap-x snap-mandatory overflow-x-auto sm:hidden" aria-label="Photos">
        {images.map((img, i) => (
          <button key={img.id} onClick={() => setOpen(i)} className="relative aspect-[4/3] w-full shrink-0 snap-center" aria-label={`Open photo ${i + 1} of ${images.length}`}>
            <img src={img.mediumUrl} srcSet={srcSet(img)} sizes="100vw" alt={`${title} — photo ${i + 1}`} loading={i === 0 ? "eager" : "lazy"} decoding="async" className="h-full w-full object-cover" />
            <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-semibold text-white">{i + 1} / {images.length}</span>
          </button>
        ))}
      </div>

      {/* Desktop: mosaic */}
      <div className={clsx("relative hidden gap-2 overflow-hidden rounded-3xl sm:grid", rest.length >= 4 ? "grid-cols-4 grid-rows-2" : rest.length ? "grid-cols-2" : "grid-cols-1")} style={{ height: "min(460px, 50vw)" }}>
        <button onClick={() => setOpen(0)} className={clsx("group relative overflow-hidden", rest.length >= 4 && "col-span-2 row-span-2")} aria-label="Open photo 1">
          <img src={first.mediumUrl} srcSet={srcSet(first)} sizes="(max-width: 1024px) 60vw, 640px" alt={`${title} — photo 1`} loading="eager" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
        </button>
        {(rest.length >= 4 ? rest.slice(0, 4) : rest.slice(0, 1)).map((img, i) => (
          <button key={img.id} onClick={() => setOpen(i + 1)} className="group relative overflow-hidden" aria-label={`Open photo ${i + 2}`}>
            <img src={rest.length >= 4 ? img.thumbUrl : img.mediumUrl} srcSet={srcSet(img)} sizes={rest.length >= 4 ? "(max-width: 1024px) 30vw, 320px" : "(max-width: 1024px) 50vw, 640px"} alt={`${title} — photo ${i + 2}`} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
          </button>
        ))}
        {images.length > 1 && (
          <button onClick={() => setOpen(0)} className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 shadow-md ring-1 ring-slate-200 hover:bg-slate-50">
            <Images className="h-4 w-4" /> Show all {images.length} photos
          </button>
        )}
      </div>

      {open != null && <Lightbox images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} title={title} />}
    </>
  );
}

function Lightbox({ images, index, onIndex, onClose, title }: { images: ListingImage[]; index: number; onIndex: (i: number) => void; onClose: () => void; title: string }) {
  const go = useCallback((d: number) => onIndex((index + d + images.length) % images.length), [index, images.length, onIndex]);
  const [touchX, setTouchX] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [go, onClose]);

  const img = images[index];
  return createPortal(
    <div className="fixed inset-0 z-[1100] flex flex-col bg-black/95" role="dialog" aria-modal="true" aria-label={`${title} photos`}>
      <div className="flex items-center justify-between p-4 text-white">
        <span className="text-sm font-medium">{index + 1} / {images.length}</span>
        <button onClick={onClose} autoFocus className="rounded-full p-2 hover:bg-white/10" aria-label="Close photos">
          <X className="h-6 w-6" />
        </button>
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16"
        onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX == null) return;
          const dx = e.changedTouches[0].clientX - touchX;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          setTouchX(null);
        }}
      >
        <img key={img.id} src={img.url} srcSet={srcSet(img)} sizes="100vw" alt={`${title} — photo ${index + 1}`} className="max-h-full max-w-full rounded-lg object-contain" />
        {images.length > 1 && (
          <>
            <button onClick={() => go(-1)} className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 sm:block" aria-label="Previous photo">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button onClick={() => go(1)} className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 sm:block" aria-label="Next photo">
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>
      <div className="scrollbar-none flex justify-center gap-2 overflow-x-auto p-4">
        {images.map((im, i) => (
          <button key={im.id} onClick={() => onIndex(i)} aria-label={`Photo ${i + 1}`} aria-current={i === index} className={clsx("h-14 w-20 shrink-0 overflow-hidden rounded-lg ring-2 transition", i === index ? "ring-white" : "opacity-50 ring-transparent hover:opacity-100")}>
            <img src={im.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
