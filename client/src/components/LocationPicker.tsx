/**
 * City / locality picker: GPS detection, autocomplete (cities, localities,
 * pincodes) and popular cities. Works for ANY city returned by the geocoder.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crosshair, MapPin, Search } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";
import { useLocationStore, type UserLocation } from "@/stores/location";
import { Modal, Spinner } from "./ui";

interface PlaceResult {
  type: "city" | "locality";
  city: string;
  citySlug: string;
  locality?: string;
  localitySlug?: string;
  state?: string;
  lat: number;
  lng: number;
  listingCount?: number;
  cityListingCount?: number;
}

export function LocationPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const dq = useDebounce(q, 300);
  const { detect, detecting, setLocation, permissionDenied } = useLocationStore();

  const search = useQuery({
    queryKey: ["places", dq],
    queryFn: async () => (await api.get<{ results: PlaceResult[] }>("/locations/search", { params: { q: dq } })).data.results,
    enabled: dq.length >= 2,
  });
  const cities = useQuery({
    queryKey: ["cities"],
    queryFn: async () => (await api.get<{ cities: { name: string; slug: string; lat: number; lng: number; listingCount: number; state: string | null }[] }>("/locations/cities")).data.cities,
    staleTime: 5 * 60_000,
  });

  const choose = (p: Omit<UserLocation, "source">) => {
    setLocation({ ...p, source: "manual" });
    toast.success(`Showing items near ${p.locality ? `${p.locality}, ` : ""}${p.city}`);
    onClose();
    setQ("");
  };

  const useGps = async () => {
    const loc = await detect({ force: true });
    if (loc?.source === "gps") {
      toast.success(`Located you in ${loc.locality ? `${loc.locality}, ` : ""}${loc.city}`);
      onClose();
    } else {
      toast.error(useLocationStore.getState().permissionDenied ? "Location permission denied — pick your city below." : "Couldn't detect your location. Pick your city below.");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Choose your location">
      <button onClick={useGps} disabled={detecting} className="mb-4 flex w-full items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-left font-semibold text-brand-700 hover:bg-brand-100">
        {detecting ? <Spinner className="h-5 w-5" /> : <Crosshair className="h-5 w-5" />}
        Use my current location
      </button>
      {permissionDenied && <p className="-mt-2 mb-3 text-xs text-slate-500">Location access is blocked in your browser settings. You can still search for your area.</p>}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search city, area or pincode" className="input pl-9" aria-label="Search location" />
      </div>
      <div className="mt-3 max-h-[45vh] overflow-y-auto">
        {dq.length >= 2 ? (
          search.isLoading ? (
            <div className="flex justify-center py-6 text-brand-600"><Spinner /></div>
          ) : search.data?.length ? (
            <ul className="divide-y divide-slate-100">
              {search.data.map((p, i) => (
                <li key={`${p.citySlug}-${p.locality ?? ""}-${i}`}>
                  <button onClick={() => choose({ city: p.city, citySlug: p.citySlug, locality: p.locality ?? null, localitySlug: p.localitySlug ?? null, lat: p.lat, lng: p.lng })} className="flex w-full items-center gap-3 px-1 py-3 text-left hover:bg-slate-50">
                    <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{p.locality ? `${p.locality}, ${p.city}` : p.city}</span>
                      {p.state && <span className="block text-xs text-slate-500">{p.state}</span>}
                    </span>
                    {(p.listingCount ?? p.cityListingCount ?? 0) > 0 && <span className="text-xs text-slate-500">{p.listingCount ?? p.cityListingCount} items</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">No places found for “{dq}”.</p>
          )
        ) : (
          <>
            <p className="mb-2 mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Popular cities</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {cities.data?.slice(0, 12).map((c) => (
                <button key={c.slug} onClick={() => choose({ city: c.name, citySlug: c.slug, lat: c.lat, lng: c.lng, locality: null, localitySlug: null })} className="rounded-xl border border-slate-200 px-3 py-2.5 text-left hover:border-brand-300 hover:bg-brand-50">
                  <span className="block text-sm font-semibold text-slate-900">{c.name}</span>
                  <span className="text-xs text-slate-500">{c.listingCount} items</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
