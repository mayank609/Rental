import { Badge } from "./ui";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/format";

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "gray"}>{STATUS_LABEL[status] ?? status.replace(/_/g, " ").toLowerCase()}</Badge>;
}
