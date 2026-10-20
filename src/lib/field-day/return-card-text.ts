// The return card's Details are stored in English (CLAUDE.md: stored values are never translated, emails and
// PDFs stay in English). The screens show them in the viewer's language by translating each line the card
// builder (returnCardDetails in day.ts) can write; any other line is shown as it is (SPEC §9.1 J-i).
// Pure and client-safe: used by the Tasks board, the task page and Today.

type T = (key: string, vars?: Record<string, string | number>) => string;

export function localizeReturnCard(text: string | null | undefined, t: T): string {
  if (!text) return "";
  return text.split("\n").map((line) => localizeLine(line, t)).join("\n");
}

function localizeLine(line: string, t: T): string {
  if (line === "2nd visit in a row that wasn't finished on this project.") return t("2nd visit in a row that wasn't finished on this project.");
  if (line === "Missing:") return t("Missing:");
  let m = line.match(/^Return visit needed: (Completed|Partial|Not done)(?: \((.+)\))?\.$/);
  if (m) return t("Return visit needed: {result}{reason}.", { result: t(m[1]), reason: m[2] ? ` (${t(m[2])})` : "" });
  m = line.match(/^Waiting on: (.*)$/);
  if (m) return `${t("Waiting on:")} ${m[1]}`;
  m = line.match(/^Bring: (.*)$/);
  if (m) return `${t("Bring:")} ${m[1]}`;
  m = line.match(/^Access: (.*)$/);
  if (m) return `${t("Access:")} ${m[1]}`;
  m = line.match(/^Needs: (.*)$/);
  if (m) {
    const parts = m[1].split(", ").map((part) => {
      const time = part.match(/^time (.+)$/);
      if (time) return t("time {t}", { t: time[1] });
      const people = part.match(/^(\d+) people$/);
      if (people) return t("{n} people", { n: people[1] });
      return part;
    });
    return `${t("Needs:")} ${parts.join(", ")}`;
  }
  return line;
}
