import { describe, expect, it } from "vitest";
import { pickProject, scoreArchiveFile } from "@/lib/archive/match";
import { anyDate, leadingDate, minutesBetween, parse123Form, parseClientFolder, parseFileName, parseJotform, splitCredentials, type ParsedName } from "@/lib/archive/parse";

// F16 Report archive: names, folders, the two form layouts and the credentials split (SPEC §9.1 F16).

describe("file names", () => {
  it("reads date, job, visit type and technicians", () => {
    expect(parseFileName("2020-03-20 - Continuum 3707_Service Call_Roberto_Rodolfo.pdf")).toEqual({ date: "2020-03-20", job: "Continuum 3707", visitType: "Service Call", technicians: ["Roberto", "Rodolfo"], variant: null, ext: "pdf" });
    expect(parseFileName("May 24th, 2018 - Seven Bridges 16202_Survey Report_Fred.pdf").date).toBe("2018-05-24");
    expect(parseFileName("10-07-25 Acta II_Service Call_Rodolfo_Jeferson.pdf")).toMatchObject({ date: "2025-10-07", job: "Acta II", technicians: ["Rodolfo", "Jeferson"] });
    expect(parseFileName("05-17-2024 - Pine-tree-4721_Service Call_Roberto_Richard.pdf")).toMatchObject({ date: "2024-05-17", job: "Pine-tree-4721" });
  });
  it("keeps variants and jobs with underscores, and drops repeated names", () => {
    expect(parseFileName("2019-04-02 - Oceana 1101N_Service Call_Carlos_Roberto_Rodolfo_Ulisses (1).pdf")).toMatchObject({ variant: "(1)", technicians: ["Carlos", "Roberto", "Rodolfo", "Ulisses"] });
    expect(parseFileName("2022-02-22 - One Island 2902_Service Call_Fabio_Felipe_Saulo_a.pdf")).toMatchObject({ variant: "_a", technicians: ["Fabio", "Felipe", "Saulo"] });
    expect(parseFileName("2021-09-14 - Alon Alexander_Shlomy Son_Service Call_Fabio_Lucas_Roberto_Fabio.pdf")).toMatchObject({ job: "Alon Alexander Shlomy Son", technicians: ["Fabio", "Lucas", "Roberto"] });
    expect(parseFileName("IMG_2231.jpg")).toMatchObject({ date: null, job: "IMG", technicians: [], ext: "jpg" });
  });
  it("reads dates in text", () => {
    expect(leadingDate("3/20/2020 notes").date).toBe("2020-03-20");
    expect(anyDate("Date 03/20/2020")).toBe("2020-03-20");
    expect(anyDate("March 2nd, 2018 – Ulisses / Roberto")).toBe("2018-03-02");
    expect(anyDate("nothing here")).toBeNull();
  });
});

describe("client folders", () => {
  it("turns LAST, FIRST - PLACE # UNIT into a client, a place and a unit", () => {
    expect(parseClientFolder("SILVER, MELISSA - CONTINUUM # 3707")).toEqual({ raw: "SILVER, MELISSA - CONTINUUM # 3707", client: "Melissa Silver", place: "Continuum # 3707", unit: "3707", number: null });
    expect(parseClientFolder("MANTEL, VALERIA - WESTON - 00195")).toMatchObject({ client: "Valeria Mantel", place: "Weston", number: "00195" });
    expect(parseClientFolder("2520 SHELTER AVE")).toMatchObject({ client: "2520 Shelter Ave", place: null, unit: null });
    expect(parseClientFolder("SPENCER RESIDENCE - ONE ISLAND PLACE  #2902")).toMatchObject({ client: "Spencer Residence", unit: "2902" });
  });
});

