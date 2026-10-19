# Design: shared-capacity decision model and method-selection plan

**Service:** ShareLah (shared freight demo; fictional carriers, shippers, loads, prices and costs; money in SGD)
**What this repository contains:** the front end, an in-browser mock backend and one recorded simulated month. The optimisation engine that produced the recorded month is **not** part of this repository; this document specifies the decision model the demo presents, so every number on screen can be traced to a definition.
**Companion:** [design_frontend.md](design_frontend.md)

---

## 1. Problem and scope

A carrier serves its own customers first. Its trucks usually have spare capacity (a whole truck free for a period, or free pallets on a route). A platform collects loads posted by other shippers and offers each load to a carrier **only if** it fits around the carrier's own commitments and earns the carrier something.

| Question | Answer in this design |
|---|---|
| Who decides? | The carrier takes or declines each opportunity; the operator approves a load to a truck where the platform assigns it |
| What is optimised? | Three views of one objective: the carrier's earnings, the system's modelled surplus, and service of loads (feasible loads are always served first) |
| When? | Sequentially: loads keep arriving, so the problem is solved repeatedly on the current state (a rolling horizon), not once |
| What is never traded away? | Promises to a carrier's own customers (hard constraints), delivery windows, vehicle capability (temperature class, hazardous cargo) |

## 2. Problem classification

| Component | Problem type |
|---|---|
| Offer generation: which spare capacity can take which load | candidate evaluation and selection (top-K per load) |
| Assignment and sequencing of shared loads into truck routes | trade-off under constraints (coupled routes, capacity, windows) |
| Price of a shared versus a dedicated truck | pricing (one function of the load, identical in every scenario) |
| Sharing effect across carriers | scenario comparison |

## 3. Money flows (one definition of "earnings")

| Quantity | Definition |
|---|---|
| Payment of a served load | the price quoted to the shipper — one function of the load, identical in every scenario |
| Operating cost of a carrier | per-km and per-minute cost of its trucks, plus fixed cost counted on **owned** trucks |
| Platform take | applies only to loads served by a carrier other than the load's home carrier |
| Carrier payout | own-customer load: the full payment; cross-carrier load: payment less the platform take |
| Estimated earnings of an offer | payout for the load − marginal cost of the option (this is what the carrier sees as "you earn", with the detour shown separately) |
| Realised earnings | counted only when the job has been delivered; shown apart from the estimate |
| Modelled system surplus | Σ payments − Σ operating costs; a metric of this synthetic model, **not** economic welfare |
| Unserved loads | earn no payment and carry no cost |

Guard rails: a truck that would earn nothing from a load is never offered it; the shipper's price equals the price the load is sold at; a stale answer to an offer (the offer or the route changed meanwhile) is refused rather than applied.

## 4. Methods and how they are chosen

One decision step (allocation of loads to routes) with interchangeable methods behind one interface. This is the **candidate set and the selection plan**; which candidates are built and measured is tracked in the project that produced the recorded month, not in this repository:

| Method | Class | Role |
|---|---|---|
| Nearest-feasible rule | engineering (rule) | baseline, used identically in "without platform" and "with sharing" |
| Regret insertion + local improvement | engineering | first production candidate |
| Route-pool set partitioning (MILP over generated routes) | engineering with an exact core | candidate |
| ALNS (destroy and repair, adaptive operators) | engineering | candidate for larger instances |
| Full MILP / CP | exact | **reference only** (a ruler on small slices, never a delivered method unless a trigger applies) |
| Column generation / branch-and-price | exact bound provider | built only if the best method's mean closure to the best-known bound is below a pre-registered threshold |

Selection is mechanical and written **before** any run (a pre-registered decision rule): every candidate must pass the same gates on every step of an instance ladder, quality is measured as closure to the best known value, tuning seeds are kept apart from evaluation seeds, and exact methods are first used to find the scale boundary on small slices. This repository records no candidate-versus-candidate result; it shows the recorded month only.

## 5. Independent verifier

Every plan, whichever method produced it, is re-played by one verifier that checks: assignment of each load, capacity and capability, windows, own-customer commitments, and the offer rules above. A day that fails verification stops a run with an error; the recorded month reports **zero** commitment violations.

## 6. The simulated month (what the demo plays)

- A period is a sequence of **independent days** (a seed per day): trucks start at their bases, offers are posted for the shift, loads arrive during the day, the day ends with a verified plan.
- **Two scenarios on the same demand.** *Without the platform*: each carrier serves only its own customers; loads a carrier cannot serve stay unserved. *With spare-capacity sharing*: own-customer orders are dispatched at once and may shrink or withdraw offers; shared loads fill the spare capacity.
- A shared job cancelled after acceptance disappears with its record and earns nothing; realised earnings count only delivered jobs.
- A job cannot start in the past: a plan that would start a pickup before the moment the job was accepted is rejected.
- The recorded month is stored as one file and replayed; the page also shows daily snapshots, a cumulative curve and trucks on real roads.

## 7. Limits

- All prices, volumes, take rates and costs are assumptions; the referral rate is zero by default only to make the winners-and-losers effect visible, not as a proposed commercial rule.
- The planning clock has no vehicle-progress tracker yet: events arrive in real-time order, but each planning call replays the day's timetable from the start of the shift.
- Regulatory rules (for example hazardous-cargo road rules) are demo assumptions, not a compliance claim.
- The optimisation engine, live runs, accounts and a database are not in this repository.
