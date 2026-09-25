// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_employee_xmpayins) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const transactions: TableDef = {
  "name": "transactions",
  "label": "Transactions",
  "module": "administrative",
  "tab": "transactions",
  "itemLabel": "Transaction",
  "newRecordLabel": "New Transaction",
  "titleFormula": "{payment_type} – {description}",
  "fields": [
    {
      "name": "title",
      "label": "Title",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 68711
      },
      "hidden": true,
      "maxLength": 200
    },
    {
      "name": "payment_type",
      "label": "Payment Type",
      "type": "radio",
      "legacy": {
        "column": "payment_type",
        "fieldId": 69007
      },
      "required": true,
      "options": [
        {
          "label": "Apply to Project",
          "value": "Apply to Project",
          "color": "#e4df94"
        },
        {
          "label": "Pay Individual",
          "value": "Pay Individual",
          "color": "#81c0ec"
        },
        {
          "label": "Pay Organization",
          "value": "Pay Organization",
          "color": "#8fb6ae"
        }
      ]
    },
    {
      "name": "project_id",
      "label": "Apply to Project",
      "type": "lookup",
      "legacy": {
        "column": "project_payin",
        "fieldId": 68715
      },
      "required": true,
      "startsHidden": true,
      "lookup": {
        "table": "projects"
      }
    },
    {
      "name": "type",
      "label": "Type",
      "type": "select",
      "legacy": {
        "column": "payin_type_1",
        "fieldId": 68722
      },
      "required": true,
      "startsHidden": true,
      "options": [
        {
          "label": "Approved Proposal",
          "value": "Proposal",
          "color": "#4caf50"
        },
        {
          "label": "Invoice",
          "value": "Invoice",
          "color": "#ffeb3b"
        },
        {
          "label": "Payment",
          "value": "Payment",
          "color": "#212121"
        },
        {
          "label": "Reimbursement",
          "value": "Reimbursement",
          "color": "#ff9800"
        },
        {
          "label": "Account Credit",
          "value": "Credit",
          "color": "#e91e63"
        }
      ]
    },
    {
      "name": "contact_id",
      "label": "Pay Individual",
      "type": "lookup",
      "legacy": {
        "column": "pay_individual",
        "fieldId": 69008
      },
      "required": true,
      "startsHidden": true,
      "lookup": {
        "table": "contacts"
      }
    },
    {
      "name": "organization_id",
      "label": "Pay Organization",
      "type": "lookup",
      "legacy": {
        "column": "pay_organization",
        "fieldId": 69009
      },
      "required": true,
      "startsHidden": true,
      "lookup": {
        "table": "organizations"
      }
    },
    {
      "name": "reason",
      "label": "Reason",
      "type": "radio",
      "legacy": {
        "column": "reason",
        "fieldId": 69012
      },
      "required": true,
      "startsHidden": true,
      "options": [
        {
          "label": "Commission",
          "value": "Commission",
          "color": "#ffeb3b"
        },
        {
          "label": "Services or Goods",
          "value": "Services or Goods",
          "color": "#ffcdd2"
        },
        {
          "label": "Reimbursement",
          "value": "Reimbursement",
          "color": "#e91e63"
        }
      ]
    },
    {
      "name": "description",
      "label": "Description",
      "type": "text",
      "legacy": {
        "column": "description",
        "fieldId": 68777
      },
      "required": true,
      "maxLength": 100
    },
    {
      "name": "portal_number",
      "label": "Portal Proposal or Invoice #",
      "type": "text",
      "legacy": {
        "column": "portal_proposal",
        "fieldId": 68716
      },
      "startsHidden": true,
      "maxLength": 10
    },
    {
      "name": "amount",
      "label": "Amount",
      "type": "money",
      "legacy": {
        "column": "amount",
        "fieldId": 68717
      },
      "required": true
    },
    {
      "name": "date",
      "label": "Date",
      "type": "date",
      "legacy": {
        "column": "date",
        "fieldId": 68732
      },
      "default": "today"
    },
    {
      "name": "pdf",
      "label": "PDF",
      "type": "file",
      "legacy": {
        "column": "proposal_pdf",
        "fieldId": 68718
      }
    }
  ],
  "rules": [
    {
      "id": 3476,
      "title": "Apply to Project",
      "when": [
        {
          "field": "payment_type",
          "op": "equal",
          "value": "Apply to Project"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "type"
        },
        {
          "do": "show",
          "field": "portal_number"
        },
        {
          "do": "hide",
          "field": "contact_id"
        },
        {
          "do": "hide",
          "field": "organization_id"
        },
        {
          "do": "hide",
          "field": "reason"
        },
        {
          "do": "show",
          "field": "project_id"
        }
      ]
    },
    {
      "id": 3477,
      "title": "Pay Individual",
      "when": [
        {
          "field": "payment_type",
          "op": "equal",
          "value": "Pay Individual"
        }
      ],
      "then": [
        {
          "do": "hide",
          "field": "organization_id"
        },
        {
          "do": "hide",
          "field": "portal_number"
        },
        {
          "do": "show",
          "field": "contact_id"
        },
        {
          "do": "show",
          "field": "reason"
        },
        {
          "do": "hide",
          "field": "project_id"
        },
        {
          "do": "hide",
          "field": "type"
        }
      ]
    },
    {
      "id": 3478,
      "title": "Pay Organization",
      "when": [
        {
          "field": "payment_type",
          "op": "equal",
          "value": "Pay Organization"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "organization_id"
        },
        {
          "do": "hide",
          "field": "portal_number"
        },
        {
          "do": "hide",
          "field": "contact_id"
        },
        {
          "do": "show",
          "field": "reason"
        },
        {
          "do": "hide",
          "field": "project_id"
        },
        {
          "do": "hide",
          "field": "type"
        }
      ]
    }
  ],
  "legacy": {
    "table": "fx_techsquad_employee_xmpayins"
  }
};
