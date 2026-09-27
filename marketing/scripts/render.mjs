/**
 * Renders the promo composition to ad-ready MP4s (H.264 High + AAC,
 * faststart), a thumbnail JPG and an .srt caption file per format.
 *
 *   cd client && node ../marketing/scripts/render.mjs [formatId...]
 *
 * Needs: ffmpeg, python3 + numpy (music), Playwright Chromium.
 */
import { chromium } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(process.cwd(), "../marketing");
const OUT = path.join(ROOT, "out");
const FPS = 30;
const FORMATS = [
  { id: "vertical-9x16-30s", w: 1080, h: 1920, cut: "30", use: "Instagram Reels & Stories, YouTube Shorts, Facebook Reels, Moj/Josh" },
  { id: "square-1x1-30s", w: 1080, h: 1080, cut: "30", use: "Instagram & Facebook feed, LinkedIn" },
  { id: "landscape-16x9-30s", w: 1920, h: 1080, cut: "30", use: "YouTube in-stream, website hero, connected TV" },
  { id: "vertical-9x16-15s", w: 1080, h: 1920, cut: "15", use: "Stories / Shorts short-form, YouTube bumper-style" },
];
const only = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });

const CAPTIONS = {
  "30": [
    [0, 3.2, "That ₹60,000 camera you used twice this year?"],
    [3.2, 7, "Rent it out. Earn ₹17,777 a month."],
    [7, 12, "Need something? It's probably next door."],
    [12, 16.5, "Why buy it? Rent it. Cameras to camping gear, from people near you."],
    [16.5, 21.5, "Safe by design. Verified users, deposit held safely, photo-checked handover."],
    [21.5, 25.5, "Find it nearby. Book and pay securely. Pick up, use, return."],
    [25.5, 30, "RentNest. Rent anything. Earn from everything. Start on rentnest.in"],
  ],
  "15": [
    [0, 2.6, "That ₹60,000 camera you used twice this year?"],
    [2.6, 5.6, "Rent it out. Earn ₹17,777 a month."],
    [5.6, 8.8, "Need something? It's probably next door."],
    [8.8, 11.8, "Safe by design. Verified users, protected deposits."],
    [11.8, 15, "RentNest. Rent anything. Earn from everything. rentnest.in"],
  ],
};
const ts = (s) => { const ms = Math.round(s * 1000); const p = (n, l = 2) => String(n).padStart(l, "0"); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
for (const f of FORMATS.filter((f) => !only.length || only.includes(f.id))) {
  const started = Date.now();
  const page = await browser.newPage({ viewport: { width: f.w, height: f.h }, deviceScaleFactor: 1 });
  await page.goto("file://" + path.join(ROOT, "promo/composition.html") + `?w=${f.w}&h=${f.h}&cut=${f.cut}`);
  await page.evaluate(() => window.READY);
  const meta = await page.evaluate(() => ({ duration: window.DURATION, cuts: window.CUTS, drop: window.DROP, endcard: window.ENDCARD }));

  const wav = path.join(OUT, `.music-${f.cut}.wav`);
  if (!fs.existsSync(wav)) execFileSync("python3", [path.join(ROOT, "scripts/music.py"), String(meta.duration), wav, meta.cuts.join(","), String(meta.drop), String(meta.endcard)], { stdio: "inherit" });

  const mp4 = path.join(OUT, `rentnest-${f.id}.mp4`);
  const ff = spawn("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-i", wav,
    "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-ar", "44100",
    "-shortest", "-movflags", "+faststart",
    "-metadata", "title=RentNest — Rent anything. Earn from everything.",
    mp4,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const frames = Math.round(meta.duration * FPS);
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.seek(t), i / FPS);
    const buf = await page.screenshot({ type: "jpeg", quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 150 === 0) process.stdout.write(`  ${f.id}: frame ${i}/${frames}\r`);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg failed")))));

  // Thumbnail from the hook frame (most scroll-stopping moment)
  await page.evaluate(() => window.seek(2.9));
  await page.screenshot({ path: path.join(OUT, `rentnest-${f.id}-thumbnail.jpg`), type: "jpeg", quality: 90 });
  fs.writeFileSync(path.join(OUT, `rentnest-${f.id}.srt`), CAPTIONS[f.cut].map(([a, b, text], i) => `${i + 1}\n${ts(a)} --> ${ts(b)}\n${text}\n`).join("\n"));
  await page.close();
  console.log(`✓ ${path.basename(mp4)} (${(fs.statSync(mp4).size / 1e6).toFixed(1)} MB, ${((Date.now() - started) / 1000).toFixed(0)}s) — ${f.use}`);
}
await browser.close();
