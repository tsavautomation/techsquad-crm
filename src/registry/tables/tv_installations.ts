// Generated from techsquad_crm_spec.json (WebAuthor table frx_techsquad_tv_installation) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const tvInstallations: TableDef = {
  "name": "tv_installations",
  "label": "TV Installation",
  "module": "forms",
  "tab": "tv-installations",
  "itemLabel": "Installations",
  "newRecordLabel": "New Installation",
  "titleFormula": "{project_id} – {room_area}",
  "fields": [
    {
      "name": "title",
      "label": "Title",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 67358
      },
      "hidden": true,
      "maxLength": 200
    },
    {
      "name": "date",
      "label": "Date",
      "type": "date",
      "legacy": {
        "column": "date",
        "fieldId": 69062
      },
      "heading": "INSTALLATION AND EQUIPMENT CONDITION FORM",
      "default": "today"
    },
    {
      "name": "project_id",
      "label": "Project",
      "type": "lookup",
      "legacy": {
        "column": "project",
        "fieldId": 69063
      },
      "required": true,
      "lookup": {
        "table": "projects"
      }
    },
    {
      "name": "room_area",
      "label": "Room / Area",
      "type": "text",
      "legacy": {
        "column": "room_area",
        "fieldId": 69064
      },
      "required": true,
      "maxLength": 100,
      "placeholder": "Ex: Living Room"
    },
    {
      "name": "brand_and_model",
      "label": "Brand and Model Number",
      "type": "text",
      "legacy": {
        "column": "brand_and_model_number",
        "fieldId": 69065
      },
      "required": true,
      "maxLength": 100,
      "placeholder": "Ex: Samsung QN65Q80"
    },
    {
      "name": "serial_number",
      "label": "Serial Number",
      "type": "text",
      "legacy": {
        "column": "serial_number",
        "fieldId": 69066
      },
      "required": true,
      "maxLength": 100
    },
    {
      "name": "team_ids",
      "label": "Team",
      "type": "lookup",
      "legacy": {
        "column": "team",
        "fieldId": 69067
      },
      "required": true,
      "multiple": true,
      "lookup": {
        "table": "employees",
        "filter": {
          "status": "Reports"
        }
      }
    },
    {
      "name": "pictures",
      "label": "Pictures",
      "type": "file",
      "legacy": {
        "column": "pictures",
        "fieldId": 69069
      },
      "required": true
    },
    {
      "name": "validated_by",
      "label": "Validated by",
      "type": "text",
      "legacy": {
        "column": "disclaimer",
        "fieldId": 69070
      },
      "required": true,
      "heading": "INSTALLATION AND EQUIPMENT CONDITION FORM",
      "maxLength": 50
    },
    {
      "name": "email",
      "label": "Email",
      "type": "email",
      "legacy": {
        "column": "email",
        "fieldId": 69073
      },
      "required": true,
      "maxLength": 100
    },
    {
      "name": "signature",
      "label": "Signature",
      "type": "signature",
      "legacy": {
        "column": "signature",
        "fieldId": 69074
      },
      "required": true
    }
  ],
  "rules": [],
  "legacy": {
    "table": "frx_techsquad_tv_installation"
  }
};
