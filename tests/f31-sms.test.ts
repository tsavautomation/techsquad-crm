import { describe, expect, it } from "vitest";
import { formatPhone, isRingCentralText, parseRingCentralText, phoneDigits } from "@/lib/mail/sms";

// F31 Texts by email: RingCentral's "New Text Message from …" emails become WhatsApp-style messages.

describe("RingCentral text emails", () => {
  it("recognises the notification by sender and subject", () => {
    expect(isRingCentralText("service@ringcentral.com", "New Text Message from (954) 856-6166")).toBe(true);
    expect(isRingCentralText("service@ringcentral.com", "Your invoice")).toBe(false);
    expect(isRingCentralText("someone@gmail.com", "New Text Message from Bob")).toBe(false);
  });

  it("reads the number and the text when the template labels it", () => {
    const p = parseRingCentralText({
      subject: "New Text Message from +1 (954) 856-6166",
      text: "Dear Tech Squad,\n\nYou have a new text message.\n\nFrom: +1 (954) 856-6166\nTo: (561) 323-7096\nReceived: Thursday, October 22, 2026 at 2:11 PM\n\nMessage:\nHi, the living room TV has no sound since yesterday. Can someone come?\n\nTo reply using the RingCentral app, click here.\nThank you for using RingCentral.\n",
    })!;
    expect(p.phone).toBe("9548566166");
    expect(p.sender).toBe("+1 (954) 856-6166");
    expect(p.body).toBe("Hi, the living room TV has no sound since yesterday. Can someone come?");
  });

  it("falls back to the lines that are not template, and keeps the language", () => {
    const p = parseRingCentralText({
      subject: "New Text Message from Chloe Womack",
      text: "You have a new text message from Chloe Womack.\nFrom: (305) 555-0101\n\nOi, as cortinas chegaram, podem instalar sexta?\n\nTo reply using the RingCentral app, click here\nhttps://app.ringcentral.com/\n© 2026 RingCentral, Inc.",
    })!;
    expect(p.phone).toBe("3055550101");
    expect(p.sender).toBe("Chloe Womack");
    expect(p.body).toBe("Oi, as cortinas chegaram, podem instalar sexta?");
  });

  it("gives up on an email with no readable text, and formats numbers", () => {
    expect(parseRingCentralText({ subject: "New Text Message from (954) 856-6166", text: "To reply using the RingCentral app, click here.\n" })).toBeNull();
    expect(parseRingCentralText({ subject: "Invoice", text: "Message:\nhi" })).toBeNull();
    expect(phoneDigits("+1 954-856-6166")).toBe("9548566166");
    expect(phoneDigits("12345")).toBeNull();
    expect(formatPhone("9548566166")).toBe("(954) 856-6166");
    expect(formatPhone("5511999990000")).toBe("5511999990000");
  });
});
