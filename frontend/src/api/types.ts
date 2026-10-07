// DTOs and ViewModels (view-model contract). The backend returns codes and numbers only; wording is produced by the frontend per language.
export type TempClass = "AMB" | "COOL" | "CHILL" | "PHARMA" | "FROZEN";
export type HazardClass = "CL3" | "CL5_1" | "CL6_1" | "CL8";
export type CargoFlag = "FOOD" | "HALAL" | "NON_HALAL";
export type Profile = "PROFIT" | "BALANCED" | "GREEN";
export type LoadStatus = "RECEIVED" | "MATCHED" | "CONFIRMED" | "IN_TRANSIT" | "DONE" | "UNSERVED";
export type OfferStatus = "SHOWN" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "STALE";

export type ActorKind = "SHIPPER" | "CARRIER" | "OPERATOR";
export interface Company { id: string; name: string; kind: ActorKind }

export interface LoadVM {
  loadId: string; companyId: string; origin: string; destination: string; lane: string; pallets: number; weightKg: number;
  tempClass: TempClass; hazardClass: HazardClass | null; flags: CargoFlag[]; status: LoadStatus; urgent: boolean; ageSec: number;
  pickupFromMin: number; deliverByMin: number; etaMin: number | null; quote: number | null; vehicleId: string | null; reasonCode: string | null;
  exclusive: boolean;   // the shipper chose a dedicated truck (only this cargo on board from pickup to delivery); false = shared truck
  homeCarrierId: string | null; customer: string | null;   // set when a carrier brought the load in: the carrier that gets the referral if another carrier serves it
}
export interface VehicleVM { vehicleId: string; carrierId: string; type: "DRY_VAN" | "REEFER_SINGLE" | "REEFER_DUAL"; palletCap: number; dgCapable: boolean; position: string; freePallets: number; shared: boolean; weeklyGain: number }
export interface CapacityPostVM { postId: string; companyId: string; vehicleId: string; from: string; to: string; departMin: number; freePallets: number; freeKg: number }
// A capacity offer (backend contract): the unit a carrier shares. `mode` is only how it was entered: the whole truck (values = the truck's capacity) or part of it.
export type OfferMode = "WHOLE_TRUCK" | "PARTIAL";
export interface CapacityOfferVM {
  offerId: string; companyId: string; vehicleId: string; from: string; to: string; fromMin: number; toMin: number; mode: OfferMode; freePallets: number; freeKg: number;
  maxDetourKm: number; maxDetourMin: number; toleranceMin: number; status: "ACTIVE" | "MATCHED" | "EXPIRED" | "WITHDRAWN"; version: number;
  adjustments: { reason: "SHRUNK" | "CONSUMED_BY_OWN_COMMITMENT"; oldFreePallets: number; newFreePallets: number }[];
}
// The free space of a truck in a window, computed from what it has already promised (the form prefills from it).
export interface FreeSpaceVM { vehicleId: string; capacityPallets: number; capacityKg: number; freePallets: number; freeKg: number; commitments: number }
export interface OfferVM {
  offerId: string; loadId: string; companyId: string; lane: string; originId: string; destinationId: string; pallets: number; tempClass: TempClass; detourKm: number; extraMin: number;
  earningsEstimate: number; tempFit: boolean; isBackhaul: boolean; expiresInSec: number; status: OfferStatus; version: number;
}
export interface KpiVM { modeledSurplus: number; operatingCost: number; emptyKm: number; co2Kg: number; unserved: number; avgSlackMin: number; deltaVsBaseline: { surplus: number; emptyKm: number; co2Kg: number } }
export interface KpiTrendVM { surplus: number[]; cost: number[]; emptyKm: number[]; co2Kg: number[] }
export interface StateVM { kpiTrend: KpiTrendVM; epoch: number; worldHash: string; queue: LoadVM[]; loads: LoadVM[]; offers: OfferVM[]; capacityPosts: CapacityPostVM[]; capacityOffers: CapacityOfferVM[]; vehicles: VehicleVM[]; kpis: KpiVM; nowMin: number }

export interface ReasonVM { code: string; params?: Record<string, number | string> }
export interface OptionRowVM {
  optionId: string; rank: number; vehicleId: string; carrierId: string; extraKm: number; extraCost: number; co2: number; utilDelta: number; slackMin: number;
  isBackhaul: boolean; quote: number; scoreParts: { cost: number; emptyKm: number; co2: number };
}
export interface ExcludedVM { vehicleId: string; codes: string[] }
export interface OptionsVM { decision: "RECOMMEND" | "NO_FEASIBLE_OPTION"; recommendedId: string | null; rows: OptionRowVM[]; excluded: ExcludedVM[]; reasons: ReasonVM[]; loadVersion: number }

