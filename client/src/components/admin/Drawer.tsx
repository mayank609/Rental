/** Right-hand slide-over panel for previews (listings, documents). */
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import clsx from "clsx";

export function Drawer({ open, onClose, title, children, footer, width = "max-w-xl" }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[900] flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={onClose} />
      <aside className={clsx("relative flex h-full w-full flex-col bg-white shadow-[var(--shadow-pop)]", width)}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <h3 className="min-w-0 truncate text-base font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close panel">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}
