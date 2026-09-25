// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_employee_xmrma) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const rmas: TableDef = {
  "name": "rmas",
  "label": "RMA",
  "module": "administrative",
  "tab": "rma",
  "itemLabel": "RMA",
  "newRecordLabel": "New RMA",
  "titleFormula": null,
  "fields": [
    {
      "name": "title",
      "label": "Title",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 67586
      },
      "maxLength": 100
    },
    {
      "name": "project_id",
      "label": "Client",
      "type": "lookup",
      "legacy": {
        "column": "fld_client",
        "fieldId": 68470
      },
      "lookup": {
        "table": "projects"
      }
    },
    {
      "name": "manufacturer_id",
      "label": "Manufacturer",
      "type": "lookup",
      "legacy": {
        "column": "manufacturer",
        "fieldId": 67589
      },
      "lookup": {
        "table": "organizations"
      }
    },
    {
      "name": "equipment",
      "label": "Equipment Description or Model #",
      "type": "text",
      "legacy": {
        "column": "equipment_description_or_model",
        "fieldId": 67590
      },
      "maxLength": 100
    },
    {
      "name": "serial_numbers",
      "label": "Serial Number (s)",
      "type": "text",
      "legacy": {
        "column": "serial_number",
        "fieldId": 67591
      },
      "maxLength": 100
    },
    {
      "name": "date_submitted",
      "label": "Date Submitted",
      "type": "date",
      "legacy": {
        "column": "date_submitted",
        "fieldId": 67592
      },
      "default": "today"
    },
    {
      "name": "rma_number",
      "label": "RMA Number",
      "type": "text",
      "legacy": {
        "column": "rma_number",
        "fieldId": 67593
      },
      "maxLength": 50
    },
    {
      "name": "details",
      "label": "Details",
      "type": "textarea",
      "legacy": {
        "column": "details",
        "fieldId": 67719
      },
      "maxLength": 1000
    },
    {
      "name": "status",
      "label": "Status",
      "type": "select",
      "legacy": {
        "column": "status",
        "fieldId": 67720
      },
      "options": [
        {
          "label": "RMA Created",
          "value": "RMA Created",
          "color": "#ffeb3b"
        },
        {
          "label": "Sent to Manufacturer",
          "value": "Sent to Manufacturer",
          "color": "#ff9800"
        },
        {
          "label": "Completed ( received )",
          "value": "Completed ( received )",
          "color": "#8bc34a"
        }
      ]
    },
    {
      "name": "receipt_files",
      "label": "Upload Receipt or Pictures",
      "type": "file",
      "legacy": {
        "column": "rma_receipt",
        "fieldId": 68471
      }
    }
  ],
  "rules": [],
  "legacy": {
    "table": "fx_techsquad_employee_xmrma"
  }
};
