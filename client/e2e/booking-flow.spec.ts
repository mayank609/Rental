/**
 * Core marketplace journey through the real UI:
 * discovery → listing → checkout (agreement) → request → owner accepts →
 * renter pays (mock gateway) → booking confirmed with contact details.
 */
import { test, expect } from "@playwright/test";
import { API, apiToken, freeWindow, login } from "./helpers";

test.describe("discovery", () => {
  test("home page shows nearby listings and city pages work", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("a[href^='/listing/']").first()).toBeVisible({ timeout: 20_000 });
    await page.goto("/rent/mumbai");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Mumbai/i);
    await expect(page.locator("a[href^='/listing/']").first()).toBeVisible();
    // Unknown area → graceful empty state with nearest-items fallback
    await page.goto("/rent/drones/jodhpur");
    await expect(page.locator("body")).toContainText(/closest|nearest|nothing|no /i);
  });

  test("listing page hides the exact address and shows pricing", async ({ page, request }) => {
    const res = await request.get(`${API}/listings/search?city=bengaluru&limit=1`);
    const { listings } = await res.json();
    await page.goto(`/listing/${listings[0].id}/${listings[0].slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(listings[0].title);
    await expect(page.locator("body")).toContainText(/after (the )?booking is confirmed/i);
  });
});

test.describe("booking flow", () => {
  test.skip(({ isMobile }) => isMobile, "full flow runs once, on desktop");

  test("request → accept → pay → confirmed", async ({ browser, request }) => {
    // Pick a request-to-book listing owned by the demo owner
    const ownerToken = await apiToken(request, "owner@rentnest.in");
    const mine = await (await request.get(`${API}/listings/mine?status=ACTIVE&limit=50`, { headers: { Authorization: `Bearer ${ownerToken}` } })).json();
    const listing = mine.listings.find((l: { instantBooking: boolean }) => !l.instantBooking);
    expect(listing, "owner needs a request-to-book listing").toBeTruthy();
    const w = freeWindow(2);

    // --- Renter requests the booking ---------------------------------------
    const renterCtx = await browser.newContext();
    const renter = await renterCtx.newPage();
    await login(renter, "renter@rentnest.in");
    await renter.goto(`/listing/${listing.id}/${listing.slug}`);
    await expect(renter.getByRole("heading", { level: 1 })).toContainText(listing.title);
    await renter.goto(`/checkout/${listing.id}?startAt=${encodeURIComponent(w.startAt)}&endAt=${encodeURIComponent(w.endAt)}&fulfillment=PICKUP`);
    await expect(renter.getByText("Total payable")).toBeVisible();
    await renter.getByLabel(/I have read and accept the Rental Agreement/).check();
    await renter.getByRole("button", { name: "Send request" }).click();
    await expect(renter.getByRole("heading", { name: "Request sent!" })).toBeVisible();
    await renter.getByRole("link", { name: "View booking" }).click();
    await expect(renter.getByText("Waiting for the owner")).toBeVisible();
    const bookingUrl = renter.url();

    // --- Owner accepts -----------------------------------------------------
    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    await login(owner, "owner@rentnest.in");
    await owner.goto(new URL(bookingUrl).pathname);
    await owner.getByRole("button", { name: "Accept request" }).click();
    await expect(owner.getByText("Accepted — awaiting payment")).toBeVisible();

    // --- Renter pays through the (mock) gateway ------------------------------
    await renter.reload();
    renter.once("dialog", (d) => d.accept()); // simulated checkout confirm()
    await renter.getByRole("button", { name: /^Pay ₹/ }).click();
    await expect(renter.getByText("You're all set!")).toBeVisible({ timeout: 20_000 });
    // Contact details are revealed only now
    await expect(renter.locator("body")).toContainText("+919000000003");

    await renterCtx.close();
    await ownerCtx.close();
  });

  test("admin dashboard loads KPIs", async ({ page }) => {
    await login(page, "admin@rentnest.in");
    await page.goto("/admin");
    await expect(page.locator("body")).toContainText(/GMV/i);
  });
});
