// Generated from techsquad_crm_spec.json (WebAuthor table frx_techsquad_job_report) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";
import { DURATIONS } from "./visits";

const NEW = { column: "", fieldId: 0 };

/** Why a visit wasn't finished; each has its own return due days in Admin › Field day (SPEC §9.1 F2-a). */
export const REASONS = ["Missing material", "Waiting on GC / builder", "Waiting on client", "Waiting on another trade", "Out of time", "Equipment failure / RMA", "No access", "Other"];
const RETURN_FIELDS = ["partial_reason", "waiting_on", "missing_items", "bring_next", "time_needed", "people_needed", "who_can_ids", "access_info"];

export const jobReports: TableDef = {
  "name": "job_reports",
  "label": "Job Report",
  "module": "forms",
  "tab": "job-reports",
  "itemLabel": "Record",
  "newRecordLabel": "New Report",
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
    // F2 (not from WebAuthor): the visit this report is for; filled by Check out on the Today screen.
    { name: "visit_id", label: "Visit", type: "lookup", lookup: { table: "visits", filter: { project_id: { sameAs: "project_id" } } }, legacy: NEW },
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
    // F2 Field day (not from WebAuthor, SPEC §9.1 F2-b): structured result. "What's missing" replaces Pending 1–5.
    {
      name: "result",
      label: "Result",
      type: "select",
      heading: "Visit result",
      options: [
        { label: "Completed", value: "Completed", color: "#16a34a" },
        { label: "Partial", value: "Partial", color: "#d97706" },
        { label: "Not done", value: "Not done", color: "#dc2626" },
      ],
      legacy: NEW,
    },
    { name: "partial_reason", label: "Reason", type: "select", startsHidden: true, options: REASONS.map((r) => ({ label: r, value: r })), legacy: NEW },
    { name: "waiting_on", label: "Waiting on whom", type: "text", startsHidden: true, maxLength: 200, legacy: NEW },
    { name: "missing_items", label: "What's missing", type: "textarea", startsHidden: true, maxLength: 4000, placeholder: "One item per line", help: "Each line goes on the project checklist and the return card.", legacy: NEW },
    { name: "bring_next", label: "What to bring next time", type: "textarea", startsHidden: true, maxLength: 2000, legacy: NEW },
    { name: "time_needed", label: "Time needed", type: "select", startsHidden: true, options: DURATIONS, legacy: NEW },
    { name: "people_needed", label: "People needed", type: "number", startsHidden: true, legacy: NEW },
    { name: "who_can_ids", label: "Who can do it", type: "lookup", multiple: true, startsHidden: true, lookup: { table: "employees" }, legacy: NEW },
    { name: "access_info", label: "Access info", type: "textarea", startsHidden: true, maxLength: 1000, placeholder: "Gate code, who lets us in, where to park…", legacy: NEW },
    { name: "materials_used", label: "Materials used", type: "textarea", maxLength: 4000, legacy: NEW },
    { name: "problems", label: "Problems found", type: "textarea", maxLength: 4000, legacy: NEW },
    { name: "on_site", label: "Who was on site", type: "text", maxLength: 200, placeholder: "E.g. the owner, the GC's super", legacy: NEW },
    { name: "parking", label: "Parking (where / cost)", type: "text", maxLength: 200, legacy: NEW },
    {
      "name": "pending_1",
      "label": "1 - Pending",
      "type": "textarea",
      "formHidden": true,
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
      "formHidden": true,
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
      "formHidden": true,
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
      "formHidden": true,
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
      "formHidden": true,
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
      "label": "Upload Files",
      "type": "file",
      "legacy": {
        "column": "upload_files",
        "fieldId": 68815
      }
    },
  ],
  "rules": [
    // F2 (SPEC §9.1 F2-b): a partial / not-done visit asks why and what's missing; Completed clears them.
    {
      id: 900201,
      title: "Show return details when not completed",
      when: [{ field: "result", op: "equal", value: "Partial" }, { field: "result", op: "equal", value: "Not done" }],
      then: [...RETURN_FIELDS.map((field) => ({ do: "show" as const, field })), { do: "require", field: "partial_reason" }],
    },
    { id: 900202, title: "What's missing is required when partial", when: [{ field: "result", op: "equal", value: "Partial" }], then: [{ do: "require", field: "missing_items" }] },
    { id: 900203, title: "Clear return details when completed", when: [{ field: "result", op: "equal", value: "Completed" }], then: RETURN_FIELDS.map((field) => ({ do: "clear" as const, field })) },
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
