// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_projects_xmbuildings) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const buildings: TableDef = {
  "name": "buildings",
  "label": "Buildings / Developments",
  "module": "projects",
  "tab": "buildings",
  "itemLabel": "Building",
  "newRecordLabel": "New Building",
  "titleFormula": null,
  "fields": [
    {
      "name": "title",
      "label": "Building / Developement",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 66823
      },
      "required": true,
      "maxLength": 50
    },
    {
      "name": "address",
      "label": "Address",
      "type": "address",
      "legacy": {
        "column": "home_address",
        "fieldId": 67423
      },
      "maxLength": 100
    },
    {
      "name": "work_hours",
      "label": "Work Hours",
      "type": "text",
      "legacy": {
        "column": "work_hours_1",
        "fieldId": 67445
      },
      "maxLength": 30
    },
    {
      "name": "details",
      "label": "Details",
      "type": "textarea",
      "legacy": {
        "column": "details",
        "fieldId": 67427
      },
      "maxLength": 1000
    },
    {
      "name": "website",
      "label": "Website",
      "type": "url",
      "legacy": {
        "column": "website",
        "fieldId": 67426
      },
      "maxLength": 300
    },
    {
      "name": "coi_file",
      "label": "Certificate of Insurance ( COI )",
      "type": "file",
      "legacy": {
        "column": "upload_coi",
        "fieldId": 67430
      }
    },
    {
      "name": "coi_expiration",
      "label": "COI Expiration",
      "type": "date",
      "legacy": {
        "column": "coi_expiration",
        "fieldId": 68475
      }
    },
    {
      "name": "picture",
      "label": "Picture",
      "type": "image",
      "legacy": {
        "column": "picture",
        "fieldId": 67429
      }
    },
    {
      "name": "coi_status",
      "label": "COI Status",
      "type": "select",
      "legacy": {
        "column": "coi_status",
        "fieldId": 68729
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
          "color": "#f44336"
        }
      ]
    },
    {
      "name": "admin_name",
      "label": "Building Admin",
      "type": "text",
      "legacy": {
        "column": "admin_name",
        "fieldId": 68477
      },
      "heading": "Administrative Office",
      "maxLength": 30
    },
    {
      "name": "admin_phone",
      "label": "Admin Phone",
      "type": "phone",
      "legacy": {
        "column": "phone_number_main",
        "fieldId": 67424
      },
      "maxLength": 30
    },
    {
      "name": "admin_email",
      "label": "Email",
      "type": "email",
      "legacy": {
        "column": "email",
        "fieldId": 67425
      },
      "maxLength": 100
    },
    {
      "name": "receiving_agent",
      "label": "Receiving Agent",
      "type": "text",
      "legacy": {
        "column": "receiving_agent",
        "fieldId": 68478
      },
      "heading": "Receiving Office",
      "maxLength": 30
    },
    {
      "name": "receiving_phone",
      "label": "Receiving Phone",
      "type": "phone",
      "legacy": {
        "column": "phone_number_alternate",
        "fieldId": 67428
      },
      "maxLength": 30
    },
    {
      "name": "receiving_email",
      "label": "Email",
      "type": "email",
      "legacy": {
        "column": "email_1_2",
        "fieldId": 68482
      },
      "maxLength": 100
    },
    {
      "name": "front_desk_contact",
      "label": "Contact",
      "type": "text",
      "legacy": {
        "column": "front_desk_or_engineering",
        "fieldId": 68479
      },
      "heading": "Front Desk / Engineering",
      "maxLength": 50
    },
    {
      "name": "front_desk_phone",
      "label": "Front Desk Phone",
      "type": "phone",
      "legacy": {
        "column": "front_desk_phone",
        "fieldId": 68480
      },
      "maxLength": 30
    },
    {
      "name": "front_desk_email",
      "label": "Email",
      "type": "email",
      "legacy": {
        "column": "email_1",
        "fieldId": 68481
      },
      "maxLength": 100
    }
  ],
  "rules": [],
  "legacy": {
    "table": "fx_techsquad_projects_xmbuildings"
  }
};
