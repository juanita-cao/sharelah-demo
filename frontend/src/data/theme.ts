import type { ActorKind } from "../api/types";

// One colour per role, so a person always knows whose view this is: shippers orange, carriers green, the platform operator blue.
export interface Palette { primary: string; soft: string; ink: string; onPrimary: string; name: string }
export const PALETTE: Record<ActorKind, Palette> = {
  SHIPPER: { primary: "#F28C00", soft: "#FFF3DC", ink: "#9A5400", onPrimary: "#1B1B1B", name: "orange" },   // dark text on orange: white on this orange would not be readable
  CARRIER: { primary: "#00A94F", soft: "#E1F6EA", ink: "#007A39", onPrimary: "#FFFFFF", name: "green" },
  OPERATOR: { primary: "#1E63D8", soft: "#E4EDFC", ink: "#174AA3", onPrimary: "#FFFFFF", name: "blue" },
};
