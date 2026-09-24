/** Display metadata shared by dashboard pages. */
import type { Tone } from "@/components/ui";
import type { DisputeStatus } from "./types";

export const DISPUTE_STATUS: Record<DisputeStatus, { label: string; tone: Tone }> = {
  OPEN: { label: "Open", tone: "amber" },
  UNDER_REVIEW: { label: "Under review", tone: "blue" },
  RESOLVED: { label: "Resolved", tone: "green" },
  REJECTED: { label: "Closed", tone: "gray" },
};
