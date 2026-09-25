// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_employee_xminventory_checkout) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const inventoryCheckouts: TableDef = {
  "name": "inventory_checkouts",
  "label": "Inventory Checkout",
  "module": "administrative",
  "tab": "inventory-checkout",
  "itemLabel": "Checkout",
  "newRecordLabel": "New Checkout",
  "titleFormula": "{technician_id} – {date}",
  "fields": [
    {
      "name": "type",
      "label": "Type",
      "type": "radio",
      "legacy": {
        "column": "type",
        "fieldId": 71398
      },
      "options": [
        {
          "label": "Materials for a Project",
          "value": "Materials",
          "color": "#ffe5ad"
        },
        {
          "label": "Tools for Technician",
          "value": "Tools",
          "color": "#c5e6c1"
        }
      ],
      "default": "Materials"
    },
    {
      "name": "project_id",
      "label": "Project",
      "type": "lookup",
      "legacy": {
        "column": "project",
        "fieldId": 68753
      },
      "lookup": {
        "table": "projects"
      }
    },
    {
      "name": "technician_id",
      "label": "Technician",
      "type": "lookup",
      "legacy": {
        "column": "technician",
        "fieldId": 68756
      },
      "lookup": {
        "table": "employees"
      }
    },
    {
      "name": "date",
      "label": "Date",
      "type": "date",
      "legacy": {
        "column": "date",
        "fieldId": 68754
      },
      "default": "today"
    },
    {
      "name": "equipment",
      "label": "Equipment",
      "type": "textarea",
      "legacy": {
        "column": "equipment",
        "fieldId": 68757
      }
    },
    {
      "name": "pictures",
      "label": "Pictures",
      "type": "file",
      "legacy": {
        "column": "pictures",
        "fieldId": 71399
      }
    }
  ],
  "rules": [
    {
      "id": 3579,
      "title": "Materials",
      "when": [
        {
          "field": "type",
          "op": "equal",
          "value": "Materials"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "project_id"
        }
      ]
    },
    {
      "id": 3580,
      "title": "Tools",
      "when": [
        {
          "field": "type",
          "op": "equal",
          "value": "Tools"
        }
      ],
      "then": [
        {
          "do": "hide",
          "field": "project_id"
        },
        {
          "do": "clear",
          "field": "project_id"
        }
      ]
    }
  ],
  "legacy": {
    "table": "fx_techsquad_employee_xminventory_checkout"
  }
};
