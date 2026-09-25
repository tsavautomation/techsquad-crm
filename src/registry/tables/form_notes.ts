// Generated from techsquad_crm_spec.json (WebAuthor table frx_techsquad_note) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const formNotes: TableDef = {
  "name": "form_notes",
  "label": "Note",
  "module": "forms",
  "tab": "notes",
  "itemLabel": "Note",
  "newRecordLabel": "New Note",
  "titleFormula": "{project_id} – {note_type}",
  "fields": [
    {
      "name": "title",
      "label": "Title",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 73258
      },
      "hidden": true,
      "maxLength": 200
    },
    {
      "name": "project_id",
      "label": "Project",
      "type": "lookup",
      "legacy": {
        "column": "project",
        "fieldId": 73259
      },
      "lookup": {
        "table": "projects"
      }
    },
    {
      "name": "note_type",
      "label": "Type of Note",
      "type": "radio",
      "legacy": {
        "column": "type_of_note",
        "fieldId": 73260
      },
      "options": [
        {
          "label": "ORDER MATERIAL",
          "value": "ORDER",
          "color": "#ff9800"
        },
        {
          "label": "INFORMATION",
          "value": "INFORMATION",
          "color": "#2196f3"
        },
        {
          "label": "ISSUE",
          "value": "ISSUE",
          "color": "#f44336"
        }
      ]
    },
    {
      "name": "description",
      "label": "Description",
      "type": "textarea",
      "legacy": {
        "column": "description",
        "fieldId": 73261
      },
      "maxLength": 1000
    }
  ],
  "rules": [],
  "legacy": {
    "table": "frx_techsquad_note"
  }
};
