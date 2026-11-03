import { describe, expect, it } from "vitest";
import { editDistance, matchContacts, matchProjects, normName, normPlace, normUnit, projectKey, proposedTitle, splitTitle, titleCase } from "@/lib/projects/dedupe";

// PJ-b: the normalisation behind "Possible duplicates", the save-time check and the standard names.

describe("PJ-b normalisation", () => {
  it("units: 1402 = 1402S = # 1402 S = Unit 1402", () => {
    expect(normUnit("#1402S")).toBe("1402s");
    expect(normUnit("# 1402 S")).toBe("1402s");
    expect(normUnit("Unit 1402")).toBe("1402");
    expect(normUnit("1402")).toBe("1402");
    expect(normUnit("")).toBe("");
  });
  it("places: St Regis = St. Regis = Saint Regis; JadeSignature = Jade Signature; Dr = Drive; Av = Ave = Avenue", () => {
    expect(normPlace("St Regis")).toBe(normPlace("St. Regis"));
    expect(normPlace("St Regis")).toBe(normPlace("Saint Regis"));
    expect(normPlace("JadeSignature")).toBe(normPlace("Jade Signature"));
    expect(normPlace("2687 Flamingo Dr")).toBe(normPlace("2687 Flamingo Drive"));
    expect(normPlace("9349 Collins Av")).toBe(normPlace("9349 Collins Ave"));
    expect(normPlace("9349 Collins Ave")).toBe(normPlace("9349 Collins Avenue"));
  });
  it("names: Sobrenome, Nome = Nome Sobrenome", () => {
    expect(normName("Abrahao, Marco")).toBe(normName("Marco Abrahao"));
    expect(normName("MARCO ABRAHAO")).toBe(normName("Marco Abrahão"));
  });
  it("splits a title into person, place and unit", () => {
    expect(splitTitle("Abrahao, Marco - St Regis #1402")).toEqual({ who: "Abrahao, Marco", place: "St Regis", unit: "1402" });
    expect(splitTitle("Tiffany Warehouse")).toEqual({ who: "Tiffany Warehouse", place: "", unit: "" });
  });
});

describe("PJ-b project pairs", () => {
  const marco = { id: 1, title: "MARCO ABRAHAO", first_name: "MARCO", last_name: "ABRAHAO" };
  const a = projectKey({ id: 1061, title: "Marco Abrahao - St Regis #1402S", job_owner_id: 1, job_address: { street: "9701 Collins Ave" }, apartment_or_unit: "1402S" }, marco, "St Regis");
  const b = projectKey({ id: 1372, title: "Abrahao, Marco - St Regis #1402", job_owner_id: 1, job_address: { street: "9701 Collins Ave" }, apartment_or_unit: "1402" }, marco, null);
  it("#1061 and #1372 are the same project", () => {
    expect(matchProjects(a, b)?.strong).toBe(true);
  });
  it("the building on one side meets the street on the other, different owner records, same person", () => {
    const jose = { id: 2, title: "JOSE ROBERTO AURIEMO", first_name: "JOSE ROBERTO", last_name: "AURIEMO" };
    const avant = { id: 3, title: "Avant Design Auriemo", first_name: "Avant Design", last_name: "Auriemo" };
    const x = projectKey({ id: 1026, title: "Jose Auriemo - Fendi 1101", job_owner_id: 2, job_address: { street: "9349 Collins Ave" }, apartment_or_unit: "1101" }, jose, "Fendi Chateau");
    const y = projectKey({ id: 1360, title: "Auriemo, Avant Design - Fendi Chateau #1101A", job_owner_id: 3, job_address: { street: "9349 Collins Avenue" }, apartment_or_unit: "1101A" }, avant, null);
    expect(matchProjects(x, y)).toEqual({ strong: true, why: "Same person, same building and unit" });
  });
  it("same owner at another address is only something to check", () => {
    const w = { id: 4, title: "RICHARD WAGNER", first_name: "RICHARD", last_name: "WAGNER" };
    const x = projectKey({ id: 1461, title: "Wagner, Richard", job_owner_id: 4, job_address: { street: "1451 Brickell Avenue" }, apartment_or_unit: "1601" }, w, null);
    const y = projectKey({ id: 1529, title: "Wagner, Richard - 700 Edgewater #2604", job_owner_id: 4, job_address: { street: "700 Northeast 26th Terrace" }, apartment_or_unit: "2604" }, w, null);
    expect(matchProjects(x, y)).toEqual({ strong: false, why: "Same owner, another address" });
  });
  it("different people in different buildings are nothing", () => {
    const x = projectKey({ id: 1, title: "A - Oceana #701S", job_owner_id: 5, job_address: { street: "10201 Collins Ave" }, apartment_or_unit: "701S" }, { id: 5, title: "P D", first_name: "P", last_name: "DOUKERIS" }, null);
    const y = projectKey({ id: 2, title: "B - Jade #2401", job_owner_id: 6, job_address: { street: "17141 Collins Ave" }, apartment_or_unit: "2401" }, { id: 6, title: "M D", first_name: "M", last_name: "DOUKERIS" }, null);
    expect(matchProjects(x, y)).toBeNull();
  });
});

