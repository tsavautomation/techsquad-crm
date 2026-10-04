import "server-only";
import { strFromU8, unzipSync } from "fflate";
import { extractText, getDocumentProxy } from "unpdf";

// F16 Report archive: the text inside a report file. PDFs with a text layer, Word files, text and
// HTML are read here; scans, screenshots and PDFs without text go to Claude (ai.ts).

export type Extracted = { kind: "pdf" | "docx" | "txt" | "html" | "image" | "unsupported"; text: string | null; pages?: number };

const IMAGE = /^(jpe?g|png|gif|webp)$/i;

export async function extractFileText(bytes: Buffer, ext: string): Promise<Extracted> {
  const e = ext.toLowerCase();
  if (IMAGE.test(e)) return { kind: "image", text: null };
  if (e === "pdf") {
    try {
      const doc = await getDocumentProxy(new Uint8Array(bytes));
      const { text, totalPages } = await extractText(doc, { mergePages: true });
      const clean = tidy(text);
      // A scanned PDF has pages but no words.
      return { kind: "pdf", text: clean.replace(/\s/g, "").length >= 20 ? clean : null, pages: totalPages };
    } catch {
      return { kind: "pdf", text: null };
    }
  }
  if (e === "docx") {
    try {
      const files = unzipSync(new Uint8Array(bytes));
      const xml = strFromU8(files["word/document.xml"]);
      const text = xml
        .replace(/<\/w:p>/g, "\n")
        .replace(/<w:tab\/>/g, "\t")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
      return { kind: "docx", text: tidy(text) || null };
    } catch {
      return { kind: "docx", text: null };
    }
  }
  if (e === "txt" || e === "md") return { kind: "txt", text: tidy(bytes.toString("utf8")) || null };
  if (e === "html" || e === "htm") {
    const text = bytes
      .toString("utf8")
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
      .replace(/<\/t[dh]>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");
    return { kind: "html", text: tidy(text) || null };
  }
  return { kind: "unsupported", text: null };
}

const tidy = (s: string) =>
  s
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
