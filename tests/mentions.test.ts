import { describe, expect, it } from "vitest";
import { mentionedIn, mentionQuery, splitMentions } from "@/lib/records/mentions";

const people = [
  { id: "a", name: "Lucas Oliveira" },
  { id: "b", name: "Jessica Lima" },
  { id: "c", name: "Luca" },
];

describe("tagging people in notes", () => {
  it("tags only people whose @Name is still in the text", () => {
    expect(mentionedIn("@Lucas Oliveira please call the client", people)).toEqual(["a"]);
    expect(mentionedIn("no tags here, Jessica Lima", people)).toEqual([]);
    expect(mentionedIn("@jessica lima and @Lucas Oliveira", people).sort()).toEqual(["a", "b"]);
  });

  it("finds the @word being typed before the cursor", () => {
    expect(mentionQuery("hi @Luc", 7)).toEqual({ start: 3, query: "Luc" });
    expect(mentionQuery("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionQuery("hi @Lucas Ol", 12)).toEqual({ start: 3, query: "Lucas Ol" });
    expect(mentionQuery("mail me at fred@tsav", 20)).toBeNull();
    expect(mentionQuery("hi @Lucas Oliveira and more", 27)).toBeNull();
  });

  it("highlights the longest matching name", () => {
    const parts = splitMentions("ask @Lucas Oliveira and @Luca", people.map((p) => p.name));
    expect(parts.filter((p) => p.tag).map((p) => p.text)).toEqual(["@Lucas Oliveira", "@Luca"]);
    expect(parts.map((p) => p.text).join("")).toBe("ask @Lucas Oliveira and @Luca");
  });
});
