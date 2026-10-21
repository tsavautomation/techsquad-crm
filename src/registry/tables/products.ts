// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_inventory) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

// INV-i (Fred 2026-10-21): the Product Type list, replacing WebAuthor's four (Amplifier, Dimmer, Speaker, Television);
// Dimmer became "Dimmer / Switch" and Television "TV" (migration 20261021090000). Shared with Stock and Sale, which copy it.
export const PRODUCT_TYPES = [
  "TV",
  "TV Mount",
  "TV Lift / Furniture",
  "Projector / Screen",
  "Video/Audio Distribution",
  "Streaming / Media Source",
  "Speaker",
  "Soundbar",
  "Subwoofer",
  "Amplifier",
  "AV Receiver / Processor",
  "Control Processor",
  "Keypad",
  "Dimmer / Switch",
  "Touch Panel / Remote",
  "Shade / Motor / Drapery",
  "Sensor / I/O Module",
  "Thermostat / HVAC",
  "Lighting",
  "Network Switch",
  "Router / Gateway",
  "Wireless Access Point",
  "Camera",
  "NVR / DVR / Hard Drive",
  "Camera Mount / Accessory",
  "Intercom / Doorbell",
  "Lock / Access Control",
  "Power / UPS / Surge Protection",
  "Rack & Enclosures",
  "Wall Plate / Trim",
  "Electrical / Wiring Device",
  "Cable / Connector",
  "Ventilation / Fan",
  "Phone / Telephony",
  "Smart Home Assistant",
  "Supplies / Misc",
].map((v) => ({ label: v, value: v, added: true as const }));

export const products: TableDef = {
  "name": "products",
  "label": "Products",
  "module": "inventory",
  "tab": "products",
  "itemLabel": "Product",
  "newRecordLabel": "New Product",
  "detailAddon": "product",
  "titleFormula": "{brand_id} {model} ({sku})",
  "fields": [
    {
      "name": "title",
      "label": "Title",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 88215
      },
      "hidden": true,
      "maxLength": 200
    },
    {
      "name": "product_type",
      "label": "Product Type",
      "type": "select",
      "legacy": {
        "column": "product_type",
        "fieldId": 88231
      },
      "options": PRODUCT_TYPES
    },
    {
      "name": "supplier_id",
      "label": "Supplier",
      "type": "lookup",
      "legacy": {
        "column": "supplier",
        "fieldId": 88263
      },
      "lookup": {
        "table": "suppliers"
      }
    },
    {
      "name": "brand_id",
      "label": "Brand",
      "type": "lookup",
      "legacy": {
        "column": "brand",
        "fieldId": 88262
      },
      "lookup": {
        "table": "brands"
      }
    },
    {
      "name": "sku",
      "label": "SKU",
      "type": "text",
      "legacy": {
        "column": "sku",
        "fieldId": 88222
      },
      "maxLength": 20
    },
    {
      "name": "model",
      "label": "Model",
      "type": "text",
      "legacy": {
        "column": "model",
        "fieldId": 88226
      },
      "maxLength": 80
    },
    {
      "name": "description",
      "label": "Description",
      "type": "text",
      "legacy": { "column": "", "fieldId": 0 },
      "maxLength": 120
    },
    {
      "name": "sell_price",
      "label": "Sell Price",
      "type": "money",
      "legacy": {
        "column": "sell_price",
        "fieldId": 88247
      }
    },
    {
      "name": "cost",
      "label": "Cost",
      "type": "money",
      "legacy": {
        "column": "cost",
        "fieldId": 88248
      }
    },
    {
      "name": "location",
      "label": "Location",
      "type": "text",
      "legacy": {
        "column": "location",
        "fieldId": 88249
      },
      "maxLength": 50
    },
    {
      "name": "image",
      "label": "Image",
      "type": "file",
      "legacy": {
        "column": "image",
        "fieldId": 88295
      }
    }
  ],
  // Jessica 2026-10-20 (bug: an empty product could be saved): a product needs at least its Model or its SKU.
  "rules": [
    { id: 900301, title: "Model is required when there is no SKU", when: [{ field: "sku", op: "empty" }], then: [{ do: "require", field: "model" }] },
    { id: 900302, title: "SKU is required when there is no Model", when: [{ field: "model", op: "empty" }], then: [{ do: "require", field: "sku" }] },
  ],
  "legacy": {
    "table": "fx_techsquad_inventory"
  }
};
