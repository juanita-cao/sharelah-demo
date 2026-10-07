import type { Company } from "../api/types";

// Fictional demo companies (the demo principle: nothing here is a real firm).
export const COMPANIES: Company[] = [
  { id: "OP", name: "InnerDrive Studio (Platform)", kind: "OPERATOR" },
  { id: "S-1", name: "Lion City Fresh", kind: "SHIPPER" }, { id: "S-2", name: "Straits Pharma Supply", kind: "SHIPPER" }, { id: "S-3", name: "Malacca Foods", kind: "SHIPPER" },
  { id: "C-1", name: "Merlion Haulage", kind: "CARRIER" }, { id: "C-2", name: "Causeway Cold Chain", kind: "CARRIER" }, { id: "C-3", name: "Johor Link Transport", kind: "CARRIER" },
  { id: "C-4", name: "Peninsular Freight", kind: "CARRIER" },
];
