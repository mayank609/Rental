/**
 * Image upload with client-side compression (saves data on slow mobile
 * networks), retries with backoff and per-file failure reporting.
 */
import { api } from "./api";
import type { ListingImage } from "./types";

export async function compressImage(file: File, maxSide = 2000, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/heic" || file.type === "image/heif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", quality));
  } catch {
    return file;
  }
}

export type UploadPurpose = "listing" | "checklist" | "dispute" | "avatar" | "chat";

export interface UploadResult {
  images: (ListingImage & { id: string })[];
  failed: { name: string; error: string }[];
}

export async function uploadImages(files: File[], purpose: UploadPurpose = "listing", onProgress?: (pct: number) => void): Promise<UploadResult> {
  const out: UploadResult = { images: [], failed: [] };
  for (const [i, file] of files.entries()) {
    const blob = await compressImage(file);
    let lastErr = "Upload failed";
    let done = false;
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      try {
        const fd = new FormData();
        fd.append("files", blob, file.name.replace(/\.(heic|heif)$/i, ".jpg"));
        const r = await api.post(`/uploads/images?purpose=${purpose}`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 120_000,
          onUploadProgress: (e) => onProgress?.(Math.round(((i + (e.total ? e.loaded / e.total : 0)) / files.length) * 100)),
        });
        out.images.push(...r.data.images);
        out.failed.push(...(r.data.failed ?? []));
        done = true;
      } catch (err) {
        lastErr = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message ?? "Network error";
        if ((err as { response?: { status?: number } }).response?.status === 400) break; // don't retry invalid files
        await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
      }
    }
    if (!done) out.failed.push({ name: file.name, error: lastErr });
  }
  onProgress?.(100);
  return out;
}
