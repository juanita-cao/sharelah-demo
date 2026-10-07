import { Skeleton } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useApi, useSession } from "../app/contexts";
import { useSimNow } from "../app/hooks";
import { positionsAt } from "../lib/replay";
import { ReplayMap } from "./ReplayMap";

/** Map of one company's world (default export, loaded on demand): the real road network, the trucks this actor may see where they are now, their routes,
 *  and one highlighted road (the selected load or offer). What the actor may see is decided by the backend (/api/trajectories?companyId=). */
export default function RoleMap({ highlightPlaces, height = 340 }: { highlightPlaces: { origin: string; destination: string } | null; height?: number | string }) {
  const api = useApi();
  const { company } = useSession();
  const now = useSimNow();
  const geoQ = useQuery({ queryKey: ["geometry"], queryFn: api.geometry, staleTime: Infinity });
  const trQ = useQuery({ queryKey: ["trajectories", company.id], queryFn: () => api.trajectories(company.id), refetchInterval: 5000 });
  const geo = geoQ.data, tr = trQ.data;
  const pos = useMemo(() => (geo && tr && now !== null ? positionsAt(tr, geo, now) : []), [geo, tr, now]);
  const highlight = useMemo(() => {
    if (!geo || !highlightPlaces) return null;
    const from = geo.nodes.findIndex((n) => n.id === highlightPlaces.origin), to = geo.nodes.findIndex((n) => n.id === highlightPlaces.destination);
    return from >= 0 && to >= 0 ? { from, to } : null;
  }, [geo, highlightPlaces]);
  if (!geo || !tr || now === null) return <Skeleton active paragraph={{ rows: 6 }} />;
  return <ReplayMap geo={geo} tr={tr} t={now} pos={pos} selected={null} showRoutes showTrails={false} height={height} highlight={highlight} fitToTrucks />;
}
