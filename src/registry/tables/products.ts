// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_inventory) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const products: TableDef = {
  "name": "products",
  "label": "Products",
  "module": "inventory",
  "tab": "products",
  "itemLabel": "Product",
  "newRecordLabel": "New Product",
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
      "options": [
        {
          "label": "Amplifier",
          "value": "Amplifier",
          "color": "#ffc107"
        },
        {
          "label": "Dimmer",
          "value": "Dimmer",
          "color": "#bcefef"
        },
        {
          "label": "Speaker",
          "value": "Speaker",
          "color": "#f44336"
        },
        {
          "label": "Television",
          "value": "Television",
          "color": "#3f51b5"
        }
      ]
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
      "maxLength": 30
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
  "rules": [],
  "legacy": {
    "table": "fx_techsquad_inventory"
  }
};
