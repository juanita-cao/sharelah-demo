import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Profile } from "../api/types";
import { useApi, useSession } from "./contexts";

export const POLL_MS = 2500;

export function useStateQuery() {
  const api = useApi(); const { company } = useSession();
  return useQuery({ queryKey: ["state", company.id], queryFn: () => api.state(company.id), refetchInterval: POLL_MS });
}
export function useOptionsQuery(loadId: string | null, profile: Profile) {
  const api = useApi();
  return useQuery({ queryKey: ["options", loadId, profile], queryFn: () => api.options(loadId as string, profile), enabled: loadId !== null });
}
export function useRefreshState() { const qc = useQueryClient(); return () => qc.invalidateQueries({ queryKey: ["state"] }); }
export function useApiMutation<TVars, TData>(fn: (v: TVars) => Promise<TData>, invalidate: string[] = ["state"]) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => { for (const k of invalidate) void qc.invalidateQueries({ queryKey: [k] }); } });
}

/** The demo clock in minutes of the day: the server's value at the last poll plus the real seconds since then (one real second = one simulated minute). */
export function useSimNow(): number | null {
  const q = useStateQuery();
  const [, tick] = useState(0);
  useEffect(() => { const id = window.setInterval(() => tick((n) => n + 1), 500); return () => window.clearInterval(id); }, []);
  if (!q.data) return null;
  return q.data.nowMin + (Date.now() - q.dataUpdatedAt) / 1000;
}
