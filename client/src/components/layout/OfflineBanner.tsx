import { WifiOff } from "lucide-react";
import { useOnline } from "@/hooks/useOnline";

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-sm font-medium text-amber-950" role="status">
      <WifiOff className="h-4 w-4" /> You're offline. Showing saved content — actions will work once you reconnect.
    </div>
  );
}
