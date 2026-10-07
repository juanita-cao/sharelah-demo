import places from "./places.json";

export interface Place { id: string; name: string; lat: number; lon: number; country: string; kind: string }
export const PLACES = places as Place[];
export const placeName = (id: string) => PLACES.find((p) => p.id === id)?.name ?? id;
