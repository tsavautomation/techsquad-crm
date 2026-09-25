// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_projects_xmorganizations) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const organizations: TableDef = {
  "name": "organizations",
  "label": "Organizations",
  "module": "projects",
  "tab": "organizations",
  "itemLabel": "Organization",
  "newRecordLabel": "New Organization",
  "titleFormula": null,
  "fields": [
    {
      "name": "title",
      "label": "Organization Name",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 66945
      },
      "maxLength": 50
    },
    {
      "name": "type",
      "label": "Type",
      "type": "select",
      "legacy": {
        "column": "type",
        "fieldId": 66954
      },
      "required": true,
      "options": [
        {
          "label": "Design Firm",
          "value": "Design Firm",
          "color": "#f44336"
        },
        {
          "label": "Commercial Customer",
          "value": "Commercial Customer",
          "color": "#9c27b0"
        },
        {
          "label": "Developer / Builder",
          "value": "Developer Builder",
          "color": "#009688"
        },
        {
          "label": "General Contractor",
          "value": "General Contractor",
          "color": "#3f51b5"
        },
        {
          "label": "Concierge",
          "value": "Concierge",
          "color": "#e91e63"
        },
        {
          "label": "Realtor",
          "value": "Realtor",
          "color": "#ffeb3b"
        },
        {
          "label": "Supplier",
          "value": "Supplier",
          "color": "#2196f3"
        },
        {
          "label": "Municipality",
          "value": "Municipality",
          "color": "#4caf50"
        },
        {
          "label": "Service Provider",
          "value": "Service Provider",
          "color": "#ffc107"
        }
      ]
    },
    {
      "name": "dba_or_legal_name",
      "label": "DBA ( or Legal name )",
      "type": "text",
      "legacy": {
        "column": "dba_or_legal_name",
        "fieldId": 66959
      },
      "maxLength": 50
    },
    {
      "name": "address",
      "label": "Address",
      "type": "address",
      "legacy": {
        "column": "address",
        "fieldId": 66960
      },
      "maxLength": 100
    },
    {
      "name": "main_phone",
      "label": "Main Phone",
      "type": "phone",
      "legacy": {
        "column": "main_phone",
        "fieldId": 66961
      },
      "maxLength": 15
    },
    {
      "name": "main_email",
      "label": "Main Email",
      "type": "email",
      "legacy": {
        "column": "main_email",
        "fieldId": 66962
      },
      "maxLength": 50
    },
    {
      "name": "default_commission_markup",
      "label": "Default Commission / Markup",
      "type": "text",
      "legacy": {
        "column": "default_commission_markup",
        "fieldId": 66963
      },
      "startsHidden": true,
      "maxLength": 20
    },
    {
      "name": "tax_exempt",
      "label": "Tax Exempt ?",
      "type": "boolean",
      "legacy": {
        "column": "tax_exempt",
        "fieldId": 66964
      },
      "startsHidden": true
    },
    {
      "name": "florida_dr13",
      "label": "Florida DR-13",
      "type": "file",
      "legacy": {
        "column": "florida_dr13",
        "fieldId": 66965
      },
      "startsHidden": true
    },
    {
      "name": "coi_file",
      "label": "Certificate of insurance ( COI )",
      "type": "file",
      "legacy": {
        "column": "certificate_of_insurance_coi",
        "fieldId": 66966
      },
      "startsHidden": true
    },
    {
      "name": "dealer_number",
      "label": "Dealer Number",
      "type": "text",
      "legacy": {
        "column": "dealer_number",
        "fieldId": 66973
      },
      "startsHidden": true,
      "maxLength": 20
    },
    {
      "name": "coi_expiration",
      "label": "COI Expiration",
      "type": "date",
      "legacy": {
        "column": "coi_expiration",
        "fieldId": 68770
      }
    },
    {
      "name": "website",
      "label": "Website",
      "type": "url",
      "legacy": {
        "column": "website",
        "fieldId": 66967
      },
      "maxLength": 100
    },
    {
      "name": "portal_login",
      "label": "Login",
      "type": "text",
      "legacy": {
        "column": "login",
        "fieldId": 66968
      },
      "startsHidden": true,
      "maxLength": 100
    },
    {
      "name": "portal_password",
      "label": "Password",
      "type": "text",
      "legacy": {
        "column": "password",
        "fieldId": 66969
      },
      "startsHidden": true,
      "maxLength": 20,
      "sensitive": true
    },
    {
      "name": "dealer_contracts",
      "label": "Contracts, Dealer Application",
      "type": "file",
      "legacy": {
        "column": "contracts_dealer_application",
        "fieldId": 66970
      },
      "startsHidden": true
    },
    {
      "name": "price_sheets",
      "label": "Price Sheets",
      "type": "file",
      "legacy": {
        "column": "price_sheets",
        "fieldId": 66971
      },
      "startsHidden": true
    },
    {
      "name": "catalogs",
      "label": "Product Catalogs and Brochures",
      "type": "file",
      "legacy": {
        "column": "product_catalogs_and_brochures",
        "fieldId": 66972
      },
      "startsHidden": true
    },
    {
      "name": "logo",
      "label": "Logo",
      "type": "image",
      "legacy": {
        "column": "logo",
        "fieldId": 66979
      }
    },
    {
      "name": "details",
      "label": "Details",
      "type": "textarea",
      "legacy": {
        "column": "details",
        "fieldId": 67419
      },
      "maxLength": 1000
    }
  ],
  "rules": [
    {
      "id": 3298,
      "title": "Show Commission",
      "when": [
        {
          "field": "type",
          "op": "equal",
          "value": "Design Firm"
        },
        {
          "field": "type",
          "op": "equal",
          "value": "Developer Builder"
        },
        {
          "field": "type",
          "op": "equal",
          "value": "General Contractor"
        },
        {
          "field": "type",
          "op": "equal",
          "value": "Concierge"
        },
        {
          "field": "type",
          "op": "equal",
          "value": "Realtor"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "default_commission_markup"
        }
      ]
    },
    {
      "id": 3299,
      "title": "Show Website login",
      "when": [
        {
          "field": "type",
          "op": "equal",
          "value": "Supplier"
        },
        {
          "field": "type",
          "op": "equal",
          "value": "Service Provider"
        },
        {
          "field": "type",
          "op": "equal",
          "value": "Municipality"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "portal_login"
        },
        {
          "do": "show",
          "field": "portal_password"
        },
        {
          "do": "hide",
          "field": "default_commission_markup"
        }
      ]
    },
    {
      "id": 3300,
      "title": "Show File Upload",
      "when": [
        {
          "field": "type",
          "op": "equal",
          "value": "Supplier"
        },
        {
          "field": "type",
          "op": "equal",
          "value": "Service Provider"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "dealer_number"
        },
        {
          "do": "show",
          "field": "dealer_contracts"
        },
        {
          "do": "show",
          "field": "price_sheets"
        },
        {
          "do": "show",
          "field": "catalogs"
        }
      ]
    },
    {
      "id": 3301,
      "title": "Type=Municipality",
      "when": [
        {
          "field": "type",
          "op": "equal",
          "value": "Municipality"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "portal_login"
        },
        {
          "do": "show",
          "field": "coi_file"
        },
        {
          "do": "hide",
          "field": "tax_exempt"
        },
        {
          "do": "hide",
          "field": "florida_dr13"
        },
        {
          "do": "hide",
          "field": "default_commission_markup"
        },
        {
          "do": "hide",
          "field": "dealer_contracts"
        },
        {
          "do": "hide",
          "field": "logo"
        },
        {
          "do": "show",
          "field": "portal_password"
        },
        {
          "do": "hide",
          "field": "dealer_number"
        },
        {
          "do": "hide",
          "field": "price_sheets"
        },
        {
          "do": "hide",
          "field": "catalogs"
        },
        {
          "do": "show",
          "field": "coi_expiration"
        }
      ]
    },
    {
      "id": 3302,
      "title": "Show Tax Exempt",
      "when": [
        {
          "field": "type",
          "op": "equal",
          "value": "Design Firm"
        },
        {
          "field": "type",
          "op": "equal",
          "value": "Developer Builder"
        },
        {
          "field": "type",
          "op": "equal",
          "value": "General Contractor"
        },
        {
          "field": "type",
          "op": "equal",
          "value": "Concierge"
        },
        {
          "field": "type",
          "op": "equal",
          "value": "Commercial Customer"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "tax_exempt"
        }
      ]
    },
    {
      "id": 3366,
      "title": "Type=GC-Builder-Designer",
      "when": [
        {
          "field": "type",
          "op": "equal",
          "value": "Developer Builder"
        },
        {
          "field": "type",
          "op": "equal",
          "value": "General Contractor"
        },
        {
          "field": "type",
          "op": "equal",
          "value": "Design Firm"
        }
      ],
      "then": [
        {
          "do": "hide",
          "field": "portal_login"
        },
        {
          "do": "show",
          "field": "coi_file"
        },
        {
          "do": "show",
          "field": "tax_exempt"
        },
        {
          "do": "show",
          "field": "default_commission_markup"
        },
        {
          "do": "hide",
          "field": "dealer_contracts"
        },
        {
          "do": "show",
          "field": "logo"
        },
        {
          "do": "hide",
          "field": "portal_password"
        },
        {
          "do": "hide",
          "field": "dealer_number"
        },
        {
          "do": "hide",
          "field": "catalogs"
        },
        {
          "do": "hide",
          "field": "price_sheets"
        },
        {
          "do": "show",
          "field": "coi_expiration"
        }
      ]
    },
    {
      "id": 3367,
      "title": "Show DR-13 Upload",
      "when": [
        {
          "field": "tax_exempt",
          "op": "equal",
          "value": "1"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "florida_dr13"
        }
      ]
    },
    {
      "id": 3368,
      "title": "Hide DR-13 Upload",
      "when": [
        {
          "field": "tax_exempt",
          "op": "equal",
          "value": "0"
        }
      ],
      "then": [
        {
          "do": "hide",
          "field": "florida_dr13"
        }
      ]
    },
    {
      "id": 3369,
      "title": "Type=Realtor",
      "when": [
        {
          "field": "type",
          "op": "equal",
          "value": "Realtor"
        }
      ],
      "then": [
        {
          "do": "hide",
          "field": "portal_login"
        },
        {
          "do": "hide",
          "field": "coi_file"
        },
        {
          "do": "hide",
          "field": "tax_exempt"
        },
        {
          "do": "show",
          "field": "default_commission_markup"
        },
        {
          "do": "hide",
          "field": "dealer_contracts"
        },
        {
          "do": "show",
          "field": "logo"
        },
        {
          "do": "hide",
          "field": "portal_password"
        },
        {
          "do": "hide",
          "field": "dealer_number"
        },
        {
          "do": "hide",
          "field": "catalogs"
        },
        {
          "do": "hide",
          "field": "price_sheets"
        },
        {
          "do": "hide",
          "field": "coi_expiration"
        }
      ]
    },
    {
      "id": 3584,
      "title": "Type=Supplier",
      "when": [
        {
          "field": "type",
          "op": "equal",
          "value": "Supplier"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "portal_login"
        },
        {
          "do": "hide",
          "field": "coi_file"
        },
        {
          "do": "show",
          "field": "tax_exempt"
        },
        {
          "do": "hide",
          "field": "default_commission_markup"
        },
        {
          "do": "show",
          "field": "dealer_contracts"
        },
        {
          "do": "show",
          "field": "logo"
        },
        {
          "do": "show",
          "field": "portal_password"
        },
        {
          "do": "show",
          "field": "dealer_number"
        },
        {
          "do": "show",
          "field": "catalogs"
        },
        {
          "do": "show",
          "field": "price_sheets"
        },
        {
          "do": "hide",
          "field": "coi_expiration"
        }
      ]
    }
  ],
  "legacy": {
    "table": "fx_techsquad_projects_xmorganizations"
  }
};
