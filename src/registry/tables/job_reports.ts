// Generated from techsquad_crm_spec.json (WebAuthor table frx_techsquad_job_report) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const jobReports: TableDef = {
  "name": "job_reports",
  "label": "Job Report",
  "module": "forms",
  "tab": "job-reports",
  "itemLabel": "Record",
  "newRecordLabel": "New Record",
  "titleFormula": "{project_id} – {team_ids} – {date}",
  "fields": [
    {
      "name": "title",
      "label": "Title",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 67351
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
        "fieldId": 67711
      },
      "required": true,
      "lookup": {
        "table": "projects"
      }
    },
    {
      "name": "date",
      "label": "Date",
      "type": "date",
      "legacy": {
        "column": "date",
        "fieldId": 68706
      },
      "required": true,
      "default": "today"
    },
    {
      "name": "team_ids",
      "label": "Team",
      "type": "lookup",
      "legacy": {
        "column": "team_1",
        "fieldId": 68814
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
      "name": "tagged_ids",
      "label": "Tag Someone",
      "type": "lookup",
      "legacy": {
        "column": "tag_someone",
        "fieldId": 68760
      },
      "multiple": true,
      "lookup": {
        "table": "employees"
      }
    },
    {
      "name": "vehicle_id",
      "label": "Vehicle",
      "type": "lookup",
      "legacy": {
        "column": "vehicle",
        "fieldId": 69055
      },
      "required": true,
      "lookup": {
        "table": "vehicles",
        "filter": {
          "populate_on_reports": "Yes"
        }
      }
    },
    {
      "name": "report",
      "label": "Report",
      "type": "textarea",
      "legacy": {
        "column": "report",
        "fieldId": 67714
      }
    },
    {
      "name": "pending_1",
      "label": "1 - Pending",
      "type": "textarea",
      "legacy": {
        "column": "pending",
        "fieldId": 68758
      },
      "maxLength": 8000
    },
    {
      "name": "pending_2",
      "label": "2 - Pending",
      "type": "textarea",
      "legacy": {
        "column": "next_pending",
        "fieldId": 77047
      },
      "startsHidden": true,
      "maxLength": 8000
    },
    {
      "name": "pending_3",
      "label": "3 - Pending",
      "type": "textarea",
      "legacy": {
        "column": "next_pendning",
        "fieldId": 77048
      },
      "startsHidden": true,
      "maxLength": 8000
    },
    {
      "name": "pending_4",
      "label": "4 - Pending",
      "type": "textarea",
      "legacy": {
        "column": "fld_4_pending",
        "fieldId": 77110
      },
      "startsHidden": true,
      "maxLength": 8000
    },
    {
      "name": "pending_5",
      "label": "5 - Pending",
      "type": "textarea",
      "legacy": {
        "column": "fld_5_pending",
        "fieldId": 77118
      },
      "startsHidden": true,
      "maxLength": 8000
    },
    {
      "name": "logins_and_passwords",
      "label": "Login and Passwords",
      "type": "textarea",
      "legacy": {
        "column": "login_and_passwords",
        "fieldId": 68950
      },
      "maxLength": 1000,
      "sensitive": true
    },
    {
      "name": "maintenance_plan_service_call",
      "label": "Maintenance Plan Service Call ?",
      "type": "boolean",
      "legacy": {
        "column": "maintenance_plan_service_call",
        "fieldId": 68489
      },
      "default": false
    },
    {
      "name": "files",
      "label": "Upload Files (25MB MAX)",
      "type": "file",
      "legacy": {
        "column": "upload_files",
        "fieldId": 68815
      }
    }
  ],
  "rules": [
    {
      "id": 3822,
      "title": "Reveal Second pending Item",
      "when": [
        {
          "field": "pending_1",
          "op": "not_empty"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "pending_2"
        }
      ]
    },
    {
      "id": 3823,
      "title": "Reveal third pending Item",
      "when": [
        {
          "field": "pending_2",
          "op": "not_empty"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "pending_3"
        }
      ]
    },
    {
      "id": 3827,
      "title": "Reveal forth pending Item",
      "when": [
        {
          "field": "pending_3",
          "op": "not_empty"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "pending_4"
        }
      ]
    },
    {
      "id": 3828,
      "title": "Reveal fifth pending Item",
      "when": [
        {
          "field": "pending_4",
          "op": "not_empty"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "pending_5"
        }
      ]
    }
  ],
  "legacy": {
    "table": "frx_techsquad_job_report"
  }
};
