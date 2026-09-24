import { describe, expect, it } from "vitest";
import { displayPrice, durationLabel, initials, listingPath, money, toPaise, toRupees } from "./format";

describe("format helpers", () => {
  it("formats paise as INR", () => {
    expect(money(150000)).toBe("₹1,500");
    expect(money(150050)).toBe("₹1,500.50");
    expect(money(null)).toBe("—");
  });

  it("converts rupees ↔ paise without float drift", () => {
    expect(toPaise("1499.99")).toBe(149999);
    expect(toPaise("")).toBeNull();
    expect(toRupees(149999)).toBe("1499.99");
  });

  it("picks the best display price", () => {
    expect(displayPrice({ hourly: 5000, daily: 90000 })).toEqual({ amount: 90000, unit: "day" });
    expect(displayPrice({ hourly: 5000, daily: null })).toEqual({ amount: 5000, unit: "hour" });
  });

  it("builds labels and paths", () => {
    expect(durationLabel(5)).toBe("5 hours");
    expect(durationLabel(48)).toBe("2 days");
    expect(initials("Priya Sharma")).toBe("PS");
    expect(listingPath({ id: "abc", slug: "canon-90d" })).toBe("/listing/abc/canon-90d");
  });
});
