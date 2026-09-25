// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_help_desk) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const supportTickets: TableDef = {
  "name": "support_tickets",
  "label": "Support Tickets",
  "module": "help-desk",
  "tab": "tickets",
  "itemLabel": "Tickets",
  "newRecordLabel": "New Ticket",
  "titleFormula": "#{id} {issue_description}",
  "fields": [
    {
      "name": "title",
      "label": "Title",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 67611
      },
      "hidden": true,
      "maxLength": 200
    },
    {
      "name": "issue_description",
      "label": "Issue Description",
      "type": "textarea",
      "legacy": {
        "column": "issue_description",
        "fieldId": 67621
      },
      "required": true,
      "maxLength": 500,
      "placeholder": "Please explain your issue."
    },
    {
      "name": "error_files",
      "label": "Upload or Paste Error",
      "type": "file",
      "legacy": {
        "column": "upload_error",
        "fieldId": 67627
      }
    },
    {
      "name": "priority",
      "label": "Priority Level",
      "type": "select",
      "legacy": {
        "column": "priority_level",
        "fieldId": 67625
      },
      "required": true,
      "options": [
        {
          "label": "Low",
          "value": "Low",
          "color": "#c5e6c1"
        },
        {
          "label": "Medium",
          "value": "Medium",
          "color": "#2196f3"
        },
        {
          "label": "High",
          "value": "High",
          "color": "#e91e63"
        },
        {
          "label": "Urgent",
          "value": "Urgent",
          "color": "#f44336"
        }
      ]
    },
    {
      "name": "only_me",
      "label": "Are you the only one with this issue?",
      "type": "radio",
      "legacy": {
        "column": "are_you_the_only_one_with_this_issue",
        "fieldId": 67628
      },
      "required": true,
      "options": [
        {
          "label": "Yes",
          "value": "1",
          "color": "#4caf50"
        },
        {
          "label": "No",
          "value": "0",
          "color": "#f44336"
        }
      ],
      "default": "1"
    },
    {
      "name": "status",
      "label": "Status",
      "type": "select",
      "legacy": {
        "column": "status",
        "fieldId": 67622
      },
      "required": true,
      "options": [
        {
          "label": "Pending",
          "value": "Pending",
          "color": "#f44336"
        },
        {
          "label": "In-Progress",
          "value": "In-Progress",
          "color": "#3f51b5"
        },
        {
          "label": "Completed",
          "value": "Completed",
          "color": "#009688"
        }
      ]
    },
    {
      "name": "assigned_to",
      "label": "Assigned To",
      "type": "user",
      "legacy": {
        "column": "assigned_to",
        "fieldId": 67623
      },
      "readOnly": true
    },
    {
      "name": "issue_category",
      "label": "Issue Category",
      "type": "select",
      "legacy": {
        "column": "issue_category",
        "fieldId": 67624
      },
      "options": [
        {
          "label": "EFS Mod",
          "value": "EFS Mod",
          "color": "#8bc34a"
        },
        {
          "label": "CRM Issue",
          "value": "CRM Issue",
          "color": "#e91e63"
        },
        {
          "label": "Hardware",
          "value": "Hardware",
          "color": "#ffc107"
        },
        {
          "label": "Software",
          "value": "Software",
          "color": "#3f51b5"
        },
        {
          "label": "Revation Issue",
          "value": "Revation Issue",
          "color": "#ffeb3b"
        },
        {
          "label": "Login Issue",
          "value": "Login Issue",
          "color": "#2196f3"
        },
        {
          "label": "Tableau Issue",
          "value": "Tableau Issue",
          "color": "#4d664e"
        }
      ]
    },
    {
      "name": "date_closed",
      "label": "Date Closed",
      "type": "date",
      "legacy": {
        "column": "date_closed",
        "fieldId": 67626
      }
    }
  ],
  "rules": [],
  "legacy": {
    "table": "fx_techsquad_help_desk"
  }
};
