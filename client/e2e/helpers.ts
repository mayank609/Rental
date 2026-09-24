import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const API = process.env.E2E_API_URL ?? "http://localhost:4000/api/v1";
export const PASSWORD = "Password@123";

/** Sign in through the real login UI (email + password tab). */
export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Email" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function apiToken(request: APIRequestContext, email: string) {
  const r = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  expect(r.ok()).toBeTruthy();
  return (await r.json()).accessToken as string;
}

/** A free, hour-aligned window far enough ahead to avoid seeded bookings. */
export function freeWindow(days = 2) {
  const offsetDays = 90 + Math.floor(Math.random() * 60);
  const start = new Date(Math.ceil((Date.now() + offsetDays * 86_400_000) / 3_600_000) * 3_600_000);
  start.setUTCHours(4, 30, 0, 0); // 10:00 IST
  return { startAt: start.toISOString(), endAt: new Date(start.getTime() + days * 86_400_000).toISOString() };
}
