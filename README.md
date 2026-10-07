# ShareLah — shared freight demo

ShareLah is a demo of a shared freight platform for Singapore and Peninsular Malaysia. Carriers keep control of their own deliveries and **share only the spare capacity** of their trucks;
the platform finds loads from other shippers that fit around each carrier's own jobs, shows what each one would add to the carrier's pocket, and never moves a promise the carrier has made
to its own customers.

**This is a demo with fictional data.** The carriers, shippers, loads, prices and costs are generated from stated assumptions; nothing here is real company data. Roads and distances use
OpenStreetMap data (© OpenStreetMap contributors, ODbL).

## What this demonstrates

- **Simulated earnings** — a recorded simulated month of the same demand run twice, once without the platform and once with carriers sharing spare capacity: extra money earned per carrier
  (realised, after the platform fee and the cost of the detour), loads served, a cumulative curve, daily snapshots, and a map where the trucks move along real roads. A carrier sees only
  its own company; the platform operator sees every carrier.
- **Carrier workspace** — share spare capacity (first *whole truck free* or *only part of the truck free*, then the values, prefilled from what is really free), and review opportunities
  with the net earnings, the cost of the detour, the effect on the carrier's own deliveries and a take / decline decision.
- **Shipper workspace** — book a *shared* or a *dedicated* truck; the price changes at once and the difference is named.
- **Control Tower and analysis** — the operator's view of the whole network and of the effect of sharing.

## Engineering Approach

This project uses a contract-first workflow:

1. Define the data contracts (view models and API payloads) before the screens that use them.
2. Keep the UI layer separate from the data and decision logic through a ViewModel-style interface; the screens render what the contract gives them.
3. Preserve the raw simulation output (a recorded run) so every figure on the screen can be reproduced and checked.
4. Use explicit rules before showing anything as decision support: a shared load is never offered if it would break a promise to the carrier's own customers.
5. Keep the mock backend behind the same contract as a real one, so the demo and a real backend can be swapped without touching the screens.
6. Test the contracts the screens rely on (free space, offers, prices, axis labels, names) and the data layer, not only the rendering.

## How this static demo works

There is no server behind this site. A mock backend runs in the browser (a service worker answers the API calls), and the simulation data is a recorded file (`public/demo/simulation.json`).
The optimisation backend that produced the recording is not part of this repository, so live runs and real acceptance of opportunities are switched off in this build.

## Run locally

```bash
cd frontend
npm ci
npm run dev:mock        # development with the mock backend
npm test                # unit tests
npm run build:demo      # the static demo build (dist/)
```

## Deploy

`render.yaml` describes a Render static site (build `npm ci && npm run build:demo`, publish `dist`, single-page rewrite).

## Stack

React 18, TypeScript, Vite, Ant Design 5, TanStack Query, Leaflet with OpenStreetMap tiles, MSW (mock service worker), i18next (English and Chinese), Vitest.