export interface ApprovalPreviewVM { candidateId: string; loadId: string; option: OptionRowVM; before: KpiVM; after: KpiVM }
export interface ApplyResult { status: "APPLIED" | "CONFLICT" | "STALE_EPOCH" | "ALREADY_APPLIED" | "REJECTED"; offerId?: string }

export interface ChangeVM { loadId: string; fromVehicle: string | null; toVehicle: string; deltaCost: number; reasons: string[] }
export interface PlanDiffVM { candidateId: string; before: KpiVM; after: KpiVM; changes: ChangeVM[]; lockedKept: number }
export type JobStatus = "RUNNING" | "COMPLETE" | "TIME_LIMIT" | "FLOOR_INFEASIBLE" | "VERIFICATION_REJECTED" | "NO_SOLUTION" | "CANCELLED" | "ERROR";
export interface JobVM { jobId: string; status: JobStatus; progress: number; diff: PlanDiffVM | null; blockingCarriers: string[] }

export interface ScenarioColumnVM { id: "A" | "A2" | "B" | "C"; surplus: number; emptyKm: number; co2Kg: number; cost: number }
export interface CarrierOutcomeVM { carrierId: string; deltaVsA: number }
export interface ScenarioVM { columns: ScenarioColumnVM[]; effects: { sharing: number; optimization: number; ownFleet: number; sharingBeyondOwn: number }; perCarrier: CarrierOutcomeVM[]; assumptionRefs: string[] }
export interface ParticipationPointVM { ratePct: number; emptyKm: { mean: number; lo: number; hi: number }; cost: { mean: number; lo: number; hi: number } }
export interface SensitivityRowVM { code: "SHARING_LOWERS_EMPTY_KM" | "OPTIMIZATION_ADDS_VALUE" | "ALL_CARRIERS_GAIN" | "STABLE_UNDER_TAKE_RATE" | "COLD_CHAIN_PREMIUM_HOLDS"; holds: boolean; threshold: number }
export interface AssumptionVM { key: string; label: string; value: string; kind: "ASSUMPTION" | "SOURCED"; source?: string }
export interface PriceTableVM { version: number; perKm: { DRY_VAN: number; REEFER_SINGLE: number; REEFER_DUAL: number }; perMinDriver: number; fixedPerVehicle: number; takeRate: number; referralRate: number; borderFee: number; errorCodes: string[] }

// ---- price estimate shown before a shipper books (from the rate card in the real backend)
export interface QuoteEstimateVM { price: number; sharedPrice: number; exclusive: boolean; distanceKm: number; driveMin: number; lines: { code: "BASE" | "DISTANCE" | "BORDER" | "HAZARD" | "DEDICATED"; amount: number }[] }

// ---- map replay (view-model contract, MapVM): geometry of the road network and the timed trips of the committed plan
export interface Geometry {
  nodes: { id: string; name: string; lat: number; lon: number; country: string }[]; pairs: Record<string, string>;
  dist_km: number[][]; time_min: number[][]; attribution: string;
}
export interface Segment { t0: number; t1: number; kind: "travel" | "dwell"; from: number; to: number; loaded: boolean; loadId: string | null; temp: TempClass | null; km: number }
export interface TrajectoryVM {
  planLabel: string; startMin: number; endMin: number;
  vehicles: { vehicleId: string; carrierId: string; homeNode: number; segments: Segment[]; km: number }[];
  events: { t: number; vehicleId: string; kind: "pickup" | "drop"; node: number; loadId: string }[];
}

// ---- the live session (backend contract): opportunities shown to one carrier, answered by that carrier, the backend decides what happens
export interface SessionOpportunityVM {
  opportunity_id: string; load_id: string; vehicle_id: string; offer_id: string; origin: string; destination: string; pallets: number; weight_kg: number; temp_class: TempClass; exclusive: boolean;
  payout: number; marginal_cost: number; net_incremental: number; detour_km: number; detour_min: number; delay_max_min: number; delay_imposed: { commitment_id: string; stop_index: number; minutes: number }[];
  recommended: boolean; reasons: string[]; pickup_min: number; drop_min: number; shown_at: number; expires_at: number; status: string; epoch: number; offer_version: number; vehicle_version: number; delivered: boolean;
}
export interface SessionStateVM { now_min: number; epoch: number; carrier_id: string; pending: SessionOpportunityVM[]; taken: SessionOpportunityVM[]; declined: number; realised: { amount: number; delivered: number; on_road: number } }
export type ResponseStatus = "ACCEPTED" | "DECLINED_RELEASED" | "STALE_OFFER" | "OFFER_EXPIRED" | "OFFER_NOT_FOUND" | "STALE_EPOCH" | "ALREADY_RESPONDED";
export interface SessionResponseVM { result: { status: ResponseStatus; opportunity_id: string; load_id: string | null; new_load_status: string | null; reason: string | null; released: boolean }; now_min: number }

