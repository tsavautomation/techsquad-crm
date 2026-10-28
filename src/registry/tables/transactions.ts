// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_employee_xmpayins) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

const NEW = { column: "", fieldId: 0 };

export const transactions: TableDef = {
  "name": "transactions",
  "label": "Transactions",
  "module": "administrative",
  "tab": "transactions",
  // Confidential: no PDF copy, no uploads, no backup file in OneDrive (Fred 2026-10-13, SPEC §9.1 OD-e).
  "privateFiles": true,
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
      "maxLength": 100,
      // FIN-a: the proposal's title from Portal.io ("Glait Res. - Drapery Tracks") is what tells proposals apart, so it is a list column.
      "listColumn": true
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
    },
    // FIN-a (Fred 2026-10-28, replacing Luana's Sales Projections sheet). Shown by the rules below according to Type.
    // Payment: Amount is what reduces the balance; the card fee and the tip are kept apart and never do.
    { name: "method", label: "Method", type: "select", startsHidden: true, legacy: NEW, options: [
      { label: "Credit Card", value: "Credit Card" }, { label: "ACH", value: "ACH" }, { label: "Zelle", value: "Zelle" }, { label: "Wire", value: "Wire" }, { label: "Check", value: "Check" }, { label: "Cash", value: "Cash" }, { label: "Other", value: "Other" } ] },
    { name: "reference", label: "Reference #", type: "text", maxLength: 60, startsHidden: true, legacy: NEW, help: "Check number, confirmation or processor id." },
    { name: "cc_fee", label: "CC Fee", type: "money", startsHidden: true, legacy: NEW, help: "The 3% the portal charges on a card above $1k, exactly as shown there. Never reduces the balance." },
    { name: "tip", label: "Tip", type: "money", startsHidden: true, legacy: NEW },
    { name: "discount", label: "Discount", type: "money", startsHidden: true, legacy: NEW, help: "Reduces the balance like a payment; listed apart." },
    { name: "payment_no", label: "Payment #", type: "computed", startsHidden: true, legacy: NEW, computed: { kind: "payment_no" } },
    // Invoice (= a Portal.io payment request): the due date is the office's to move when the job slips.
    { name: "due_date", label: "Due Date", type: "date", startsHidden: true, legacy: NEW, help: "Move it when the job slips; the Portal.io sync never changes a date edited here." },
    { name: "invoice_status", label: "Status", type: "select", startsHidden: true, legacy: NEW, options: [
      { label: "Draft", value: "Draft" }, { label: "Submitted", value: "Submitted" }, { label: "Viewed", value: "Viewed" }, { label: "Paid", value: "Paid" }, { label: "Declined", value: "Declined" } ] },
    // Approved Proposal: change orders (Portal.io numbers them <main>CO<n>) hang on their main proposal and add to Approved too.
    { name: "is_change_order", label: "Change order", type: "boolean", startsHidden: true, legacy: NEW, default: false },
    { name: "parent_transaction_id", label: "Main proposal", type: "lookup", lookup: { table: "transactions", filter: { type: ["Proposal"] } }, startsHidden: true, legacy: NEW },
    { name: "sales_tax", label: "Sales Tax", type: "money", startsHidden: true, legacy: NEW },
    { name: "parts_cost", label: "Parts (cost)", type: "money", startsHidden: true, legacy: NEW, help: "Cost × quantity of the equipment and material lines; labor lines stay out." },
  ],
  "rules": [
    // FIN-a: the detail fields follow the Type (hidden, so never required, when Type is something else or hidden).
    { id: 900401, title: "Payment details", when: [{ field: "type", op: "equal", value: "Payment" }], then: ["method", "reference", "cc_fee", "tip", "discount", "payment_no"].map((field) => ({ do: "show" as const, field })) },
    { id: 900402, title: "Invoice details", when: [{ field: "type", op: "equal", value: "Invoice" }], then: ["due_date", "invoice_status"].map((field) => ({ do: "show" as const, field })) },
    { id: 900403, title: "Approved Proposal details", when: [{ field: "type", op: "equal", value: "Proposal" }], then: ["is_change_order", "parent_transaction_id", "sales_tax", "parts_cost"].map((field) => ({ do: "show" as const, field })) },
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