describe("form layouts", () => {
  it("reads a 123FormBuilder table", () => {
    const text = "Client Name Continuum 3707\nAddress auto\nUnited States\nDate 03/20/2020\nCheck-in 09:30\nCheck-out 04:00\nTeam-Roberto yes\nTeam-Rodolfo yes\nService performed / annotations Os detalhes dos serviços estão em um vídeo enviado para o escritório\nPictures https://www.123formbuilder.com/x\nThe message has been sent from 66.229.161.86\nEntry ID: 1054";
    const r = parse123Form(text)!;
    expect(r.layout).toBe("123formbuilder");
    expect(r.client).toBe("Continuum 3707");
    expect(r.date).toBe("2020-03-20");
    expect(r.checkIn).toBe("09:30");
    expect(r.checkOut).toBe("16:00");
    expect(r.technicians).toEqual(["Roberto", "Rodolfo"]);
    expect(r.report).toBe("Os detalhes dos serviços estão em um vídeo enviado para o escritório");
    expect(r.entryId).toBe("1054");
  });
  it("reads a JotForm job report", () => {
    const text = "SERVICE CALL / JOB REPORT\nCLIENT / JOB NAME 2520\nHOUSE NUMBER / UNIT / BUILDING 2520\nDATE 05/01/2023\nCHECK-IN 9:30 AM\nCHECK-OUT 4:10 PM\nTEAM ANTONIO FERNANDO JEFFERSON LEO\nROBERTO SAULO\nJOB PERFORMED BED1\nTv bed1 para rack\nCable coax J1\n1\nDID YOU RECEIVE ANY PAYMENTS ? NO\nPICTURES AND VIDEOS";
    const r = parseJotform(text)!;
    expect(r.layout).toBe("jotform");
    expect(r.client).toBe("2520 2520");
    expect(r.date).toBe("2023-05-01");
    expect(r.checkIn).toBe("09:30");
    expect(r.checkOut).toBe("16:10");
    expect(r.technicians).toEqual(["Antonio", "Fernando", "Jefferson", "Leo", "Roberto", "Saulo"]);
    expect(r.report).toBe("BED1\nTv bed1 para rack\nCable coax J1");
    expect(r.payments).toBe("NO");
    expect(parse123Form(text)).toBeNull();
  });
});

describe("credentials", () => {
  it("moves passwords, network names and addresses out of the report", () => {
    const { report, credentials } = splitCredentials("Rede Camara\nSenha 903903903\n\nPyng ip 192.168.2.110\n\nTiramos o processador que tinha la no painel\n\nRack instalado");
    expect(credentials).toBe("Rede Camara\nSenha 903903903\nPyng ip 192.168.2.110");
    expect(report).toBe("Tiramos o processador que tinha la no painel\n\nRack instalado");
    expect(splitCredentials("Installed 2 TVs").credentials).toBeNull();
  });
  it("measures the visit", () => {
    expect(minutesBetween("09:30", "16:00")).toBe(390);
    expect(minutesBetween("09:30", null)).toBeNull();
    expect(minutesBetween("16:00", "09:30")).toBeNull();
  });
});

describe("project matching", () => {
  const projects = [
    { id: 1, title: "845 Chaparral - Aspen", street: "845 Chaparral Dr", city: "Aspen", zip: null, unit: null, owner: null, createdAt: null },
    { id: 2, title: "Acta I - Miami", street: null, city: "Miami", zip: null, unit: null, owner: "Acta Development", createdAt: null },
    { id: 3, title: "Acta II - Miami", street: null, city: "Miami", zip: null, unit: null, owner: "Acta Development", createdAt: null },
    { id: 4, title: "John Rutherford - Apogee #1402", street: "800 S Pointe Dr", city: "Miami Beach", zip: null, unit: "1402", owner: "John Rutherford", createdAt: null },
    // "Miami" is in many titles, so it weighs little, as in the real catalogue.
    ...["Gonzalez", "Perez", "Silva", "Costa", "Lima", "Souza", "Rocha"].map((n, i) => ({ id: 10 + i, title: `${n} Residence - Miami`, street: null, city: "Miami", zip: null, unit: null, owner: n, createdAt: null })),
  ];
  const name = (job: string | null): ParsedName => ({ date: "2020-03-20", job, visitType: "Service Call", technicians: ["Roberto"], variant: null, ext: "pdf" });

  it("keeps the client folder in the score, so a folder named like the project matches", () => {
    const scores = scoreArchiveFile(parseClientFolder("845 CHAPARRAL - ASPEN"), name("Chaparral"), projects);
    expect(scores[0]).toMatchObject({ id: 1 });
    expect(scores[0].score).toBeGreaterThanOrEqual(85);
    expect(pickProject(scores)).toBe(1);
  });

  it("tells Acta I from Acta II by the number", () => {
    const one = scoreArchiveFile(parseClientFolder("#ACTA 1"), name("Acta 1"), projects);
    expect(pickProject(one)).toBe(2);
    const two = scoreArchiveFile(parseClientFolder("ACTA II"), name("Acta II"), projects);
    expect(pickProject(two)).toBe(3);
  });

  it("does not pick a project on a shared unit number alone", () => {
    const scores = scoreArchiveFile(parseClientFolder("ABRAHAO, MARCO - ST REGIS #1402"), name("St Regis 1402"), projects);
    expect(pickProject(scores)).toBeNull();
  });
});
