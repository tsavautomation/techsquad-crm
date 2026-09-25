// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_employee_xmpayouts) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const payouts: TableDef = {
  "name": "payouts",
  "label": "Payroll",
  "module": "administrative",
  "tab": "payroll",
  "itemLabel": "Payment",
  "newRecordLabel": "New Payment",
  "titleFormula": "{employee_id} – {reason} – {date_issued}",
  "fields": [
    {
      "name": "title",
      "label": "Title",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 67366
      },
      "hidden": true,
      "maxLength": 100
    },
    {
      "name": "employee_id",
      "label": "Employee",
      "type": "lookup",
      "legacy": {
        "column": "employee",
        "fieldId": 69006
      },
      "lookup": {
        "table": "employees"
      }
    },
    {
      "name": "reason",
      "label": "Reason",
      "type": "select",
      "legacy": {
        "column": "reason",
        "fieldId": 67372
      },
      "required": true,
      "options": [
        {
          "label": "Scheduled Salary or Compensation",
          "value": "Scheduled Salary or Compensation",
          "color": "#ff9800"
        },
        {
          "label": "Salary Advance",
          "value": "Salary Advance",
          "color": "#4caf50"
        },
        {
          "label": "Loan",
          "value": "Loan",
          "color": "#2196f3"
        },
        {
          "label": "Commission",
          "value": "Commission",
          "color": "#ffeb3b"
        },
        {
          "label": "Reimbursement",
          "value": "Reimbursement",
          "color": "#e91e63"
        }
      ]
    },
    {
      "name": "amount",
      "label": "Amount",
      "type": "money",
      "legacy": {
        "column": "amount",
        "fieldId": 67373
      }
    },
    {
      "name": "date_issued",
      "label": "Date Issued",
      "type": "date",
      "legacy": {
        "column": "date_issued",
        "fieldId": 67377
      },
      "default": "today"
    },
    {
      "name": "payment_method",
      "label": "Method of payment",
      "type": "select",
      "legacy": {
        "column": "method_of_payment",
        "fieldId": 67374
      },
      "options": [
        {
          "label": "Check",
          "value": "Check",
          "color": "#ff9800"
        },
        {
          "label": "Zelle or wire transfer",
          "value": "Zelle or wire transfer",
          "color": "#9c27b0"
        },
        {
          "label": "Cash",
          "value": "Cash",
          "color": "#03a9f4"
        }
      ]
    },
    {
      "name": "check_number",
      "label": "Check Number",
      "type": "number",
      "legacy": {
        "column": "check_number",
        "fieldId": 67375
      },
      "startsHidden": true
    },
    {
      "name": "receipt",
      "label": "Check image or electronic receipt",
      "type": "file",
      "legacy": {
        "column": "check_image_or_electronic_receipt",
        "fieldId": 67376
      }
    },
    {
      "name": "details",
      "label": "Details ( Optional )",
      "type": "textarea",
      "legacy": {
        "column": "details_optional",
        "fieldId": 67381
      },
      "maxLength": 1000
    }
  ],
  "rules": [
    {
      "id": 3364,
      "title": "If Method=Check",
      "when": [
        {
          "field": "payment_method",
          "op": "equal",
          "value": "Check"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "check_number"
        }
      ]
    },
    {
      "id": 3365,
      "title": "If Method=Cash or Transfer",
      "when": [
        {
          "field": "payment_method",
          "op": "not_equal",
          "value": "Check"
        }
      ],
      "then": [
        {
          "do": "hide",
          "field": "check_number"
        }
      ]
    },
    {
      "id": 3600,
      "title": "Reason is Payroll",
      "when": [
        {
          "field": "reason",
          "op": "equal",
          "value": "Scheduled Salary or Compensation"
        },
        {
          "field": "reason",
          "op": "equal",
          "value": "Salary Advance"
        },
        {
          "field": "reason",
          "op": "equal",
          "value": "Loan"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "employee_id"
        },
        {
          "do": "show",
          "field": "amount"
        }
      ],
      "dropped": [
        "action \"[hide-field] Type\" (field not found)",
        "action \"[hide-field] Individual\" (field not found)",
        "action \"[hide-field] Organization\" (field not found)",
        "action \"[clear-value] Individual\" (field not found)",
        "action \"[clear-value] Organization\" (field not found)",
        "action \"[clear-value] Type\" (field not found)"
      ]
    }
  ],
  "legacy": {
    "table": "fx_techsquad_employee_xmpayouts"
  }
};
