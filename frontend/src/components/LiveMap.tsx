import { Skeleton } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { LoadVM, TrajectoryVM, VehicleVM } from "../api/types";
import { useApi } from "../app/contexts";
import type { Pos } from "../lib/replay";
import { ReplayMap } from "./ReplayMap";

const EMPTY: TrajectoryVM = { planLabel: "", startMin: 0, endMin: 1, vehicles: [], events: [] };

/** The control tower's live map: real map, the whole road network, the fleet where it stands now, and the selected load's road. Loaded on demand (default export). */
export default function LiveMap({ vehicles, selected, height = 330 }: { vehicles: VehicleVM[]; selected: LoadVM | null; height?: number | string }) {
  const api = useApi();
  const geoQ = useQuery({ queryKey: ["geometry"], queryFn: api.geometry, staleTime: Infinity });
  const geo = geoQ.data;
  const pos = useMemo<Pos[]>(() => {
    if (!geo) return [];
    const at = new Map(geo.nodes.map((n) => [n.id, n]));
    return vehicles.flatMap((v) => { const n = at.get(v.position); return n ? [{ vehicleId: v.vehicleId, carrierId: v.carrierId, x: n.lon, y: n.lat, loaded: false, state: "idle" as const, heading: 0 }] : []; });
  }, [geo, vehicles]);
  const highlight = useMemo(() => {
    if (!geo || !selected) return null;
    const from = geo.nodes.findIndex((n) => n.id === selected.origin), to = geo.nodes.findIndex((n) => n.id === selected.destination);
    return from >= 0 && to >= 0 ? { from, to } : null;
  }, [geo, selected]);
  if (!geo) return <Skeleton active paragraph={{ rows: 6 }} />;
  return <ReplayMap geo={geo} tr={EMPTY} t={0} pos={pos} selected={null} showRoutes={false} showTrails={false} height={height} highlight={highlight} />;
}
