// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_projects_xmpermits) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const permits: TableDef = {
  "name": "permits",
  "label": "Permits",
  "module": "projects",
  "tab": "permits",
  "itemLabel": "Permit",
  "newRecordLabel": "New Permit",
  "titleFormula": "{project_id} – {type} – {status}",
  "fields": [
    {
      "name": "title",
      "label": "Title",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 67438
      },
      "hidden": true,
      "maxLength": 100
    },
    {
      "name": "municipality_id",
      "label": "Municipality",
      "type": "lookup",
      "legacy": {
        "column": "municipality",
        "fieldId": 67717
      },
      "required": true,
      "lookup": {
        "table": "organizations",
        "filter": {
          "type": "Municipality"
        }
      }
    },
    {
      "name": "type",
      "label": "Type",
      "type": "select",
      "legacy": {
        "column": "type",
        "fieldId": 66846
      },
      "required": true,
      "options": [
        {
          "label": "Electrical",
          "value": "Electrical",
          "color": "#ff9800"
        },
        {
          "label": "Low Voltage",
          "value": "Low Voltage",
          "color": "#2196f3"
        }
      ]
    },
    {
      "name": "project_id",
      "label": "Project",
      "type": "lookup",
      "legacy": {
        "column": "project",
        "fieldId": 66847
      },
      "required": true,
      "lookup": {
        "table": "projects",
        "autofill": [
          {
            "from": "job_address",
            "to": "address"
          },
          {
            "from": "job_owner_id",
            "to": "owner_contact_id"
          },
          {
            "from": "owner_contact",
            "to": "owner_phone"
          }
        ],
        "autofillOnlyNonEmpty": true
      }
    },
    {
      "name": "address",
      "label": "Address",
      "type": "address",
      "legacy": {
        "column": "home_address",
        "fieldId": 67439
      },
      "maxLength": 500
    },
    {
      "name": "owner_contact_id",
      "label": "Owner Name",
      "type": "lookup",
      "legacy": {
        "column": "first_name",
        "fieldId": 67440
      },
      "lookup": {
        "table": "contacts"
      }
    },
    {
      "name": "owner_phone",
      "label": "Owner Phone Number",
      "type": "phone",
      "legacy": {
        "column": "owner_phone_number",
        "fieldId": 67442
      },
      "maxLength": 30
    },
    {
      "name": "status",
      "label": "Status",
      "type": "select",
      "legacy": {
        "column": "status",
        "fieldId": 67431
      },
      "options": [
        {
          "label": "Applied",
          "value": "Applied",
          "color": "#03a9f4"
        },
        {
          "label": "Ready for 1st Inspection",
          "value": "Ready for 1st Inspection",
          "color": "#ffff00"
        },
        {
          "label": "Passed Rough",
          "value": "Passed Rough",
          "color": "#ff9800"
        },
        {
          "label": "Passed Final, Done",
          "value": "Passed Final Done",
          "color": "#4caf50"
        },
        {
          "label": "Failed Inspection, Re-schedule",
          "value": "Failed Inspection Re-schedule",
          "color": "#e91e63"
        },
        {
          "label": "Missing Documents",
          "value": "Missing Documents",
          "color": "#9c27b0"
        }
      ]
    },
    {
      "name": "el_permit_number",
      "label": "EL Permit Number",
      "type": "text",
      "legacy": {
        "column": "permit_number",
        "fieldId": 67432
      },
      "maxLength": 100
    },
    {
      "name": "master_permit_number",
      "label": "Master Permit Number",
      "type": "text",
      "legacy": {
        "column": "master_permit_number",
        "fieldId": 67433
      },
      "maxLength": 100
    },
    {
      "name": "expiration_date",
      "label": "Permit Expiration Date",
      "type": "date",
      "legacy": {
        "column": "permit_expiration_date",
        "fieldId": 67434
      }
    },
    {
      "name": "expiration_status",
      "label": "Permit Expiration",
      "type": "select",
      "legacy": {
        "column": "permit_expiration",
        "fieldId": 68728
      },
      "options": [
        {
          "label": "Active",
          "value": "Active",
          "color": "#4caf50"
        },
        {
          "label": "Expired",
          "value": "Expired",
          "color": "#e91e63"
        },
        {
          "label": "Renew Soon",
          "value": "Renew Soon",
          "color": "#ff9800"
        }
      ]
    },
    {
      "name": "permit_card_image",
      "label": "Permit Card ( JPG )",
      "type": "image",
      "legacy": {
        "column": "permit_card",
        "fieldId": 67435
      }
    },
    {
      "name": "permit_card_pdf",
      "label": "Permit Card ( PDF )",
      "type": "file",
      "legacy": {
        "column": "permit_card_pdf",
        "fieldId": 74383
      }
    },
    {
      "name": "notes",
      "label": "Notes",
      "type": "textarea",
      "legacy": {
        "column": "notes",
        "fieldId": 68778
      },
      "maxLength": 1000
    },
    {
      "name": "inspection_files",
      "label": "Inspection Records and Additional Files",
      "type": "file",
      "legacy": {
        "column": "inspection_records_and_additional_files",
        "fieldId": 67437
      }
    }
  ],
  "rules": [],
  "legacy": {
    "table": "fx_techsquad_projects_xmpermits"
  }
};
