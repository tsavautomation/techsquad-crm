// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_projects_xmpunch_list) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const punchListItems: TableDef = {
  "name": "punch_list_items",
  "label": "Punch List",
  "module": "projects",
  "tab": "punch-list",
  "itemLabel": "Item",
  "newRecordLabel": "New Item",
  "submit": {
    "showButton": true,
    "workflow": "punch_list"
  },
  "titleFormula": "{project_id} – {type}",
  "fields": [
    {
      "name": "title",
      "label": "Created",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 67727
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
        "fieldId": 67730
      },
      "lookup": {
        "table": "projects"
      }
    },
    {
      "name": "type",
      "label": "Type",
      "type": "select",
      "legacy": {
        "column": "type",
        "fieldId": 67731
      },
      "options": [
        {
          "label": "RFI ( Request for Information )",
          "value": "RFI ( Request for Information )",
          "color": "#e91e63"
        },
        {
          "label": "Infrastructure",
          "value": "Infrastructure",
          "color": "#ffc107"
        },
        {
          "label": "Installation",
          "value": "Installation",
          "color": "#ffeb3b"
        },
        {
          "label": "Programming",
          "value": "Programming",
          "color": "#9c27b0"
        },
        {
          "label": "Purchase",
          "value": "Purchase",
          "color": "#ffe5ad"
        },
        {
          "label": "Proposal / Change Order",
          "value": "Proposal / Change Order",
          "color": "#2196f3"
        },
        {
          "label": "Engraving",
          "value": "Engraving",
          "color": "#4caf50"
        }
      ]
    },
    {
      "name": "team_member_id",
      "label": "Team",
      "type": "lookup",
      "legacy": {
        "column": "team_1",
        "fieldId": 67733
      },
      "lookup": {
        "table": "employees"
      }
    },
    {
      "name": "details",
      "label": "Details",
      "type": "textarea",
      "legacy": {
        "column": "details",
        "fieldId": 67734
      },
      "maxLength": 1000
    },
    {
      "name": "priority",
      "label": "Priority",
      "type": "select",
      "legacy": {
        "column": "urgency",
        "fieldId": 67735
      },
      "options": [
        {
          "label": "Urgent",
          "value": "Urgent",
          "color": "#f44336"
        },
        {
          "label": "ASAP",
          "value": "ASAP",
          "color": "#ffeb3b"
        },
        {
          "label": "To Be Scheduled",
          "value": "To Be Scheduled",
          "color": "#03a9f4"
        }
      ]
    },
    {
      "name": "due_date",
      "label": "Due Date",
      "type": "date",
      "legacy": {
        "column": "due_date",
        "fieldId": 68792
      }
    },
    {
      "name": "status",
      "label": "Status",
      "type": "select",
      "legacy": {
        "column": "status_1",
        "fieldId": 68794
      },
      "options": [
        {
          "label": "Review",
          "value": "Review",
          "color": "#03a9f4"
        },
        {
          "label": "Scheduled",
          "value": "Scheduled",
          "color": "#ff9800"
        },
        {
          "label": "In Progress",
          "value": "In Progress",
          "color": "#009688"
        },
        {
          "label": "On Hold",
          "value": "On Hold",
          "color": "#ffc107"
        },
        {
          "label": "Completed",
          "value": "Completed",
          "color": "#4caf50"
        },
        {
          "label": "Canceled",
          "value": "Canceled",
          "color": "#f44336"
        }
      ]
    },
    {
      "name": "files",
      "label": "File Upload",
      "type": "file",
      "legacy": {
        "column": "file_upload",
        "fieldId": 70405
      }
    }
  ],
  "rules": [],
  "legacy": {
    "table": "fx_techsquad_projects_xmpunch_list"
  }
};
