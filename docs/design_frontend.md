# Design: front end and in-browser mock backend

**Service:** ShareLah demo (React 18, TypeScript, Vite, Ant Design 5, TanStack Query, Leaflet, MSW, i18next, Vitest)
**Companion:** [design_optimization.md](design_optimization.md)

---

## 1. Principles

1. **Contract first.** View models and API payloads (`frontend/src/api/types.ts`) are defined before the screens that use them; screens render what the contract gives them and recompute nothing.
2. **One world, three roles.** Shipper, carrier and operator see the same world; each sees only its own part (a carrier its company, a shipper its cargo, the operator everything).
3. **Money first, and honest.** Realised earnings are shown apart from the estimate; the detour cost is part of every figure; currency is a property of the data.
4. **The mock sits behind the contract of a real backend.** A service worker answers the API calls in the browser, so the demo and a real backend can be swapped without touching a screen.
5. **Text lives in language files** (English and 中文); the API returns codes and parameters, never sentences.
6. **Each person only acts on what is current.** Taking an offer is checked against the version of the offer and of the truck's route.

## 2. Screens and flows

| Role | Screens | Main interactions |
|---|---|---|
| Shipper | home, new request, history, map | choose a shared or a dedicated truck (the price changes at once and the difference is named); follow a shipment from *received* to *done* |
| Carrier | home, opportunities, share capacity, settings, map | take or decline an opportunity (earn, detour, effect on own deliveries); choose which trucks join the pool and for how long |
| Operator | control tower, analysis, simulation | see the whole network and four scenarios; approve a load to a truck; play the recorded month |

## 3. Contracts the screens depend on

| Contract | Purpose |
|---|---|
| `StateVM` | queue, loads, offers, capacity posts and offers, vehicles, KPIs, a world hash and an epoch |
| `OptionsVM` | options for one load: `RECOMMEND` or `NO_FEASIBLE_OPTION`, rows, excluded vehicles with reason codes, reasons as `{code, params}` |
| `ApplyResult` | `APPLIED`, `CONFLICT`, `STALE_EPOCH`, `ALREADY_APPLIED`, `REJECTED` — a stale answer is refused, never merged |
| `JobVM` | long work as a job: `RUNNING`, `COMPLETE`, `TIME_LIMIT`, `FLOOR_INFEASIBLE`, `VERIFICATION_REJECTED`, `NO_SOLUTION`, `CANCELLED`, `ERROR` |
| `OfferStatus` | `SHOWN`, `ACCEPTED`, `DECLINED`, `EXPIRED`, `STALE` |
| Recorded simulation | one file with the world, per-day results for both scenarios, cumulative curves and totals per carrier |

## 4. Structure of the code

```
frontend/src/
  api/        typed client and the view-model types
  pages/      shipper, carrier, operator and simulation screens
  components/ maps (live, replay, role), charts, inputs
  mocks/      in-browser backend: world, offers, prices, approval, decline
  lib/        replay of the recorded month, alerts and sounds, polylines
  i18n/       English and Chinese texts
  data/       places, companies, theme, access rules
```

## 5. Alerts

A new order for a carrier rings and pops up; a shipper hears when a request is sent and when a carrier accepts; one switch mutes everything. Alert rules are plain functions with their own tests.

## 6. Tests

| Area | What is checked |
|---|---|
| Offers (`mocks/offers.test.ts`) | free-space arithmetic, offers only when feasible and profitable, prices, declined loads |
| World (`mocks/world.test.ts`) | the mock world obeys the contract |
| Recorded month (`lib/sim.test.ts`) | replay arithmetic, snapshots, cumulative curves |
| Alerts (`lib/alerts.test.ts`) | who is alerted, when |
| Places and names (`data/places.test.ts`) | real place names everywhere |
| Texts (`i18n/i18n.test.ts`) | every key exists in both languages |

## 7. Task list and implementation status

| Task | Area | File / location | Status |
|---|---|---|---|
| T1 | View-model and API types | `src/api/types.ts` | ✅ done |
| T2 | In-browser mock backend (offers, prices, approval, decline) | `src/mocks/` | ✅ done |
| T3 | Shipper screens (shared vs dedicated price, tracking) | `src/pages/ShipperHome.tsx` | ✅ done |
| T4 | Carrier screens (opportunities, share capacity) | `src/pages/CarrierHome.tsx`, `Opportunities.tsx`, `ShareCapacity.tsx` | ✅ done |
| T5 | Operator screens (control tower, scenarios, approval) | `src/pages/ControlTowerPage.tsx`, `AnalysisPage.tsx` | ✅ done |
| T6 | Recorded simulated month with map, snapshots, cumulative curve | `src/pages/SimulationPage.tsx`, `src/lib/replay.ts`, `public/demo/simulation.json` | ✅ done |
| T7 | Alerts with sound | `src/lib/alerts.ts`, `src/app/useRoleAlerts.ts` | ✅ done |
| T8 | English and Chinese, phone layout | `src/i18n/`, `src/layouts/` | ✅ done |
| T9 | Unit tests for the contracts and the data layer | `*.test.ts` | ✅ done |
| T10 | Optimisation backend, live runs | — | ⬜ not built (not in this repository) |
| T11 | Real accounts and a database | — | ⬜ not built |
