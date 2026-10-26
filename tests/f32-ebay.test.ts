import { describe, expect, it } from "vitest";
import { ebayKind, extractPrompt, fieldsFor, heuristics, itemTitle, linksIn, merge, parseExtraction, repairJson, textLinks, titleKey } from "@/lib/ebay/engine";

// F32 Ebay sales (SPEC §9.1 F32-a): which emails are eBay's two, the regex reading, Claude's answer, the merge.

describe("recognising eBay's emails", () => {
  it("the sale and the label email, by sender and subject; nothing else", () => {
    expect(ebayKind("ebay@ebay.com", "You made the sale! Ship it to John")).toBe("sale");
    expect(ebayKind("eBay <ebay@ebay.com>".replace(/.*<|>/g, ""), "Your shipping label is ready")).toBe("label");
    expect(ebayKind("ebay@reply.ebay.com", "Your item sold!")).toBe("sale");
    expect(ebayKind("info@tsav.net", "Fwd: eBay: Your shipping label is ready")).toBe("label");
    expect(ebayKind("ebay@ebay.com", "Weekly deals for you")).toBeNull();
    expect(ebayKind("someone@gmail.com", "You made the sale")).toBeNull();
    // Forwarded by the office: the forwarder is the sender, eBay is in the forwarded From: line or the text.
    expect(ebayKind("info@techsquadfl.com", "Your shipping label is ready", { innerSenders: ["ebay@ebay.com"] })).toBe("label");
    expect(ebayKind("info@techsquadfl.com", "You made the sale", { text: "From: eBay <ebay@ebay.com>\nSold!" })).toBe("sale");
    expect(ebayKind("service@ringcentral.com", "New Text Message from (305) 555-0100")).toBeNull();
  });
});

describe("reading without a model", () => {
  const text = "You made the sale!\nCrestron TSW-760 Touch Screen Black\nSold for $425.00\nItem number: 256789012345\nOrder number: 12-34567-89012\nShipping: $12.50\nOrder total: $437.50\nShip to:\nJohn Doe\n123 Main St\nMiami, FL 33101";
  it("finds the order number, prices, item number", () => {
    const h = heuristics("sale", text, []);
    expect(h.order_number).toBe("12-34567-89012");
    expect(h.price).toBe(425);
    expect(h.total).toBe(437.5);
    expect(h.item_id).toBe("256789012345");
    expect(h.label_url).toBeNull();
  });
  it("takes the label link from the hrefs on the label email", () => {
    const links = linksIn('<a href="https://www.ebay.com/img/pixel.png">x</a> <a href="https://www.ebay.com/ship/label/print?id=1&amp;x=2">Print label</a> <a href="https://www.ebay.com/help">Help</a>');
    expect(links).toEqual(["https://www.ebay.com/ship/label/print?id=1&x=2", "https://www.ebay.com/help"]);
    expect(heuristics("label", "Your shipping label is ready. Order 12-34567-89012. Tracking number: 9400111899223345678901", links).label_url).toBe("https://www.ebay.com/ship/label/print?id=1&x=2");
    expect(heuristics("label", "Tracking number: 9400111899223345678901", links).tracking).toBe("9400111899223345678901");
  });
});

describe("reading Claude's answer and merging", () => {
  it("accepts the JSON with a fence, cleans the fields and drops a bad link", () => {
    const a = parseExtraction('```json\n{"order_number":"Order 12-34567-89012","item_id":256789012345,"item_title":"Crestron TSW-760","quantity":"1","price":"$425.00","shipping":12.5,"total":437.5,"buyer_name":"John Doe","buyer_username":"jdoe_99","ship_to":"John Doe\\\\n123 Main St\\\\nMiami, FL 33101","sold_at":"2026-10-25T14:00:00Z","label_url":"javascript:void(0)","tracking":null}\n```');
    expect(a).toMatchObject({ order_number: "12-34567-89012", item_id: "256789012345", quantity: 1, price: 425, shipping: 12.5, total: 437.5, buyer_name: "John Doe", buyer_username: "jdoe_99", sold_at: "2026-10-25T14:00:00.000Z", label_url: null, tracking: null });
    expect(a?.ship_to).toBe("John Doe\n123 Main St\nMiami, FL 33101");
    expect(parseExtraction("no json")).toBeNull();
  });
  it("the model wins where it answers; the regex fills the rest", () => {
    const fallback = heuristics("sale", "Order number: 12-34567-89012 Sold for $425.00", []);
    const m = merge(parseExtraction('{"item_title":"Crestron TSW-760","price":420}'), fallback);
    expect(m.item_title).toBe("Crestron TSW-760");
    expect(m.price).toBe(420);
    expect(m.order_number).toBe("12-34567-89012");
    expect(merge(null, fallback)).toEqual(fallback);
  });
  it("builds the prompt with the links and a loose key for titles", () => {
    expect(extractPrompt({ subject: "S", from: "eBay", receivedAt: "now", text: "body", links: ["https://x"] })).toContain("Links in the email:\nhttps://x");
    expect(titleKey("Crestron TSW-760 Touch Screen, Black (used)")).toBe("crestron tsw 760 touch screen black");
    expect(titleKey(null)).toBe("");
  });
});

