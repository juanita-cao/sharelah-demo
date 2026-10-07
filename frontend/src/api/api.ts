import type { AxiosInstance } from "axios";
import type { ApplyResult, CapacityOfferVM, FreeSpaceVM, SessionResponseVM, SessionStateVM, Geometry, OfferMode, ParticipationPointVM, QuoteEstimateVM, SensitivityRowVM, TrajectoryVM, ApprovalPreviewVM, AssumptionVM, JobVM, LoadVM, OptionsVM, PriceTableVM, Profile, ScenarioVM, StateVM } from "./types";

export interface PostLoadBody { homeCarrierId?: string; customer?: string; companyId: string; origin: string; destination: string; pallets: number; weightKg: number; tempClass: LoadVM["tempClass"]; hazardClass: LoadVM["hazardClass"]; flags: LoadVM["flags"]; pickupFromMin: number; deliverByMin: number; exclusive?: boolean }
export interface PostOfferBody { companyId: string; vehicleId: string; from: string; to: string; fromMin: number; toMin: number; mode: OfferMode; freePallets: number; freeKg: number; maxDetourKm: number; maxDetourMin: number; toleranceMin: number }
export interface PostCapacityBody { companyId: string; vehicleId: string; from: string; to: string; departMin: number; freePallets: number; freeKg: number }

// One function per endpoint of the backend integration contract.
export function createApi(c: AxiosInstance) {
  return {
    state: (companyId: string) => c.get<StateVM>("/api/state", { params: { companyId } }).then((r) => r.data),
    postLoad: (b: PostLoadBody) => c.post<{ loadId: string }>("/api/loads", b).then((r) => r.data),
    postCapacity: (b: PostCapacityBody) => c.post<{ postId: string }>("/api/capacity-posts", b).then((r) => r.data),
    postOffer: (b: PostOfferBody) => c.post<{ offerId: string }>("/api/capacity-offers", b).then((r) => r.data),
    withdrawOffer: (offerId: string) => c.delete<CapacityOfferVM>(`/api/capacity-offers/${offerId}`).then((r) => r.data),
    freeSpace: (vehicleId: string, fromMin: number, toMin: number) => c.get<FreeSpaceVM>(`/api/vehicles/${vehicleId}/free-space`, { params: { from: fromMin, to: toMin } }).then((r) => r.data),
    options: (loadId: string, profile: Profile) => c.get<OptionsVM>(`/api/loads/${loadId}/options`, { params: { profile } }).then((r) => r.data),
    approve: (loadId: string, body: { optionId: string; epoch: number; expectedVersion: number; mode: "preview" | "apply" }) =>
      c.post<ApprovalPreviewVM | ApplyResult>(`/api/loads/${loadId}/approve`, body).then((r) => r.data),
    urgent: () => c.post<{ loadId: string }>("/api/events/urgent").then((r) => r.data),
    optimizePreview: (body: { profile: Profile; floor: boolean; epoch: number }) => c.post<{ jobId: string }>("/api/optimize/preview", body).then((r) => r.data),
    job: (id: string) => c.get<JobVM>(`/api/optimize/jobs/${id}`).then((r) => r.data),
    cancelJob: (id: string) => c.delete<{ status: string }>(`/api/optimize/jobs/${id}`).then((r) => r.data),
    optimizeApply: (body: { candidateId: string; epoch: number }) => c.post<ApplyResult>("/api/optimize/apply", body).then((r) => r.data),
    respond: (offerId: string, body: { response: "ACCEPT" | "DECLINE"; expectedVersion: number; epoch: number }) => c.post<{ status: string }>(`/api/offers/${offerId}/response`, body).then((r) => r.data),
    scenarios: () => c.get<ScenarioVM>("/api/analysis/scenarios").then((r) => r.data),
    participation: () => c.get<ParticipationPointVM[]>("/api/analysis/participation").then((r) => r.data),
    sensitivity: () => c.get<SensitivityRowVM[]>("/api/analysis/sensitivity").then((r) => r.data),
    assumptions: () => c.get<AssumptionVM[]>("/api/assumptions").then((r) => r.data),
    priceTable: () => c.get<PriceTableVM>("/api/price-table").then((r) => r.data),
    putPriceTable: (p: PriceTableVM) => c.put<PriceTableVM>("/api/price-table", p).then((r) => r.data),
    // The backend returns only what this actor may see: all trips for the operator, own vehicles for a carrier, only the trips of own loads for a shipper.
    trajectories: (companyId: string) => c.get<TrajectoryVM>("/api/trajectories", { params: { companyId } }).then((r) => r.data),
    geometry: () => c.get<Geometry>("/network_geometry.json", { baseURL: "" }).then((r) => r.data),
    quoteEstimate: (q: { origin: string; destination: string; pallets: number; tempClass: string; hazardClass: string | null; exclusive?: boolean }) => c.get<QuoteEstimateVM>("/api/quote-estimate", { params: q }).then((r) => r.data),
    setSharing: (vehicleId: string, shared: boolean) => c.put<{ vehicleId: string; shared: boolean }>(`/api/vehicles/${vehicleId}/sharing`, { shared }).then((r) => r.data),
    // the live demo session: served by scripts/demo_server.py through the same-origin /api proxy (baseURL ""), not by the mock backend
    sessionStart: (b: { carrier: string; seed?: number; loads?: number; speed?: number; reset?: boolean }) => c.post<{ carrier_id: string; epoch: number; now_min: number }>("/api/session", b, { baseURL: "" }).then((r) => r.data),
    sessionOpportunities: (carrier: string) => c.get<SessionStateVM>("/api/session/opportunities", { params: { carrier }, baseURL: "" }).then((r) => r.data),
    sessionRespond: (id: string, carrier: string, response: "ACCEPT" | "DECLINE") => c.post<SessionResponseVM>(`/api/session/opportunities/${id}/response`, { carrier, response }, { baseURL: "" }).then((r) => r.data),
    sessionAdvance: (toMin: number) => c.post<{ epoch: number; now_min: number }>("/api/session/advance", { to_min: toMin }, { baseURL: "" }).then((r) => r.data),
    reset: () => c.post<{ epoch: number }>("/api/reset").then((r) => r.data),
  };
}
export type Api = ReturnType<typeof createApi>;