describe("PJ-b contacts", () => {
  it("blocks the same e-mail, phone or name", () => {
    expect(matchContacts({ id: 1, title: "A", first_name: "A", last_name: "B", email: "X@Y.com" }, { id: 2, title: "C", first_name: "C", last_name: "D", email: "x@y.com" })?.level).toBe("block");
    expect(matchContacts({ id: 1, title: "A", first_name: "A", last_name: "B", main_phone: "+1 (305) 555-0101" }, { id: 2, title: "C", first_name: "C", last_name: "D", main_phone: "305-555-0101" })?.level).toBe("block");
    expect(matchContacts({ id: 1, title: "", first_name: "Marco", last_name: "Abrahao" }, { id: 2, title: "", first_name: "MARCO", last_name: "ABRAHÃO" })?.level).toBe("block");
  });
  it("warns on Gusttavo / Gustavo, Gretta / Greta, Joakin / Joakim and on the same last name with the same initial", () => {
    expect(matchContacts({ id: 1, title: "", first_name: "Gusttavo", last_name: "Lima" }, { id: 2, title: "", first_name: "Gustavo", last_name: "Lima" })?.level).toBe("warn");
    expect(matchContacts({ id: 1, title: "", first_name: "Gretta", last_name: "Silva" }, { id: 2, title: "", first_name: "Greta", last_name: "Silva" })?.level).toBe("warn");
    expect(matchContacts({ id: 1, title: "", first_name: "Joakin", last_name: "Costa" }, { id: 2, title: "", first_name: "Joakim", last_name: "Costa" })?.level).toBe("warn");
    expect(matchContacts({ id: 1, title: "", first_name: "Paulo", last_name: "Lemann" }, { id: 2, title: "", first_name: "Pedro", last_name: "Lemann" })?.level).toBe("warn");
  });
  it("only hints at the same family for Patricia and Michel Doukeris", () => {
    expect(matchContacts({ id: 1, title: "", first_name: "Patricia", last_name: "Doukeris" }, { id: 2, title: "", first_name: "Michel", last_name: "Doukeris" })?.level).toBe("family");
  });
  it("edit distance", () => {
    expect(editDistance("gusttavolima", "gustavolima")).toBe(1);
    expect(editDistance("abc", "xyz")).toBe(3);
  });
});

describe("PJ-b standard names", () => {
  it("MARCO ABRAHAO → Marco Abrahao - St Regis #1402S", () => {
    expect(proposedTitle({ owner: { id: 1, title: "MARCO ABRAHAO", first_name: "MARCO", last_name: "ABRAHAO", type: "End Customer" }, building: "St Regis", address: { street: "9701 Collins Ave" }, unit: "1402S" })).toBe("Marco Abrahao - St Regis #1402S");
  });
  it("a company gets Company - Place; no building falls back to the street", () => {
    expect(proposedTitle({ owner: { id: 1, title: "The Wall Paper Company", first_name: "The Wall Paper", last_name: "Company", type: "Commercial Customer" }, organization: { title: "THE WALL PAPER COMPANY" }, address: { street: "2000 Design District" }, unit: null })).toBe("The Wall Paper Company - 2000 Design District");
    expect(proposedTitle({ owner: { id: 1, title: "", first_name: "RICHARD", last_name: "WAGNER", type: "End Customer" }, address: { street: "700 Northeast 26th Terrace" }, unit: "#2604" })).toBe("Richard Wagner - 700 Northeast 26th Terrace #2604");
  });
  it("title case keeps O'Reilly and de la Cruz", () => {
    expect(titleCase("O'REILLY")).toBe("O'Reilly");
    expect(titleCase("MARIA DE LA CRUZ")).toBe("Maria de la Cruz");
  });
});
