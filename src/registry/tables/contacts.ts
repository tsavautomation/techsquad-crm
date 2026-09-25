// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_projects_xmcontacts) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const contacts: TableDef = {
  "name": "contacts",
  "label": "Contacts",
  "module": "projects",
  "tab": "contacts",
  "itemLabel": "Contact",
  "newRecordLabel": "New Contact",
  "titleFormula": "{first_name} {last_name}",
  "fields": [
    {
      "name": "title",
      "label": "Title",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 68115
      },
      "hidden": true,
      "maxLength": 200
    },
    {
      "name": "type",
      "label": "Type",
      "type": "select",
      "legacy": {
        "column": "type",
        "fieldId": 66896
      },
      "required": true,
      "options": [
        {
          "label": "End Customer",
          "value": "End Customer",
          "color": "#c8bbcd"
        },
        {
          "label": "Designer",
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
          "label": "Service Provider",
          "value": "Service Provider",
          "color": "#ffc107"
        }
      ],
      "default": "End Customer"
    },
    {
      "name": "first_name",
      "label": "First Name",
      "type": "text",
      "legacy": {
        "column": "first_name",
        "fieldId": 66826
      },
      "required": true,
      "maxLength": 40
    },
    {
      "name": "last_name",
      "label": "Last Name",
      "type": "text",
      "legacy": {
        "column": "last_name",
        "fieldId": 66827
      },
      "maxLength": 40
    },
    {
      "name": "organization_id",
      "label": "Organization Name",
      "type": "lookup",
      "legacy": {
        "column": "organization_name",
        "fieldId": 66957
      },
      "startsHidden": true,
      "lookup": {
        "table": "organizations",
        "filter": {
          "type": {
            "sameAs": "type"
          }
        }
      }
    },
    {
      "name": "role_position",
      "label": "Role / Position",
      "type": "text",
      "legacy": {
        "column": "role_position",
        "fieldId": 66925
      },
      "startsHidden": true,
      "maxLength": 100
    },
    {
      "name": "alias_dba",
      "label": "Alias / DBA",
      "type": "text",
      "legacy": {
        "column": "alias_dba",
        "fieldId": 66934
      },
      "maxLength": 100
    },
    {
      "name": "address",
      "label": "Address",
      "type": "address",
      "legacy": {
        "column": "home_address",
        "fieldId": 66903
      },
      "maxLength": 500
    },
    {
      "name": "main_phone",
      "label": "Main Phone",
      "type": "phone",
      "legacy": {
        "column": "main_phone",
        "fieldId": 66897
      },
      "maxLength": 20
    },
    {
      "name": "phone_extension",
      "label": "Phone Ext",
      "type": "text",
      "legacy": {
        "column": "phone_extension",
        "fieldId": 68476
      },
      "maxLength": 10
    },
    {
      "name": "intl_phone",
      "label": "Intl Phone",
      "type": "text",
      "legacy": {
        "column": "intl_phone",
        "fieldId": 68689
      },
      "maxLength": 20,
      "pattern": "^[0-9+\\-() ]{1,20}$"
    },
    {
      "name": "email",
      "label": "Email",
      "type": "email",
      "legacy": {
        "column": "email",
        "fieldId": 66845
      },
      "maxLength": 50
    },
    {
      "name": "has_alternate_contact",
      "label": "Alternate Contact ?",
      "type": "boolean",
      "legacy": {
        "column": "secretary_or_concierge",
        "fieldId": 66902
      }
    },
    {
      "name": "alternate_name",
      "label": "Alternate Name",
      "type": "textarea",
      "legacy": {
        "column": "concierge",
        "fieldId": 66900
      },
      "startsHidden": true,
      "maxLength": 50
    },
    {
      "name": "alternate_role_title",
      "label": "Alternate Role / Tilte",
      "type": "text",
      "legacy": {
        "column": "alternate_role_tilte",
        "fieldId": 66930
      },
      "startsHidden": true,
      "maxLength": 100
    },
    {
      "name": "alternate_intl_phone",
      "label": "Alternate Intl Phone",
      "type": "text",
      "legacy": {
        "column": "alternate_intl_phone",
        "fieldId": 68999
      },
      "startsHidden": true,
      "maxLength": 20,
      "pattern": "^[0-9+\\-() ]{1,20}$"
    },
    {
      "name": "alternate_phone",
      "label": "Alternate Phone",
      "type": "phone",
      "legacy": {
        "column": "alternate_phone",
        "fieldId": 66899
      },
      "startsHidden": true,
      "maxLength": 20
    },
    {
      "name": "alternate_email",
      "label": "Alternate Email",
      "type": "email",
      "legacy": {
        "column": "email_1_2_3",
        "fieldId": 66931
      },
      "startsHidden": true,
      "maxLength": 100
    },
    {
      "name": "preferred_language",
      "label": "Preferred Language",
      "type": "select",
      "legacy": {
        "column": "language",
        "fieldId": 66901
      },
      "options": [
        {
          "label": "English",
          "value": "English",
          "color": "#e91e63"
        },
        {
          "label": "Español",
          "value": "Español",
          "color": "#ffeb3b"
        },
        {
          "label": "Português",
          "value": "Português",
          "color": "#8bc34a"
        }
      ]
    },
    {
      "name": "notes",
      "label": "Notes",
      "type": "textarea",
      "legacy": {
        "column": "customer_notes",
        "fieldId": 66920
      },
      "maxLength": 1000,
      "placeholder": "Details, Special Instructions, Etc"
    },
    {
      "name": "profile_picture",
      "label": "Profile Picture",
      "type": "image",
      "legacy": {
        "column": "profile_picture",
        "fieldId": 66958
      }
    },
    {
      "name": "was_referred",
      "label": "Referred by anyone?",
      "type": "boolean",
      "legacy": {
        "column": "referred_by_1",
        "fieldId": 68768
      },
      "heading": "Referral"
    },
    {
      "name": "referred_by_organization_id",
      "label": "Organization",
      "type": "lookup",
      "legacy": {
        "column": "referred_by_organization",
        "fieldId": 68707
      },
      "lookup": {
        "table": "organizations"
      }
    },
    {
      "name": "referred_by_contact_id",
      "label": "Person",
      "type": "lookup",
      "legacy": {
        "column": "referred_by_contact",
        "fieldId": 68708
      },
      "lookup": {
        "table": "contacts"
      }
    },
    {
      "name": "referred_by_employee_id",
      "label": "Employee",
      "type": "lookup",
      "legacy": {
        "column": "employee",
        "fieldId": 68769
      },
      "lookup": {
        "table": "employees"
      }
    }
  ],
  "rules": [
    {
      "id": 3289,
      "title": "Alternate Show",
      "when": [
        {
          "field": "has_alternate_contact",
          "op": "equal",
          "value": "1"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "alternate_name"
        },
        {
          "do": "show",
          "field": "alternate_phone"
        },
        {
          "do": "show",
          "field": "alternate_role_title"
        },
        {
          "do": "show",
          "field": "alternate_email"
        },
        {
          "do": "show",
          "field": "alternate_intl_phone"
        }
      ]
    },
    {
      "id": 3296,
      "title": "Contact is not the End Customer",
      "when": [
        {
          "field": "type",
          "op": "not_equal",
          "value": "End Customer"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "organization_id"
        },
        {
          "do": "show",
          "field": "role_position"
        },
        {
          "do": "hide",
          "field": "referred_by_organization_id"
        },
        {
          "do": "hide",
          "field": "referred_by_contact_id"
        },
        {
          "do": "hide",
          "field": "referred_by_employee_id"
        },
        {
          "do": "hide",
          "field": "was_referred"
        }
      ]
    },
    {
      "id": 3461,
      "title": "Alternate Hide",
      "when": [
        {
          "field": "has_alternate_contact",
          "op": "not_equal",
          "value": "1"
        }
      ],
      "then": [
        {
          "do": "hide",
          "field": "alternate_name"
        },
        {
          "do": "hide",
          "field": "alternate_phone"
        },
        {
          "do": "hide",
          "field": "alternate_role_title"
        },
        {
          "do": "hide",
          "field": "alternate_email"
        },
        {
          "do": "hide",
          "field": "alternate_intl_phone"
        }
      ]
    },
    {
      "id": 3462,
      "title": "Contact is the End Customer",
      "when": [
        {
          "field": "type",
          "op": "equal",
          "value": "End Customer"
        }
      ],
      "then": [
        {
          "do": "hide",
          "field": "organization_id"
        },
        {
          "do": "hide",
          "field": "role_position"
        },
        {
          "do": "show",
          "field": "was_referred"
        }
      ]
    },
    {
      "id": 3467,
      "title": "Referred By ON",
      "when": [
        {
          "field": "was_referred",
          "op": "equal",
          "value": "1"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "referred_by_organization_id"
        },
        {
          "do": "show",
          "field": "referred_by_contact_id"
        },
        {
          "do": "show",
          "field": "referred_by_employee_id"
        }
      ]
    },
    {
      "id": 3468,
      "title": "Referred By OFF",
      "when": [
        {
          "field": "was_referred",
          "op": "equal",
          "value": "0"
        }
      ],
      "then": [
        {
          "do": "hide",
          "field": "referred_by_organization_id"
        },
        {
          "do": "hide",
          "field": "referred_by_contact_id"
        },
        {
          "do": "hide",
          "field": "referred_by_employee_id"
        }
      ]
    }
  ],
  "legacy": {
    "table": "fx_techsquad_projects_xmcontacts"
  }
};
