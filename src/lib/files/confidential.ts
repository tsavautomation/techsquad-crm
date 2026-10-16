import { REGISTRY } from "@/registry";

// Tables that never go to OneDrive in any form (SPEC §9.1 OD-e): record tables marked `privateFiles` in the
// registry (Staff Performance, Payroll, Transactions) plus their helper tables. OneDrive is open to everyone at
// Tech Squad; these are permission-protected in the CRM, so no PDF copy, no upload, no backup file of them.
export const CONFIDENTIAL_EXTRA = ["employee_pay_rates"] as const;

export function confidentialTables(): Set<string> {
  return new Set([...REGISTRY.filter((t) => t.privateFiles).map((t) => t.name), ...CONFIDENTIAL_EXTRA]);
}
