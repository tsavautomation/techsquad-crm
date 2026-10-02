// People who get a login in Phase 1 (SPEC §7.1). What each may do is in user-permissions.ts.
// Not invited yet (by decision 2026-09-25): Carlos Gurgel, Mike Meyer. WebAuthor Support is dropped.

export type SeedUser = { email: string; firstName: string; lastName: string };

export const USERS: SeedUser[] = [
  { email: "fred@tsav.net", firstName: "Fred", lastName: "Smiliansky" },
  { email: "jessica@tsav.net", firstName: "Jessica", lastName: "Villegas" },
  { email: "luana@tsav.net", firstName: "Luana", lastName: "Freitas" },
  { email: "roberto@techsquadfl.com", firstName: "Roberto", lastName: "Pizini" },
  { email: "saulo@tsav.net", firstName: "Saulo", lastName: "Da Silva" },
  { email: "uli@tsav.net", firstName: "Ulisses", lastName: "Dias" },
  { email: "lucas@tsav.net", firstName: "Lucas", lastName: "Oliveira" },
  { email: "karina@tsav.net", firstName: "Karina", lastName: "Smiliansky" },
  { email: "info@tsav.net", firstName: "Technician", lastName: "Test" },
];
