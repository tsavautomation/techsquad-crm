// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_inventory_xmsale) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const sales: TableDef = {
  "name": "sales",
  "label": "Sale",
  "module": "inventory",
  "tab": "sales",
  "itemLabel": "Item",
  "newRecordLabel": "New Item",
  "titleFormula": "{stock_item_id}",
  "fields": [
    {
      "name": "title",
      "label": "Title",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 88235
      },
      "hidden": true,
      "maxLength": 200
    },
    {
      "name": "stock_item_id",
      "label": "Serial",
      "type": "lookup",
      "legacy": {
        "column": "serial",
        "fieldId": 88285
      },
      "required": true,
      "lookup": {
        "table": "stock_items",
        "autofill": [
          {
            "from": "mac_address",
            "to": "mac_address"
          },
          {
            "from": "product_type",
            "to": "product_type"
          },
          {
            "from": "brand_id",
            "to": "brand_id"
          },
          {
            "from": "model",
            "to": "model"
          },
          {
            "from": "sell_price",
            "to": "sell_price"
          },
          {
            "from": "cost",
            "to": "cost"
          }
        ]
      }
    },
    {
      "name": "mac_address",
      "label": "MAC",
      "type": "text",
      "legacy": {
        "column": "mac_address",
        "fieldId": 88288
      },
      "readOnly": true,
      "maxLength": 50
    },
    {
      "name": "product_type",
      "label": "Product Type",
      "type": "select",
      "legacy": {
        "column": "product_type",
        "fieldId": 88278
      },
      "readOnly": true,
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
      "name": "brand_id",
      "label": "Brand",
      "type": "lookup",
      "legacy": {
        "column": "brand",
        "fieldId": 88275
      },
      "readOnly": true,
      "lookup": {
        "table": "brands"
      }
    },
    {
      "name": "model",
      "label": "Model",
      "type": "text",
      "legacy": {
        "column": "model",
        "fieldId": 88277
      },
      "readOnly": true,
      "maxLength": 30
    },
    {
      "name": "sell_price",
      "label": "Sell Price",
      "type": "money",
      "legacy": {
        "column": "sell_price",
        "fieldId": 88279
      },
      "readOnly": true
    },
    {
      "name": "cost",
      "label": "Cost",
      "type": "money",
      "legacy": {
        "column": "cost",
        "fieldId": 88276
      },
      "readOnly": true
    },
    {
      "name": "destination_project_id",
      "label": "Destination",
      "type": "lookup",
      "legacy": {
        "column": "destination",
        "fieldId": 88289
      },
      "lookup": {
        "table": "projects"
      }
    },
    {
      "name": "staff_id",
      "label": "Staff",
      "type": "lookup",
      "legacy": {
        "column": "staff_member",
        "fieldId": 88290
      },
      "lookup": {
        "table": "employees"
      }
    }
  ],
  "rules": [],
  "legacy": {
    "table": "fx_techsquad_inventory_xmsale"
  }
};
