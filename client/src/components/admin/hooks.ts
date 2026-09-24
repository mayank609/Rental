/**
 * Small hooks shared by the admin pages:
 * - useUrlFilters: filter state stored in the URL (shareable, survives reload)
 * - useAdminMutation: POST/PATCH wrapper with toasts + query invalidation
 */
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { apiError } from "@/lib/api";

/**
 * Typed URL-search-param state. Empty values are removed from the URL.
 * Changing any filter other than `page` resets the page to 1.
 */
export function useUrlFilters<T extends Record<string, string>>(defaults: T) {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => {
    const out = { ...defaults } as Record<string, string>;
    for (const k of Object.keys(defaults)) {
      const v = params.get(k);
      if (v != null) out[k] = v;
    }
    return out as T;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const set = useCallback(
    (patch: Partial<T>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v == null || v === "" || v === defaults[k]) next.delete(k);
            else next.set(k, String(v));
          }
          if (!("page" in patch)) next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setParams],
  );
  return [filters, set] as const;
}

/** Remove empty values so query strings/keys stay clean. */
export function cleanParams(o: Record<string, string | number | boolean | undefined | null>) {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(o)) if (v !== "" && v != null && v !== false) out[k] = v;
  return out;
}

interface AdminMutationOpts<TVars, TData> {
  fn: (vars: TVars) => Promise<TData>;
  /** Query keys (prefixes) to invalidate on success. */
  invalidate?: QueryKey[];
  success?: string | ((data: TData, vars: TVars) => string);
  onSuccess?: (data: TData, vars: TVars) => void;
}

export function useAdminMutation<TVars = void, TData = unknown>({ fn, invalidate = [], success, onSuccess }: AdminMutationOpts<TVars, TData>) {
  const qc = useQueryClient();
  return useMutation<TData, unknown, TVars>({
    mutationFn: fn,
    onSuccess: (data, vars) => {
      for (const key of invalidate) qc.invalidateQueries({ queryKey: key });
      if (success) toast.success(typeof success === "function" ? success(data, vars) : success);
      onSuccess?.(data, vars);
    },
    onError: (err) => toast.error(apiError(err)),
  });
}
