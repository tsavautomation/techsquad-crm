// Generated from techsquad_crm_spec.json (WebAuthor table frx_techsquad_staff_performance) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
// P2 (SPEC §9.1 P2-c): Aspect, Weight and the Project / Visit it happened on feed the performance score.
import type { TableDef } from "../types";

export const staffPerformance: TableDef = {
  "name": "staff_performance",
  "label": "Staff Performance",
  "module": "forms",
  "tab": "staff-performance",
  // Permission-protected; OneDrive is open to everyone, so nothing of it goes there (Fred 2026-10-06, SPEC §9.1 OD-e).
  "privateFiles": true,
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
      "name": "aspect",
      "label": "Aspect",
      "type": "select",
      "legacy": { "column": "", "fieldId": 0 },
      "help": "What this is about. Each aspect has its own score on the employee's page.",
      "options": [
        { "label": "Speed", "value": "Speed" },
        { "label": "Quality of work", "value": "Quality of work" },
        { "label": "Punctuality", "value": "Punctuality" },
        { "label": "Communication", "value": "Communication" },
        { "label": "Safety", "value": "Safety" },
        { "label": "Teamwork", "value": "Teamwork" },
        { "label": "Customer care", "value": "Customer care" },
        { "label": "Initiative", "value": "Initiative" }
      ]
    },
    {
      "name": "weight",
      "label": "Weight",
      "type": "radio",
      "legacy": { "column": "", "fieldId": 0 },
      "default": "Normal",
      "help": "How much it counts: Minor 1, Normal 2, Major 3 (×5 points on the score).",
      "options": [
        { "label": "Minor", "value": "Minor" },
        { "label": "Normal", "value": "Normal" },
        { "label": "Major", "value": "Major" }
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
      "name": "project_id",
      "label": "Project",
      "type": "lookup",
      "legacy": { "column": "", "fieldId": 0 },
      "lookup": { "table": "projects" }
    },
    {
      "name": "visit_id",
      "label": "Visit",
      "type": "lookup",
      "legacy": { "column": "", "fieldId": 0 },
      "lookup": { "table": "visits" }
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
