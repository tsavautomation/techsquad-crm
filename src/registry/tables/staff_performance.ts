// Generated from techsquad_crm_spec.json (WebAuthor table frx_techsquad_staff_performance) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const staffPerformance: TableDef = {
  "name": "staff_performance",
  "label": "Staff Performance",
  "module": "forms",
  "tab": "staff-performance",
  "itemLabel": "Staff Performance",
  "newRecordLabel": "New Staff Performance",
  "titleFormula": "{employee_id} – {date}",
  "fields": [
    {
      "name": "title",
      "label": "Title",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 86721
      },
      "hidden": true,
      "maxLength": 200
    },
    {
      "name": "employee_id",
      "label": "Staff Member",
      "type": "lookup",
      "legacy": {
        "column": "staff_member",
        "fieldId": 86722
      },
      "required": true,
      "lookup": {
        "table": "employees",
        "filter": {
          "status": [
            "Active",
            "Reports"
          ]
        }
      }
    },
    {
      "name": "date",
      "label": "Date",
      "type": "date",
      "legacy": {
        "column": "date",
        "fieldId": 86723
      }
    },
    {
      "name": "type",
      "label": "Type",
      "type": "radio",
      "legacy": {
        "column": "positive_negative",
        "fieldId": 86724
      },
      "options": [
        {
          "label": "Positive",
          "value": "Positive",
          "color": "#4caf50"
        },
        {
          "label": "Negative",
          "value": "Negative",
          "color": "#e91e63"
        }
      ]
    },
    {
      "name": "description",
      "label": "Description",
      "type": "textarea",
      "legacy": {
        "column": "description",
        "fieldId": 86725
      },
      "maxLength": 2500
    },
    {
      "name": "picture",
      "label": "Upload Picture",
      "type": "file",
      "legacy": {
        "column": "upload_picture",
        "fieldId": 86726
      },
      "fileTypes": [
        "jpg",
        "jpeg",
        "png"
      ]
    }
  ],
  "rules": [],
  "legacy": {
    "table": "frx_techsquad_staff_performance"
  }
};
