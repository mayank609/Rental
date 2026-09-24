/**
 * Object storage abstraction: S3-compatible (AWS S3, Cloudflare R2, MinIO,
 * DigitalOcean Spaces) when configured, local disk otherwise (development).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";

export interface Storage {
  put(key: string, body: Buffer, contentType: string, isPrivate?: boolean): Promise<string>;
  get(key: string): Promise<Buffer>;
  signedUrl(key: string, ttlSeconds?: number): Promise<string>;
  remove(key: string): Promise<void>;
}

class S3Storage implements Storage {
  private client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
        : undefined,
  });
  private bucket = env.S3_BUCKET!;

  async put(key: string, body: Buffer, contentType: string, isPrivate = false) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: isPrivate ? "private, no-store" : "public, max-age=31536000, immutable",
      }),
    );
    const base = env.S3_PUBLIC_URL ?? `https://${this.bucket}.s3.${env.S3_REGION}.amazonaws.com`;
    return `${base.replace(/\/$/, "")}/${key}`;
  }
  async get(key: string) {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await out.Body!.transformToByteArray());
  }
  async signedUrl(key: string, ttl = 300) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: ttl });
  }
  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

class LocalStorage implements Storage {
  private root = path.resolve(env.LOCAL_UPLOAD_DIR);
  private safe(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(this.root)) throw new Error("Invalid storage key");
    return p;
  }
  async put(key: string, body: Buffer, _ct: string, isPrivate = false) {
    const p = this.safe(isPrivate ? `private/${key}` : key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, body);
    return isPrivate ? `private://${key}` : `${env.API_URL}/uploads/${key}`;
  }
  async get(key: string) {
    try {
      return await fs.readFile(this.safe(`private/${key}`));
    } catch {
      return fs.readFile(this.safe(key));
    }
  }
  async signedUrl(key: string) {
    return `${env.API_URL}/uploads/${key}`;
  }
  async remove(key: string) {
    await fs.rm(this.safe(key), { force: true });
  }
}

export const storage: Storage = env.S3_BUCKET ? new S3Storage() : new LocalStorage();
export const localUploadRoot = path.resolve(env.LOCAL_UPLOAD_DIR);
