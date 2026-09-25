// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_inventory_xmstock) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const stockItems: TableDef = {
  "name": "stock_items",
  "label": "Stock",
  "module": "inventory",
  "tab": "stock",
  "itemLabel": "Stock",
  "newRecordLabel": "New Item",
  "submit": {
    "showButton": false,
    "workflow": "stock_status"
  },
  "titleFormula": "{serial}",
  "fields": [
    {
      "name": "product_id",
      "label": "SKU",
      "type": "lookup",
      "legacy": {
        "column": "sku",
        "fieldId": 88265
      },
      "required": true,
      "lookup": {
        "table": "products",
        "autofill": [
          {
            "from": "location",
            "to": "location"
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
      "name": "serial",
      "label": "Serial",
      "type": "text",
      "legacy": {
        "column": "serial",
        "fieldId": 88242
      },
      "required": true,
      "maxLength": 50
    },
    {
      "name": "mac_address",
      "label": "MAC",
      "type": "text",
      "legacy": {
        "column": "mac_address",
        "fieldId": 88246
      },
      "maxLength": 50
    },
    {
      "name": "location",
      "label": "Location",
      "type": "text",
      "legacy": {
        "column": "location",
        "fieldId": 88268
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
        "fieldId": 88273
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
        "fieldId": 88271
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
        "fieldId": 88270
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
        "fieldId": 88274
      },
      "readOnly": true
    },
    {
      "name": "cost",
      "label": "Cost",
      "type": "money",
      "legacy": {
        "column": "cost",
        "fieldId": 88272
      },
      "readOnly": true
    },
    {
      "name": "destination_project_id",
      "label": "Destination",
      "type": "lookup",
      "legacy": {
        "column": "destination",
        "fieldId": 88358
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
        "fieldId": 88359
      },
      "lookup": {
        "table": "employees"
      }
    },
    {
      "name": "status",
      "label": "Status",
      "type": "select",
      "legacy": {
        "column": "status",
        "fieldId": 88360
      },
      "options": [
        {
          "label": "In Stock",
          "value": "In Stock",
          "color": "#8bc34a"
        },
        {
          "label": "On Project",
          "value": "On Project",
          "color": "#2196f3"
        },
        {
          "label": "RMA",
          "value": "RMA",
          "color": "#f44336"
        }
      ]
    }
  ],
  "rules": [],
  "legacy": {
    "table": "fx_techsquad_inventory_xmstock"
  }
};
