import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Category, PlatformConfig } from "@/lib/types";

/** Public platform configuration (fees, policies) — cached for the session. */
export function usePlatformConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: async () => (await api.get<PlatformConfig>("/legal/config")).data,
    staleTime: 10 * 60_000,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await api.get<{ categories: Category[] }>("/categories")).data.categories,
    staleTime: 30 * 60_000,
  });
}
