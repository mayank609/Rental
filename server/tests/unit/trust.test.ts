import { describe, expect, it } from "vitest";
import { maskContactInfo } from "../../src/modules/trust/trust.service";
import { fuzzCoordinate, haversineKm, slugify } from "../../src/lib/util";
import { toCsv } from "../../src/modules/admin/csv";
import { financialYear } from "../../src/modules/invoices/invoices.service";

describe("maskContactInfo", () => {
  it.each([
    "Call me on 98765 43210",
    "my number is +91-9876543210",
    "email me at priya.sharma@gmail.com",
    "pay to priya@okaxis please",
    "priya at gmail dot com",
    "whatsapp me",
    "nine eight seven six five four three two one zero",
    "see www.example.com",
  ])("masks %s", (text) => {
    const r = maskContactInfo(text);
    expect(r.wasMasked).toBe(true);
    expect(r.masked).toContain("[hidden until booking is confirmed]");
  });

  it.each(["Is it available on 12-05-2026?", "The price is 1500 per day", "Can I pick up at 5:30 pm?", "Deposit of ₹25,000 is fine"])("leaves %s alone", (text) => {
    expect(maskContactInfo(text).wasMasked).toBe(false);
  });
});

describe("fuzzCoordinate", () => {
  it("is deterministic and within the radius", () => {
    const a = fuzzCoordinate(19.1, 72.87, "listing-1");
    const b = fuzzCoordinate(19.1, 72.87, "listing-1");
    expect(a).toEqual(b);
    const d = haversineKm({ lat: 19.1, lng: 72.87 }, a);
    expect(d).toBeGreaterThan(0.1);
    expect(d).toBeLessThan(0.45);
  });
});

describe("misc utils", () => {
  it("slugifies unicode & punctuation", () => {
    expect(slugify("Sony A7 III — Mirrorless (Body)")).toBe("sony-a7-iii-mirrorless-body");
    expect(slugify("Café Délice")).toBe("cafe-delice");
  });

  it("escapes CSV and prevents formula injection", () => {
    const csv = toCsv([{ a: "=SUM(A1)", b: 'he said "hi"', c: -5 }]);
    expect(csv).toBe(`a,b,c\n'=SUM(A1),"he said ""hi""",-5\n`);
  });

  it("computes the Indian financial year", () => {
    expect(financialYear(new Date("2026-03-31T10:00:00Z"))).toBe("2025-26");
    expect(financialYear(new Date("2026-04-01T10:00:00Z"))).toBe("2026-27");
  });
});

describe("queryBool", async () => {
  const { queryBool } = await import("../../src/middleware/validate");
  it("parses query-string booleans correctly", () => {
    expect(queryBool.parse("false")).toBe(false);
    expect(queryBool.parse("0")).toBe(false);
    expect(queryBool.parse("true")).toBe(true);
    expect(queryBool.parse("1")).toBe(true);
  });
});
