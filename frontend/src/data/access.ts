import type { ActorKind } from "../api/types";

// What each actor may open: a company sees its own workspace only; the platform operator sees the whole network (the Control Tower belongs to the operator).
export const PAGES: Record<ActorKind, string[]> = {
  SHIPPER: ["/shipper", "/dashboard", "/history", "/guide"],
  CARRIER: ["/driver", "/dashboard", "/history", "/guide", "/simulation"],
  OPERATOR: ["/control-tower", "/analysis", "/map", "/settings", "/guide", "/simulation"],
};
export const HOME: Record<ActorKind, string> = { SHIPPER: "/shipper", CARRIER: "/driver", OPERATOR: "/control-tower" };
export const allowed = (kind: ActorKind, path: string) => PAGES[kind].some((p) => path === p || path.startsWith(`${p}/`));
