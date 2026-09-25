// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_employee_xmfleet) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const vehicles: TableDef = {
  "name": "vehicles",
  "label": "Fleet",
  "module": "administrative",
  "tab": "vehicles",
  "itemLabel": "Vehicle",
  "newRecordLabel": "New Vehicle",
  "titleFormula": "{year} {make_and_model} ({tag_number})",
  "fields": [
    {
      "name": "populate_on_reports",
      "label": "Populate on Reports",
      "type": "radio",
      "legacy": {
        "column": "populate_on_reports",
        "fieldId": 69079
      },
      "options": [
        {
          "label": "Yes",
          "value": "Yes",
          "color": "#c5e6c1"
        },
        {
          "label": "No",
          "value": "No",
          "color": "#ff6e40"
        }
      ]
    },
    {
      "name": "year",
      "label": "Year",
      "type": "number",
      "legacy": {
        "column": "year",
        "fieldId": 67385
      }
    },
    {
      "name": "make_and_model",
      "label": "Make and Model",
      "type": "text",
      "legacy": {
        "column": "make_and_model",
        "fieldId": 67386
      },
      "maxLength": 50
    },
    {
      "name": "tag_number",
      "label": "Tag #",
      "type": "text",
      "legacy": {
        "column": "tag",
        "fieldId": 67387
      },
      "maxLength": 20
    },
    {
      "name": "vin",
      "label": "VIN#",
      "type": "text",
      "legacy": {
        "column": "vin",
        "fieldId": 67388
      },
      "maxLength": 17
    },
    {
      "name": "insurance_card",
      "label": "Insurance Card",
      "type": "image",
      "legacy": {
        "column": "insurance_card_1_2",
        "fieldId": 67398
      }
    },
    {
      "name": "fl_registration",
      "label": "FL Registration",
      "type": "image",
      "legacy": {
        "column": "fl_registration",
        "fieldId": 67397
      }
    },
    {
      "name": "photo",
      "label": "Vehicle",
      "type": "image",
      "legacy": {
        "column": "vehicle",
        "fieldId": 67401
      }
    },
    {
      "name": "maintenance_records",
      "label": "Maintenance Records, Invoices, Receipts",
      "type": "file",
      "legacy": {
        "column": "maintenance_records_invoices_receipts",
        "fieldId": 67393
      }
    },
    {
      "name": "dmv_title",
      "label": "DMV Title",
      "type": "file",
      "legacy": {
        "column": "title_1",
        "fieldId": 67392
      }
    }
  ],
  "rules": [],
  "legacy": {
    "table": "fx_techsquad_employee_xmfleet"
  }
};
