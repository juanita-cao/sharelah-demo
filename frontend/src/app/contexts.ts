import { createContext, useContext } from "react";
import type { Api } from "../api/api";
import type { ActorKind, Company } from "../api/types";

export const ApiContext = createContext<Api | null>(null);
export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error("ApiContext missing");
  return api;
}

export interface Session { company: Company; setCompanyId: (id: string) => void; setKind: (kind: ActorKind) => void; companies: Company[] }
export const SessionContext = createContext<Session | null>(null);
export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("SessionContext missing");
  return s;
}
