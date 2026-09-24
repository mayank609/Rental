/** Formatting helpers. Amounts from the API are integers in paise. */
import { format, formatDistanceToNowStrict, isSameDay } from "date-fns";

const TZ = "Asia/Kolkata";

export const money = (paise: number | null | undefined, opts: { decimals?: boolean } = {}) => {
  if (paise == null) return "—";
  const rupees = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: opts.decimals || rupees % 1 !== 0 ? 2 : 0,
    minimumFractionDigits: opts.decimals ? 2 : 0,
  }).format(rupees);
};

/** ₹ input (string/number) → paise integer */
export const toPaise = (rupees: string | number | null | undefined) => {
  if (rupees === "" || rupees == null) return null;
  const n = Number(rupees);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
export const toRupees = (paise: number | null | undefined) => (paise == null ? "" : String(paise / 100));

export const pct = (rate: number) => `${Math.round(rate * 1000) / 10}%`;

/** Dates are stored in UTC and displayed in the user's local time zone (IST by default). */
export const fmtDate = (d: string | Date) => format(new Date(d), "d MMM yyyy");
export const fmtDateTime = (d: string | Date) => format(new Date(d), "d MMM yyyy, h:mm a");
export const fmtTime = (d: string | Date) => format(new Date(d), "h:mm a");
export const fmtRange = (a: string | Date, b: string | Date) => {
  const s = new Date(a);
  const e = new Date(b);
  return isSameDay(s, e) ? `${format(s, "d MMM, h:mm a")} – ${format(e, "h:mm a")}` : `${format(s, "d MMM, h:mm a")} → ${format(e, "d MMM, h:mm a")}`;
};
export const fromNow = (d: string | Date) => formatDistanceToNowStrict(new Date(d), { addSuffix: true });
export const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || TZ;

export const durationLabel = (hours: number) => {
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const d = Math.round((hours / 24) * 10) / 10;
  return `${d} day${d === 1 ? "" : "s"}`;
};

export const CONDITION_LABEL: Record<string, string> = { NEW: "Brand new", LIKE_NEW: "Like new", GOOD: "Good", FAIR: "Fair" };

export const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Requested",
  ACCEPTED: "Awaiting payment",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
  CONFIRMED: "Confirmed",
  ACTIVE: "Active",
  OVERDUE: "Overdue",
  RETURNED: "Returned",
  COMPLETED: "Completed",
  DISPUTED: "Disputed",
};

export const STATUS_TONE: Record<string, "gray" | "blue" | "green" | "amber" | "red" | "violet"> = {
  REQUESTED: "amber",
  ACCEPTED: "blue",
  DECLINED: "gray",
  EXPIRED: "gray",
  CANCELLED: "gray",
  CONFIRMED: "green",
  ACTIVE: "violet",
  OVERDUE: "red",
  RETURNED: "blue",
  COMPLETED: "green",
  DISPUTED: "red",
};

export const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

/** Lowest per-day price for cards. */
export const displayPrice = (p: { hourly: number | null; daily: number | null; weekly?: number | null }) =>
  p.daily ? { amount: p.daily, unit: "day" } : p.hourly ? { amount: p.hourly, unit: "hour" } : { amount: p.weekly ?? 0, unit: "week" };

export const listingPath = (l: { id: string; slug: string }) => `/listing/${l.id}/${l.slug}`;
