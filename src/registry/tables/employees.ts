// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_employee) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const employees: TableDef = {
  "name": "employees",
  "label": "Employees",
  "module": "administrative",
  "tab": "employees",
  "itemLabel": "Employees",
  "newRecordLabel": "New Employee",
  "titleFormula": "{first_name} {last_name}",
  "fields": [
    {
      "name": "title",
      "label": "Title",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 66980
      },
      "hidden": true,
      "maxLength": 200
    },
    {
      "name": "first_name",
      "label": "First Name",
      "type": "text",
      "legacy": {
        "column": "first_name",
        "fieldId": 67329
      },
      "required": true,
      "maxLength": 30
    },
    {
      "name": "last_name",
      "label": "Last Name",
      "type": "text",
      "legacy": {
        "column": "last_name",
        "fieldId": 67330
      },
      "required": true,
      "maxLength": 30
    },
    {
      "name": "departments",
      "label": "Department",
      "type": "checkboxes",
      "legacy": {
        "column": "department",
        "fieldId": 75099
      },
      "required": true,
      "options": [
        {
          "label": "LOW VOLTAGE",
          "value": "LOW VOLTAGE",
          "color": "#2196f3"
        },
        {
          "label": "ELECTRICAL",
          "value": "ELECTRICAL",
          "color": "#141cff"
        }
      ],
      "multiple": true
    },
    {
      "name": "status",
      "label": "Status",
      "type": "select",
      "legacy": {
        "column": "status",
        "fieldId": 68812
      },
      "required": true,
      "options": [
        {
          "label": "Active",
          "value": "Active",
          "color": "#c5e6c1"
        },
        {
          "label": "Active + Reports",
          "value": "Reports",
          "color": "#0f6c12"
        },
        {
          "label": "Inactive",
          "value": "Inactive",
          "color": "#e91e63"
        },
        {
          "label": "Freelance",
          "value": "Freelance",
          "color": "#ffeb3b"
        }
      ]
    },
    {
      "name": "date_of_birth",
      "label": "Date of Birth",
      "type": "date",
      "legacy": {
        "column": "date_of_birth",
        "fieldId": 67331
      },
      "notFuture": true
    },
    {
      "name": "home_address",
      "label": "Home Address",
      "type": "address",
      "legacy": {
        "column": "home_address",
        "fieldId": 67334
      },
      "maxLength": 500
    },
    {
      "name": "email",
      "label": "Email",
      "type": "email",
      "legacy": {
        "column": "email",
        "fieldId": 67335
      },
      "maxLength": 100
    },
    {
      "name": "phone",
      "label": "Phone Number",
      "type": "phone",
      "legacy": {
        "column": "phone_number",
        "fieldId": 67332
      },
      "maxLength": 30
    },
    {
      "name": "drivers_license_file",
      "label": "Drivers License",
      "type": "file",
      "legacy": {
        "column": "drivers_license",
        "fieldId": 67336
      },
      "fileTypes": [
        "jpg",
        "jpeg",
        "png",
        "pdf"
      ]
    },
    {
      "name": "dl_expiration",
      "label": "D/L Expiration",
      "type": "date",
      "legacy": {
        "column": "dl_expiration",
        "fieldId": 67342
      }
    },
    {
      "name": "dl_status",
      "label": "D/L Status",
      "type": "select",
      "legacy": {
        "column": "dl_status_1",
        "fieldId": 68727
      },
      "options": [
        {
          "label": "Active",
          "value": "Active",
          "color": "#4caf50"
        },
        {
          "label": "Expired",
          "value": "Expired",
          "color": "#f44336"
        }
      ]
    },
    {
      "name": "employment_type",
      "label": "Type",
      "type": "radio",
      "legacy": {
        "column": "type_1",
        "fieldId": 67338
      },
      "required": true,
      "options": [
        {
          "label": "1099 Sub",
          "value": "1099 Sub",
          "color": "#f44336"
        },
        {
          "label": "W2 Employee",
          "value": "W2 Employee",
          "color": "#3f51b5"
        }
      ]
    },
    {
      "name": "ssn",
      "label": "Social Security Number",
      "type": "ssn",
      "legacy": {
        "column": "ssn",
        "fieldId": 67333
      },
      "maxLength": 9,
      "sensitive": true
    },
    {
      "name": "company_name",
      "label": "Company Name",
      "type": "text",
      "legacy": {
        "column": "company_name",
        "fieldId": 67339
      },
      "maxLength": 100
    },
    {
      "name": "workers_comp_certificate",
      "label": "Workers' Comp Exemption Certificate",
      "type": "file",
      "legacy": {
        "column": "workers_comp_exemption_certificate",
        "fieldId": 67340
      }
    },
    {
      "name": "ein",
      "label": "EIN#",
      "type": "ein",
      "legacy": {
        "column": "sunbiz",
        "fieldId": 75102
      },
      "maxLength": 30
    },
    {
      "name": "workers_comp_expiration",
      "label": "Workers' Comp Exemption Expiration",
      "type": "date",
      "legacy": {
        "column": "workers_comp_exemption_expiration",
        "fieldId": 67341
      }
    },
    {
      "name": "start_date",
      "label": "Effective Start Date",
      "type": "date",
      "legacy": {
        "column": "effective_start_date",
        "fieldId": 68484
      }
    },
    {
      "name": "termination_date",
      "label": "Termination Date",
      "type": "date",
      "legacy": {
        "column": "termination_date",
        "fieldId": 68485
      }
    }
  ],
  "rules": [
    {
      "id": 3464,
      "title": "Employee DL Expiration Alert",
      "when": [
        {
          "field": "dl_expiration",
          "op": "date_before_today"
        }
      ],
      "then": [
        {
          "do": "set",
          "field": "dl_status",
          "value": "Expired"
        }
      ]
    }
  ],
  "legacy": {
    "table": "fx_techsquad_employee"
  }
};
