// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_employee_xmtasks) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const tasks: TableDef = {
  "name": "tasks",
  "label": "Tasks",
  "module": "administrative",
  "tab": "tasks",
  "itemLabel": "Task",
  "newRecordLabel": "New Task",
  "titleFormula": "{member_id} – {due_date}",
  "fields": [
    {
      "name": "title",
      "label": "Date Created",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 67721
      },
      "hidden": true,
      "maxLength": 50
    },
    {
      "name": "member_id",
      "label": "Member",
      "type": "lookup",
      "legacy": {
        "column": "member",
        "fieldId": 67724
      },
      "lookup": {
        "table": "employees"
      }
    },
    {
      "name": "status",
      "label": "Status",
      "type": "select",
      "legacy": {
        "column": "status",
        "fieldId": 67725
      },
      "options": [
        {
          "label": "Pending",
          "value": "Pending",
          "color": "#f44336"
        },
        {
          "label": "Working",
          "value": "Working",
          "color": "#ffeb3b"
        },
        {
          "label": "Completed",
          "value": "Completed",
          "color": "#4caf50"
        }
      ]
    },
    {
      "name": "details",
      "label": "Details",
      "type": "textarea",
      "legacy": {
        "column": "deatils",
        "fieldId": 67726
      },
      "maxLength": 1000
    },
    {
      "name": "due_date",
      "label": "Due Date",
      "type": "date",
      "legacy": {
        "column": "due_date",
        "fieldId": 68796
      }
    },
    {
      "name": "priority",
      "label": "Priority",
      "type": "select",
      "legacy": {
        "column": "priority",
        "fieldId": 68802
      },
      "options": [
        {
          "label": "ASAP",
          "value": "ASAP",
          "color": "#ff9800"
        },
        {
          "label": "Urgent",
          "value": "Urgent",
          "color": "#f44336"
        }
      ]
    },
    {
      "name": "due_status",
      "label": "Status",
      "type": "select",
      "legacy": {
        "column": "status_1",
        "fieldId": 68797
      },
      "options": [
        {
          "label": "On-Time",
          "value": "On-Time",
          "color": "#4caf50"
        },
        {
          "label": "Due",
          "value": "Due",
          "color": "#e91e63"
        }
      ]
    },
    {
      "name": "files",
      "label": "File Upload",
      "type": "file",
      "legacy": {
        "column": "file_upload",
        "fieldId": 70406
      }
    }
  ],
  "rules": [],
  "legacy": {
    "table": "fx_techsquad_employee_xmtasks"
  }
};