describe("a label email in eBay's 2026 layout (values made up)", () => {
  const text = "________________________________\nFrom: eBay <ebay@ebay.com>\nSent: Monday, October 26, 2026 7:37 AM\nSubject: Your shipping label is ready\n\nDownload label <https://www.ebay.com/ship/single/print/00000000-0000-0000-0000-000000000001>\n\nPrint packing slip<https://www.ebay.com/sh/ord/prt?module=PACKING_SLIP_MODULE&labelId=00000000>\n\nShip to\n\nPat Example\nSample City, 00000-0000\n\nTracking\n\n9400100000000000000001\n\nSample Switch 12P\nOrder number\n\n27-00000-00001\n\nItem Number\n\n270000000001\n\nBuyer\n\nsamplebuyer\n\nQty\n\n1\n\nOrder total:\nUSPS Ground Advantage   USD 12.08\n";
  it("reads the label link from the text, the tracking, the order and item numbers and the buyer id", () => {
    expect(textLinks(text)).toContain("https://www.ebay.com/ship/single/print/00000000-0000-0000-0000-000000000001");
    const h = heuristics("label", text, []);
    expect(h.label_url).toBe("https://www.ebay.com/ship/single/print/00000000-0000-0000-0000-000000000001");
    expect(h.tracking).toBe("9400100000000000000001");
    expect(h.order_number).toBe("27-00000-00001");
    expect(h.item_id).toBe("270000000001");
    expect(h.buyer_username).toBe("samplebuyer");
  });
  it("the label email never overwrites the sale's price with the postage, but fills blanks and owns the label and tracking", () => {
    const x = { ...heuristics("label", text, []), price: 12.08, buyer_name: "Pat Example", ship_to: "Pat Example\nSample City, 00000-0000" };
    const existing = { price: 425, buyer_name: "Pat Example", ship_to: "Pat Example\n1 Sample Rd\nSample City, ST 00000-0000", tracking: null, label_url: null };
    const f = fieldsFor("label", x, existing);
    expect(f.price).toBeUndefined();
    expect(f.ship_to).toBeUndefined();
    expect(f.label_url).toBe(x.label_url);
    expect(f.tracking).toBe("9400100000000000000001");
    expect(fieldsFor("label", x, null).price).toBe(12.08);
    const sale = fieldsFor("sale", { ...x, label_url: "https://x", tracking: "T" }, { tracking: "9400100000000000000001" });
    expect(sale.label_url).toBeUndefined();
    expect(sale.tracking).toBeUndefined();
  });
});

describe("an address with real line breaks inside the JSON string", () => {
  it("is repaired and read", () => {
    const raw = '{"item_title":"Sample Switch 12P","ship_to":"Pat Example\n1 Sample Rd\nSample City, ST 00000","price":64.9}';
    expect(() => JSON.parse(raw)).toThrow();
    expect(JSON.parse(repairJson(raw)).ship_to).toBe("Pat Example\n1 Sample Rd\nSample City, ST 00000");
    expect(parseExtraction(raw)?.ship_to).toBe("Pat Example\n1 Sample Rd\nSample City, ST 00000");
    expect(parseExtraction(raw)?.price).toBe(64.9);
  });
});

describe("the item name (Fred 2026-10-26: the title of the tile)", () => {
  it("comes from the subject, the bracketed order link, or the line above Order number", () => {
    expect(itemTitle("sale", "", "You made the sale for Sample Switch 12P")).toBe("Sample Switch 12P");
    expect(itemTitle("sale", "Fwd: You made the sale for Sample Switch 12P".slice(0, 0) + "blah\n[Sample Switch 12P]<https://www.ebay.com/mesh/ord/details?orderid=27-00000-00001&x=1>\n", "Fwd: your order")).toBe("Sample Switch 12P");
    expect(itemTitle("label", "Tracking\n\n9400100000000000000001\n\n[alt]\n<https://cgi.ebay.com/ws/eBayISAPI.dll?ViewItem&item=270000000001>\nSample Switch 12P\nOrder number\n\n27-00000-00001\n", "Your shipping label is ready")).toBe("Sample Switch 12P");
    expect(itemTitle("sale", "nothing here", "Weekly deals")).toBeNull();
    expect(heuristics("sale", "x", [], "You made the sale for Sample Switch 12P").item_title).toBe("Sample Switch 12P");
  });
});
