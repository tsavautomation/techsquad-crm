import sanitizeHtml from "sanitize-html";

/** Formatting allowed in rich-text fields (Knowledge Base articles). Everything else is stripped. */
const RICH_TEXT: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "h2", "h3", "ul", "ol", "li", "blockquote", "a", "code", "pre", "hr"],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  transformTags: { a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noreferrer" }) },
};

/** Clean rich text before it is stored; the detail page renders the stored HTML as-is. */
export function sanitizeRichText(html: string): string | null {
  return sanitizeHtml(html, RICH_TEXT) || null;
}
