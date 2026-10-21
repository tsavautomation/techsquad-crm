import { describe, expect, it } from "vitest";
import { upcomingBirthdays } from "@/lib/engine/birthdays";

// BD-a: the birthday strip on Today (SPEC §9.1 BD-a). Dates are YYYY-MM-DD in Eastern time; the year is ignored.
const people = [
  { name: "Ana Souza", birthday: "1990-10-21" },
  { name: "Bruno Lima", birthday: "1985-10-24" },
  { name: "Carla Dias", birthday: "2001-10-28" },
  { name: "Diego Reis", birthday: "1979-10-29" },
  { name: "Elena Cruz", birthday: null },
  { name: "Fabio Melo", birthday: "1992-03-15" },
];

describe("upcomingBirthdays", () => {
  it("lists everyone whose birthday is today, ignoring the year, and nothing else", () => {
    const r = upcomingBirthdays([...people, { name: "Zeca Pinto", birthday: "1960-10-21" }], "2026-10-21");
    expect(r.today).toEqual(["Ana Souza", "Zeca Pinto"]);
    expect(r.upcoming).toEqual([]);
  });

  it("lists the next 7 days in date order when nobody has one today", () => {
    const r = upcomingBirthdays(people, "2026-10-22");
    expect(r.today).toEqual([]);
    expect(r.upcoming).toEqual([
      { name: "Bruno Lima", date: "10/24" },
      { name: "Carla Dias", date: "10/28" },
      { name: "Diego Reis", date: "10/29" },
    ]);
  });

  it("stops at 7 days: in 3 days is shown, in 8 days is not", () => {
    expect(upcomingBirthdays(people, "2026-10-21").upcoming).toEqual([]);
    expect(upcomingBirthdays([{ name: "Bruno Lima", birthday: "1985-10-24" }], "2026-10-21").upcoming).toEqual([{ name: "Bruno Lima", date: "10/24" }]);
    expect(upcomingBirthdays([{ name: "Diego Reis", birthday: "1979-10-29" }], "2026-10-21").upcoming).toEqual([]);
    expect(upcomingBirthdays([{ name: "Carla Dias", birthday: "2001-10-28" }], "2026-10-21").upcoming).toEqual([{ name: "Carla Dias", date: "10/28" }]);
  });

  it("rolls over the month and the year (12/28 sees 01/02, 01/03 sees 01/04 but not 12/30)", () => {
    const r = upcomingBirthdays([{ name: "Gil", birthday: "1970-01-02" }, { name: "Hugo", birthday: "1970-12-30" }, { name: "Ivo", birthday: "1970-01-05" }], "2026-12-28");
    expect(r.upcoming).toEqual([
      { name: "Hugo", date: "12/30" },
      { name: "Gil", date: "1/2" },
    ]);
    expect(upcomingBirthdays([{ name: "Gil", birthday: "1970-01-02" }], "2027-01-02").today).toEqual(["Gil"]);
    expect(upcomingBirthdays([{ name: "Hugo", birthday: "1970-12-30" }], "2027-01-03").upcoming).toEqual([]);
  });

  it("shows a 02/29 birthday on 02/28 in a year without the 29th, and on 02/29 in a leap year", () => {
    const leapBaby = [{ name: "Lia", birthday: "2000-02-29" }];
    expect(upcomingBirthdays(leapBaby, "2026-02-28").today).toEqual(["Lia"]);
    expect(upcomingBirthdays(leapBaby, "2026-03-01").today).toEqual([]);
    expect(upcomingBirthdays(leapBaby, "2026-02-22")).toEqual({ today: [], upcoming: [{ name: "Lia", date: "2/28" }] });
    expect(upcomingBirthdays(leapBaby, "2028-02-28")).toEqual({ today: [], upcoming: [{ name: "Lia", date: "2/29" }] });
    expect(upcomingBirthdays(leapBaby, "2028-02-29").today).toEqual(["Lia"]);
  });

  it("skips people without a date and returns nothing when nobody is near", () => {
    expect(upcomingBirthdays(people, "2026-06-10")).toEqual({ today: [], upcoming: [] });
    expect(upcomingBirthdays([], "2026-10-21")).toEqual({ today: [], upcoming: [] });
  });

  it("accepts the MM-DD form the database view sends (no year ever leaves the database)", () => {
    expect(upcomingBirthdays([{ name: "Ana Souza", birthday: "10-21" }], "2026-10-21").today).toEqual(["Ana Souza"]);
    expect(upcomingBirthdays([{ name: "Lia", birthday: "02-29" }], "2027-02-28").today).toEqual(["Lia"]);
  });
});
