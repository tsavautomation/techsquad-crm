// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_projects_xmcontacts_interactions) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const contactInteractions: TableDef = {
  "name": "contact_interactions",
  "label": "Interactions",
  "module": "projects",
  "itemLabel": "Record",
  "newRecordLabel": "New Record",
  "parent": {
    "table": "contacts",
    "field": "contact_id"
  },
  "titleFormula": "{type} – {date}",
  "fields": [
    {
      "name": "contact_id",
      "label": "Contacts",
      "type": "lookup",
      "required": true,
      "hidden": true,
      "lookup": {
        "table": "contacts"
      },
      "legacy": {
        "column": "parent_id",
        "fieldId": 0
      }
    },
    {
      "name": "title",
      "label": "Title",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 76836
      },
      "required": true,
      "readOnly": true,
      "hidden": true,
      "default": "0",
      "maxLength": 200
    },
    {
      "name": "type",
      "label": "Type",
      "type": "radio",
      "legacy": {
        "column": "type",
        "fieldId": 76845
      },
      "options": [
        {
          "label": "Phone Call",
          "value": "Phone Call",
          "color": "#03a9f4"
        },
        {
          "label": "Email",
          "value": "Email",
          "color": "#3f51b5"
        },
        {
          "label": "Text",
          "value": "Text",
          "color": "#4caf50"
        },
        {
          "label": "In Person",
          "value": "In Person",
          "color": "#ff9800"
        }
      ]
    },
    {
      "name": "date",
      "label": "Date",
      "type": "date",
      "legacy": {
        "column": "date",
        "fieldId": 76846
      },
      "default": "today"
    },
    {
      "name": "result",
      "label": "Result",
      "type": "select",
      "legacy": {
        "column": "result",
        "fieldId": 76847
      },
      "options": [
        {
          "label": "No Answer",
          "value": "No Answer",
          "color": "#ff9800"
        },
        {
          "label": "Voicemail",
          "value": "Voicemail",
          "color": "#009688"
        },
        {
          "label": "Interested",
          "value": "Interested",
          "color": "#8bc34a"
        }
      ]
    },
    {
      "name": "follow_up_date",
      "label": "Follow Up Date",
      "type": "date",
      "legacy": {
        "column": "follow_up_date",
        "fieldId": 76848
      }
    }
  ],
  "rules": [],
  "legacy": {
    "table": "fx_techsquad_projects_xmcontacts_interactions"
  }
};
