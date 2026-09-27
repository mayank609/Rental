import { chromium } from "@playwright/test";
import path from "node:path";
const [w, h, cut, times, prefix] = [+process.argv[2], +process.argv[3], process.argv[4], process.argv[5].split(",").map(Number), process.argv[6]];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: w, height: h } });
await p.goto("file://" + path.resolve("../marketing/promo/composition.html") + `?w=${w}&h=${h}&cut=${cut}`);
await p.evaluate(() => window.READY);
for (const t of times) { await p.evaluate((t) => window.seek(t), t); await p.screenshot({ path: `${prefix}-${t}.jpg`, type: "jpeg", quality: 80 }); }
await b.close();
