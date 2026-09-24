/**
 * Only accept evidence/attachment URLs that point at our own storage in
 * production — prevents phishing links or externally hosted "evidence".
 */
import { z } from "zod";
import { env, isProd } from "../config/env";

const prefixes = [`${env.API_URL}/uploads/`, env.S3_PUBLIC_URL ? `${env.S3_PUBLIC_URL.replace(/\/$/, "")}/` : null].filter(Boolean) as string[];
if (env.S3_BUCKET) prefixes.push(`https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com/`);

export const isOwnAssetUrl = (u: string) => prefixes.some((p) => u.startsWith(p));

export const assetUrlSchema = z
  .string()
  .url()
  .max(1000)
  .refine((u) => !isProd || isOwnAssetUrl(u), "Upload the file first; external links aren't accepted");
