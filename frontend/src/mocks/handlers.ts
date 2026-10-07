import { delay, http, HttpResponse } from "msw";
import type { PriceTableVM, Profile } from "../api/types";
import { MockRejection, MockWorld } from "./world";

export function createHandlers(baseUrl: string, world = new MockWorld(), latencyMs = 120) {
  const u = (p: string) => `${baseUrl}${p}`;
  const ok = async <T,>(body: T) => { await delay(latencyMs); return HttpResponse.json(body as never); };
  // a coded refusal of the backend (HTTP 422 with the code), the way the screens map it to a field message
  const guarded = async <T,>(f: () => T) => { try { return await ok(f()); } catch (e) { if (e instanceof MockRejection) { await delay(latencyMs); return HttpResponse.json({ code: e.code }, { status: 422 }); } throw e; } };
  return [
    http.get(u("/api/state"), () => ok(world.state())),
    http.post(u("/api/loads"), async ({ request }) => ok(world.postLoad((await request.json()) as never))),
    http.post(u("/api/capacity-offers"), async ({ request }) => { const b = (await request.json()) as never; return guarded(() => world.postOffer(b)); }),
    http.delete(u("/api/capacity-offers/:id"), ({ params }) => guarded(() => world.withdrawOffer(String(params.id)))),
    http.get(u("/api/vehicles/:id/free-space"), ({ params, request }) => { const p = new URL(request.url).searchParams; return guarded(() => world.freeSpace(String(params.id), Number(p.get("from")), Number(p.get("to")))); }),
    http.post(u("/api/capacity-posts"), async ({ request }) => ok(world.postCapacity((await request.json()) as never))),
    http.get(u("/api/loads/:id/options"), ({ params, request }) => ok(world.options(String(params.id), (new URL(request.url).searchParams.get("profile") ?? "BALANCED") as Profile))),
    http.post(u("/api/loads/:id/approve"), async ({ params, request }) => {
      const b = (await request.json()) as { optionId: string; epoch: number; expectedVersion: number; mode: "preview" | "apply" };
      return ok(world.approve(String(params.id), b.optionId, b.mode, b.epoch, b.expectedVersion));
    }),
    http.post(u("/api/events/urgent"), () => ok(world.urgent())),
    http.post(u("/api/optimize/preview"), async ({ request }) => ok(world.startJob(Boolean(((await request.json()) as { floor: boolean }).floor)))),
    http.get(u("/api/optimize/jobs/:id"), ({ params }) => ok(world.job(String(params.id)))),
    http.delete(u("/api/optimize/jobs/:id"), ({ params }) => ok(world.cancelJob(String(params.id)))),
    http.post(u("/api/optimize/apply"), async ({ request }) => { const b = (await request.json()) as { candidateId: string; epoch: number }; return ok(world.applyJob(b.candidateId, b.epoch)); }),
    http.post(u("/api/offers/:id/response"), async ({ params, request }) => { const b = (await request.json()) as { response: "ACCEPT" | "DECLINE"; expectedVersion: number; epoch: number }; return ok(world.respond(String(params.id), b.response, b.expectedVersion, b.epoch)); }),
    http.get(u("/api/trajectories"), async ({ request }) => { const g = await (await fetch("/network_geometry.json")).json(); return ok(world.trajectories(g, new URL(request.url).searchParams.get("companyId") ?? "OP")); }),
    http.get(u("/api/quote-estimate"), async ({ request }) => { const g = await (await fetch("/network_geometry.json")).json(); const p = new URL(request.url).searchParams; return ok(world.estimate(g, { origin: p.get("origin") ?? "", destination: p.get("destination") ?? "", pallets: Number(p.get("pallets") ?? 1), tempClass: p.get("tempClass") ?? "AMB", hazardClass: p.get("hazardClass") || null, exclusive: p.get("exclusive") === "true" })); }),
    http.put(u("/api/vehicles/:id/sharing"), async ({ params, request }) => ok(world.setShared(String(params.id), Boolean(((await request.json()) as { shared: boolean }).shared)))),
    http.get(u("/api/analysis/scenarios"), () => ok(world.scenarios())),
    http.get(u("/api/analysis/participation"), () => ok(world.participation())),
    http.get(u("/api/analysis/sensitivity"), () => ok(world.sensitivity())),
    http.get(u("/api/assumptions"), () => ok(world.assumptions())),
    http.get(u("/api/price-table"), () => ok(world.price)),
    http.put(u("/api/price-table"), async ({ request }) => ok(world.putPrice((await request.json()) as PriceTableVM))),
    http.post(u("/api/reset"), () => ok({ epoch: world.reset() })),
  ];
}
