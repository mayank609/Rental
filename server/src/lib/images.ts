/**
 * Image processing: strips EXIF (privacy — removes GPS), auto-rotates and
 * produces WebP full / medium / thumbnail renditions.
 */
import sharp from "sharp";
import { nanoid } from "nanoid";
import { storage } from "./storage";
import { badRequest } from "./errors";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/avif"];

export interface ProcessedImage {
  key: string;
  url: string;
  mediumUrl: string;
  thumbUrl: string;
  width?: number;
  height?: number;
}

export async function processAndStoreImage(buffer: Buffer, folder: string): Promise<ProcessedImage> {
  let img: sharp.Sharp;
  let meta: sharp.Metadata;
  try {
    img = sharp(buffer, { failOn: "error" }).rotate();
    meta = await img.metadata();
  } catch {
    throw badRequest("Unsupported or corrupted image");
  }
  if ((meta.width ?? 0) < 200 || (meta.height ?? 0) < 200) throw badRequest("Image is too small (min 200×200)");

  const id = nanoid(16);
  const base = `${folder}/${id}`;
  const [full, medium, thumb] = await Promise.all([
    img.clone().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true }),
    img.clone().resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).webp({ quality: 75 }).toBuffer(),
    img.clone().resize({ width: 400, height: 300, fit: "cover" }).webp({ quality: 70 }).toBuffer(),
  ]);
  const [url, mediumUrl, thumbUrl] = await Promise.all([
    storage.put(`${base}.webp`, full.data, "image/webp"),
    storage.put(`${base}_md.webp`, medium, "image/webp"),
    storage.put(`${base}_th.webp`, thumb, "image/webp"),
  ]);
  return { key: base, url, mediumUrl, thumbUrl, width: full.info.width, height: full.info.height };
}
