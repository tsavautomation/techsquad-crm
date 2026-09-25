// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_help_desk_support_note) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const supportNotes: TableDef = {
  "name": "support_notes",
  "label": "Support Notes",
  "module": "help-desk",
  "itemLabel": "Support Notes",
  "newRecordLabel": "New Support Notes",
  "parent": {
    "table": "support_tickets",
    "field": "ticket_id"
  },
  "titleFormula": "{note_date} – {status}",
  "fields": [
    {
      "name": "ticket_id",
      "label": "Support Tickets",
      "type": "lookup",
      "required": true,
      "hidden": true,
      "lookup": {
        "table": "support_tickets"
      },
      "legacy": {
        "column": "parent_id",
        "fieldId": 0
      }
    },
    {
      "name": "assigned_to",
      "label": "Assigned to",
      "type": "user",
      "legacy": {
        "column": "assigned_to",
        "fieldId": 67635
      },
      "required": true
    },
    {
      "name": "note_date",
      "label": "Note Date",
      "type": "date",
      "legacy": {
        "column": "note_date",
        "fieldId": 67630
      },
      "required": true,
      "default": "today"
    },
    {
      "name": "note",
      "label": "Note",
      "type": "textarea",
      "legacy": {
        "column": "note",
        "fieldId": 67631
      },
      "required": true,
      "maxLength": 300
    },
    {
      "name": "issue_category",
      "label": "Issue Category",
      "type": "select",
      "legacy": {
        "column": "issue_category",
        "fieldId": 67634
      },
      "required": true,
      "options": [
        {
          "label": "EFS Mod",
          "value": "EFS Mod",
          "color": "#f44336"
        },
        {
          "label": "CRM Issue",
          "value": "CRM Issue",
          "color": "#3f51b5"
        },
        {
          "label": "Hardware",
          "value": "Hardware",
          "color": "#009688"
        },
        {
          "label": "Software",
          "value": "Software",
          "color": "#ffeb3b"
        },
        {
          "label": "Revation Issue",
          "value": "Revation Issue",
          "color": "#e91e63"
        },
        {
          "label": "Login Issue",
          "value": "Login Issue",
          "color": "#2196f3"
        },
        {
          "label": "Tableau Issue",
          "value": "Tableau Issue",
          "color": "#4caf50"
        },
        {
          "label": "Other",
          "value": "Other",
          "color": "#ffc107"
        }
      ]
    },
    {
      "name": "status",
      "label": "Status",
      "type": "select",
      "legacy": {
        "column": "status",
        "fieldId": 67632
      },
      "required": true,
      "options": [
        {
          "label": "Pending",
          "value": "Pending",
          "color": "#3f51b5"
        },
        {
          "label": "Closed",
          "value": "Closed",
          "color": "#4caf50"
        },
        {
          "label": "Send to DEL",
          "value": "Send to DEL",
          "color": "#9c27b0"
        }
      ]
    },
    {
      "name": "closed_date",
      "label": "Closed Date",
      "type": "date",
      "legacy": {
        "column": "closed_date",
        "fieldId": 67633
      },
      "default": "today"
    }
  ],
  "rules": [
    {
      "id": 3395,
      "title": "ShowClosedDate",
      "when": [
        {
          "field": "status",
          "op": "equal",
          "value": "Closed"
        }
      ],
      "then": [
        {
          "do": "require",
          "field": "closed_date"
        }
      ]
    }
  ],
  "legacy": {
    "table": "fx_techsquad_help_desk_support_note"
  }
};
