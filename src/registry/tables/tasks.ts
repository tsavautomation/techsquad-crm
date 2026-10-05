// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_employee_xmtasks) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

const NEW = { column: "", fieldId: 0 };

export const tasks: TableDef = {
  "name": "tasks",
  "label": "Tasks",
  "module": "administrative",
  "tab": "tasks",
  "itemLabel": "Task",
  "newRecordLabel": "New Task",
  "titleFormula": "{member_id} – {due_date}",
  detailAddon: "task",
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
    // F2 (not from WebAuthor): return cards and other project tasks.
    { name: "project_id", label: "Project", type: "lookup", lookup: { table: "projects" }, legacy: NEW },
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
      name: "labels",
      label: "Labels",
      type: "checkboxes",
      options: [
        { label: "Urgent", value: "Urgent", color: "#dc2626" },
        { label: "Material", value: "Material", color: "#d97706" },
        { label: "Client", value: "Client", color: "#2563eb" },
        { label: "Financial", value: "Financial", color: "#16a34a" },
        { label: "Technical", value: "Technical", color: "#7c3aed" },
        { label: "Return", value: "Return", color: "#0891b2" },
        // F19-c: the 3rd report with the same problem on a site raises one of these.
        { label: "Root cause", value: "Root cause", color: "#be123c" },
      ],
      legacy: NEW,
    },
    // F3 (SPEC §9.1 F3-a): seen only by whoever made it and the person it's assigned to.
    { name: "private", label: "Private", type: "boolean", default: false, help: "Only you and the person it's assigned to can see it.", legacy: NEW },
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
    },
    // Set by the return-card automation and by "Schedule return"; shown on the task once filled.
    { name: "job_report_id", label: "From report", type: "lookup", readOnly: true, formHidden: true, lookup: { table: "job_reports" }, legacy: NEW },
    { name: "visit_id", label: "Return visit", type: "lookup", readOnly: true, formHidden: true, lookup: { table: "visits" }, legacy: NEW },
  ],
  "rules": [],
  "legacy": {
    "table": "fx_techsquad_employee_xmtasks"
  }
};
