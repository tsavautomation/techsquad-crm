// People who get a login in Phase 1, with their WebAuthor group memberships (SPEC §7.1).
// Not invited yet (by decision 2026-09-25): Carlos Gurgel, Mike Meyer. WebAuthor Support is dropped.
// "everyone" is implicit and never listed.

export type SeedUser = { email: string; firstName: string; lastName: string; groups: string[] };

export const USERS: SeedUser[] = [
  {
    email: "fred@tsav.net",
    firstName: "Fred",
    lastName: "Smiliansky",
    groups: ["system_administrators", "admin", "treasurer", "electrical_department", "lv_department"],
  },
  { email: "jessica@tsav.net", firstName: "Jessica", lastName: "Villegas", groups: ["admin", "office_management"] },
  {
    email: "luana@tsav.net",
    firstName: "Luana",
    lastName: "Freitas",
    groups: ["accounting", "office_management", "electrical_department"],
  },
  { email: "roberto@techsquadfl.com", firstName: "Roberto", lastName: "Pizini", groups: ["office_management"] },
  { email: "saulo@tsav.net", firstName: "Saulo", lastName: "Da Silva", groups: ["coo", "electrical_department"] },
  { email: "uli@tsav.net", firstName: "Ulisses", lastName: "Dias", groups: ["coo", "electrical_department"] },
  { email: "lucas@tsav.net", firstName: "Lucas", lastName: "Oliveira", groups: ["project_manager"] },
  {
    email: "karina@tsav.net",
    firstName: "Karina",
    lastName: "Smiliansky",
    groups: ["treasurer", "electrical_department", "lv_department"],
  },
  { email: "info@tsav.net", firstName: "Technician", lastName: "Test", groups: ["technician"] },
];
