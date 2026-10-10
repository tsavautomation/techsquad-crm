// Client Apps (F6 Client portal, Fred 2026-10-10): the apps a customer may need for their systems (Crestron
// Home, Lutron, Sonos…) with the App Store / Google Play links. Ticked per project on the Project page; the
// portal shows them with a tap-to-download button. Not from WebAuthor; maintained by hand.
import type { TableDef } from "../types";

const NEW = { column: "", fieldId: 0 };

export const portalApps: TableDef = {
  name: "portal_apps",
  label: "Client Apps",
  module: "administrative",
  tab: "portal-apps",
  itemLabel: "Client App",
  newRecordLabel: "New Client App",
  titleFormula: null,
  origin: "new",
  fields: [
    { name: "title", label: "App", type: "text", required: true, maxLength: 80, placeholder: "E.g. Crestron Home", legacy: NEW },
    { name: "purpose", label: "What it is for", type: "textarea", required: true, maxLength: 500, placeholder: "E.g. Lights, shades, music and TV in every room", legacy: NEW },
    { name: "ios_url", label: "App Store link (iPhone)", type: "url", maxLength: 500, placeholder: "https://apps.apple.com/…", legacy: NEW },
    { name: "android_url", label: "Google Play link (Android)", type: "url", maxLength: 500, placeholder: "https://play.google.com/store/apps/…", legacy: NEW },
    { name: "web_url", label: "Website", type: "url", maxLength: 500, legacy: NEW },
  ],
  rules: [],
  legacy: { table: "" },
};
