import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { LoadVM } from "../api/types";
import { money } from "../components/common";
import { COMPANIES } from "../data/companies";
import { placeName } from "../data/places";
import { useSession } from "./contexts";
import { useStateQuery } from "./hooks";
import { useAnnouncer } from "./useAnnouncer";

// Watches the polled state and speaks up when something changes for the person who is signed in (and only for them):
// a carrier hears about each new order sent to it; a shipper hears when a carrier accepts, or cannot take, one of its loads.
// Loads that were already in a state when the page (or the role) opened are not announced; an order still waiting for a carrier's answer is, once.
const lastSeen = new Map<string, { status: Map<string, LoadVM["status"]>; offers: Set<string> }>();

export function useRoleAlerts() {
  const { t } = useTranslation();
  const { company } = useSession();
  const q = useStateQuery();
  const { announce } = useAnnouncer();

  useEffect(() => {
    const d = q.data; if (!d) return;
    const status = new Map(d.loads.filter((l) => l.companyId === company.id).map((l) => [l.loadId, l.status] as const));
    const offers = new Set(d.offers.filter((o) => o.companyId === company.id && o.status === "SHOWN").map((o) => o.offerId));
    const before = lastSeen.get(company.id) ?? null;     // what this company last saw, also from before the person switched to another role
    lastSeen.set(company.id, { status, offers });
    if (company.kind === "CARRIER") {                                   // an order still waiting for an answer is announced once even if it came while this role was not open
      for (const o of d.offers) {
        if (o.companyId !== company.id || o.status !== "SHOWN" || before?.offers.has(o.offerId)) continue;
        announce("request", o.offerId, t("alert.newTitle"), t("alert.newText", { route: `${placeName(o.originId)} → ${placeName(o.destinationId)}`, pallets: o.pallets, amount: money(o.earningsEstimate) }));
      }
    }
    if (company.kind === "SHIPPER" && before) {
      for (const l of d.loads) {
        if (l.companyId !== company.id) continue;
        const was = before.status.get(l.loadId), carrier = COMPANIES.find((c) => c.id === d.vehicles.find((v) => v.vehicleId === l.vehicleId)?.carrierId)?.name ?? "";
        if (was && was !== "CONFIRMED" && was !== "IN_TRANSIT" && was !== "DONE" && l.status === "CONFIRMED") announce("accepted", `${l.loadId}:${d.epoch}:${l.vehicleId}`, t("alert.acceptedTitle"), t("alert.acceptedText", { id: l.loadId, carrier }));
        if (was === "MATCHED" && l.status === "RECEIVED") announce("declined", `${l.loadId}:${Date.now()}`, t("alert.declinedTitle"), t("alert.declinedText", { id: l.loadId }));
      }
    }
  }, [q.data, company.id, company.kind]);   // eslint-disable-line react-hooks/exhaustive-deps
}
