/**
 * Captures real app screens (mobile, 2x) used inside the promo video.
 * Requires the API on :4000 and `vite preview` on :4173 with seeded data.
 *   node marketing/scripts/capture.mjs   (run from client/ so @playwright/test resolves)
 */
import { chromium } from "@playwright/test";
import path from "node:path";

const OUT = path.resolve(process.cwd(), "../marketing/assets");
const WEB = "http://localhost:4173";
const API = "http://localhost:4000/api/v1";
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  geolocation: { latitude: 19.1136, longitude: 72.8697 }, permissions: ["geolocation"], locale: "en-IN", timezoneId: "Asia/Kolkata",
});
const p = await ctx.newPage();
const shot = async (name, opts = {}) => {
  await p.waitForTimeout(opts.wait ?? 2200);
  // Fixed bars (mobile tab bar, sticky CTA) would repeat mid-page in full-page captures
  await p.addStyleTag({ content: "nav.fixed, .fixed.bottom-0, [class*='fixed'][class*='bottom-0'] { display: none !important; }" }); await p.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 84, fullPage: !!opts.full, clip: opts.clip }); console.log("✓", name); };
const token = async (email) => (await (await p.request.post(`${API}/auth/login`, { data: { email, password: "Password@123" } })).json()).accessToken;
const login = async (email) => {
  await p.goto(`${WEB}/login`); await p.getByRole("tab", { name: "Email" }).click();
  await p.getByLabel("Email", { exact: true }).fill(email); await p.getByLabel("Password", { exact: true }).fill("Password@123");
  await p.getByRole("button", { name: "Sign in", exact: true }).click(); await p.waitForURL((u) => !u.pathname.startsWith("/login"));
};

// Public
await p.goto(`${WEB}/`); await shot("home", { full: true, wait: 3500 });
await p.goto(`${WEB}/rent/mumbai`); await shot("browse", { full: true });
const s = await (await p.request.get(`${API}/listings/search?city=mumbai&category=cameras-photography&limit=5`)).json();
const cam = s.listings.find((l) => l.title.includes("Sony")) ?? s.listings[0];
await p.goto(`${WEB}/listing/${cam.id}/${cam.slug}`); await shot("listing", { full: true });

// Renter: checkout + confirmed booking
await login("renter@rentnest.in");
const start = new Date(Date.now() + 200 * 86400000); start.setUTCHours(4, 30, 0, 0);
const end = new Date(start.getTime() + 2 * 86400000);
const other = s.listings.find((l) => l.owner?.name !== "Priya Sharma") ?? cam;
await p.goto(`${WEB}/checkout/${other.id}?startAt=${start.toISOString()}&endAt=${end.toISOString()}&fulfillment=PICKUP&protection=1`); await shot("checkout", { full: true });
const rt = await token("renter@rentnest.in");
const rentals = await (await p.request.get(`${API}/bookings?role=renter&scope=upcoming`, { headers: { Authorization: `Bearer ${rt}` } })).json();
const conf = rentals.bookings.find((x) => x.status === "CONFIRMED");
if (conf) { await p.goto(`${WEB}/dashboard/bookings/${conf.id}`); await shot("booking", { full: true }); }

// Owner: dashboard + earnings
await p.context().clearCookies(); await login("owner@rentnest.in");
await p.goto(`${WEB}/dashboard`); await shot("dashboard", { full: true });
await p.goto(`${WEB}/dashboard/earnings`); await shot("earnings", { full: true });
await b.close();
