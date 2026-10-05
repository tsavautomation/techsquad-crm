// People who get a login (SPEC §7.1, §9.1 P1-d, P1-e). What each may do is in user-permissions.ts.
// employeeId ties the login to the Employee record (users:sync sets that record's email to the login).
// Not invited: Mike Meyer; freelance and inactive employees. WebAuthor Support is dropped.

export type SeedUser = { email: string; firstName: string; lastName: string; employeeId?: number };

export const USERS: SeedUser[] = [
  // Office
  { email: "fred@tsav.net", firstName: "Fred", lastName: "Smiliansky", employeeId: 1000 },
  { email: "karina@tsav.net", firstName: "Karina", lastName: "Smiliansky" },
  { email: "jessica@tsav.net", firstName: "Jessica", lastName: "Villegas", employeeId: 1004 },
  { email: "luana@tsav.net", firstName: "Luana", lastName: "Freitas", employeeId: 1005 },
  { email: "saulo@tsav.net", firstName: "Saulo", lastName: "Da Silva", employeeId: 1012 },
  { email: "lucas@tsav.net", firstName: "Lucas", lastName: "Oliveira", employeeId: 1006 },
  // Technicians (Fred 2026-10-04: every Active / Reports employee, firstname@tsav.net)
  { email: "roberto@tsav.net", firstName: "Roberto", lastName: "Pizini", employeeId: 1011 },
  { email: "rodolfo@tsav.net", firstName: "Rodolfo", lastName: "Oliveira", employeeId: 1003 },
  { email: "carlos@tsav.net", firstName: "Carlos", lastName: "Gurgel", employeeId: 1002 },
  { email: "daniel@tsav.net", firstName: "Daniel", lastName: "Sousa", employeeId: 1017 },
  { email: "fabio@tsav.net", firstName: "Fabio", lastName: "Inkratas", employeeId: 1023 },
  { email: "hugo@tsav.net", firstName: "Hugo", lastName: "Gomes", employeeId: 1021 },
  { email: "jeferson@tsav.net", firstName: "Jeferson", lastName: "Medeiros", employeeId: 1008 },
  { email: "joao@tsav.net", firstName: "Joao Paulo", lastName: "Amaral", employeeId: 1019 },
  { email: "kleider@tsav.net", firstName: "Kleider", lastName: "Loregian Junior", employeeId: 1028 },
  { email: "marcelo@tsav.net", firstName: "Marcelo", lastName: "Opazo", employeeId: 1009 },
  { email: "quintana@tsav.net", firstName: "Rodolfo", lastName: "Quintana", employeeId: 1018 },
  // Test login
  { email: "info@tsav.net", firstName: "Technician", lastName: "Test" },
];
