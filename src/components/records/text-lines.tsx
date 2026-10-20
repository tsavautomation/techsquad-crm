// Plain-text rendering helpers shared by server and client components: no server imports here, so
// a client component (the masked credentials value) can use them without dragging next/headers in.

const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;

/**
 * Plain text with any pasted links clickable, and long unbroken strings (links, codes) allowed to wrap
 * inside the box instead of pushing the page wider (Fred 2026-10-02, a OneDrive link in Plans).
 */
export function linkify(text: string): React.ReactNode {
  const parts = text.split(URL_RE);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noreferrer" className="break-all text-primary underline-offset-4 hover:underline">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

const KEYED_LINE = /^([^:\n]{1,40}):\s*(.*)$/;

/**
 * Multi-line text written as "Label: value" lines (system credentials, access info) reads as a list,
 * one line each with the label in bold (Fred 2026-10-20). Other text keeps its line breaks as typed.
 */
export function textareaValue(text: string): React.ReactNode {
  const lines = text.split(/\r?\n/);
  const keyed = lines.filter((l) => KEYED_LINE.test(l.trim())).length;
  if (lines.length < 2 || keyed < 2) return linkify(text);
  return (
    <ul className="space-y-1">
      {lines.map((line, i) => {
        const t = line.trim();
        if (!t) return null;
        const m = t.match(KEYED_LINE);
        return (
          <li key={i} className="break-words">
            {m ? (
              <>
                <strong className="font-semibold">{m[1]}:</strong> {m[2] ? linkify(m[2]) : null}
              </>
            ) : (
              linkify(t)
            )}
          </li>
        );
      })}
    </ul>
  );
}
