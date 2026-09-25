// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_projects) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const projects: TableDef = {
  "name": "projects",
  "label": "Projects",
  "module": "projects",
  "tab": "projects",
  "itemLabel": "Projects",
  "newRecordLabel": "New Project",
  "submit": {
    "showButton": true,
    "workflow": "project_proposal"
  },
  "titleFormula": null,
  "fields": [
    {
      "name": "job_status",
      "label": "Job Status",
      "type": "select",
      "legacy": {
        "column": "current_phase",
        "fieldId": 67474
      },
      "options": [
        {
          "label": "Surveying",
          "value": "Surveying",
          "color": "#2196f3"
        },
        {
          "label": "Create Proposal",
          "value": "Create Proposal",
          "color": "#1266f1"
        },
        {
          "label": "Proposal Revisions",
          "value": "Proposal Revisions",
          "color": "#ff9800"
        },
        {
          "label": "Proposal Sent",
          "value": "Proposal Sent",
          "color": "#c5e6c1"
        },
        {
          "label": "Proposal Approved",
          "value": "Proposal Approved",
          "color": "#4caf50"
        },
        {
          "label": "ON HOLD",
          "value": "ON HOLD",
          "color": "#f44336"
        },
        {
          "label": "Infrastructure",
          "value": "Infrastructure",
          "color": "#ffeb3b"
        },
        {
          "label": "Installation",
          "value": "Installation",
          "color": "#9c27b0"
        },
        {
          "label": "Programming",
          "value": "Programming",
          "color": "#ffcdd2"
        },
        {
          "label": "Complete",
          "value": "Complete",
          "color": "#212121"
        },
        {
          "label": "Proposal Denied",
          "value": "Proposal Denied",
          "color": "#dddddd"
        }
      ]
    },
    {
      "name": "title",
      "label": "Project Name",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 66810
      },
      "required": true,
      "heading": "BASIC INFORMATION",
      "maxLength": 50
    },
    {
      "name": "type",
      "label": "Type",
      "type": "select",
      "legacy": {
        "column": "type",
        "fieldId": 66841
      },
      "required": true,
      "options": [
        {
          "label": "Residential",
          "value": "Residential",
          "color": "#ff9800"
        },
        {
          "label": "Commercial",
          "value": "Commercial",
          "color": "#9c27b0"
        }
      ]
    },
    {
      "name": "category",
      "label": "Category",
      "type": "select",
      "legacy": {
        "column": "category_1",
        "fieldId": 68774
      },
      "required": true,
      "options": [
        {
          "label": "Low Voltage",
          "value": "Low Voltage",
          "color": "#81c0ec"
        },
        {
          "label": "Electrical",
          "value": "Electrical",
          "color": "#c6d1a9"
        }
      ]
    },
    {
      "name": "job_owner_id",
      "label": "Job Owner",
      "type": "lookup",
      "legacy": {
        "column": "contact",
        "fieldId": 66843
      },
      "required": true,
      "lookup": {
        "table": "contacts",
        "autofill": [
          {
            "from": "main_phone",
            "to": "owner_contact"
          }
        ],
        "autofillOnlyNonEmpty": true
      }
    },
    {
      "name": "job_address",
      "label": "Job Address",
      "type": "address",
      "legacy": {
        "column": "home_address",
        "fieldId": 67456
      },
      "maxLength": 500
    },
    {
      "name": "owner_contact",
      "label": "Owner Contact",
      "type": "phone",
      "legacy": {
        "column": "owner_contact",
        "fieldId": 68744
      },
      "maxLength": 30
    },
    {
      "name": "owner_contact_intl",
      "label": "Owner Contact Intl",
      "type": "text",
      "legacy": {
        "column": "owner_contact_intl",
        "fieldId": 74944
      },
      "maxLength": 20,
      "pattern": "^[0-9+\\-() ]{1,20}$"
    },
    {
      "name": "door_gate_code",
      "label": "Door / Gate Code",
      "type": "text",
      "legacy": {
        "column": "door_gate_code",
        "fieldId": 67465
      },
      "maxLength": 100
    },
    {
      "name": "in_building",
      "label": "Building or Development",
      "type": "boolean",
      "legacy": {
        "column": "is_this_project_located_in_a_building_or_developme",
        "fieldId": 67421
      },
      "default": false
    },
    {
      "name": "building_id",
      "label": "Building / Development",
      "type": "lookup",
      "legacy": {
        "column": "which_one",
        "fieldId": 67422
      },
      "startsHidden": true,
      "lookup": {
        "table": "buildings"
      }
    },
    {
      "name": "apartment_or_unit",
      "label": "Apartment or Unit #",
      "type": "text",
      "legacy": {
        "column": "apartment_or_unit",
        "fieldId": 67460
      },
      "startsHidden": true,
      "maxLength": 20
    },
    {
      "name": "job_coi",
      "label": "Job COI",
      "type": "file",
      "legacy": {
        "column": "job_coi",
        "fieldId": 67459
      },
      "heading": "INSURANCE AND PERMIT INFORMATION"
    },
    {
      "name": "has_permit",
      "label": "Permit",
      "type": "boolean",
      "legacy": {
        "column": "project_permit",
        "fieldId": 67457
      },
      "default": false
    },
    {
      "name": "permit_id",
      "label": "Choose Permit",
      "type": "lookup",
      "legacy": {
        "column": "permit",
        "fieldId": 66948
      },
      "startsHidden": true,
      "lookup": {
        "table": "permits"
      }
    },
    {
      "name": "has_designer",
      "label": "Designer",
      "type": "boolean",
      "legacy": {
        "column": "is_there_a_designer_involved",
        "fieldId": 67466
      },
      "heading": "INDIVIDUALS AND ORGANIZATIONS INVOLVED",
      "default": false
    },
    {
      "name": "design_firm_id",
      "label": "Design Firm",
      "type": "lookup",
      "legacy": {
        "column": "job_designer",
        "fieldId": 67464
      },
      "startsHidden": true,
      "lookup": {
        "table": "organizations",
        "filter": {
          "type": "Design Firm"
        }
      }
    },
    {
      "name": "lead_designer_id",
      "label": "Lead Designer",
      "type": "lookup",
      "legacy": {
        "column": "designer",
        "fieldId": 68709
      },
      "lookup": {
        "table": "contacts",
        "filter": {
          "type": "Design Firm"
        }
      }
    },
    {
      "name": "designer_notes",
      "label": "Designer Notes",
      "type": "textarea",
      "legacy": {
        "column": "notes",
        "fieldId": 67467
      },
      "startsHidden": true,
      "maxLength": 1000
    },
    {
      "name": "has_general_contractor",
      "label": "General Contractor",
      "type": "boolean",
      "legacy": {
        "column": "is_there_a_gg_involved",
        "fieldId": 67468
      },
      "default": false
    },
    {
      "name": "general_contractor_id",
      "label": "General Contractor",
      "type": "lookup",
      "legacy": {
        "column": "job_gc",
        "fieldId": 67461
      },
      "startsHidden": true,
      "lookup": {
        "table": "organizations",
        "filter": {
          "type": "General Contractor"
        }
      }
    },
    {
      "name": "gc_pm_id",
      "label": "GC PM",
      "type": "lookup",
      "legacy": {
        "column": "gc_pm",
        "fieldId": 68710
      },
      "lookup": {
        "table": "contacts",
        "filter": {
          "type": "General Contractor"
        }
      }
    },
    {
      "name": "general_contractor_notes",
      "label": "GC Notes",
      "type": "textarea",
      "legacy": {
        "column": "general_contractor_notes",
        "fieldId": 67469
      },
      "startsHidden": true,
      "maxLength": 1000
    },
    {
      "name": "has_builder_developer",
      "label": "Builder or Developer",
      "type": "boolean",
      "legacy": {
        "column": "is_there_a_builder_or_developer_involved_1",
        "fieldId": 67470
      },
      "default": false
    },
    {
      "name": "builder_developer_id",
      "label": "Builder / Developer",
      "type": "lookup",
      "legacy": {
        "column": "is_there_a_builder_or_developer_involved",
        "fieldId": 67462
      },
      "startsHidden": true,
      "lookup": {
        "table": "organizations",
        "filter": {
          "type": "Developer Builder"
        }
      }
    },
    {
      "name": "builder_developer_notes",
      "label": "Builder / Developer Notes",
      "type": "textarea",
      "legacy": {
        "column": "builber_developer_notes",
        "fieldId": 67471
      },
      "startsHidden": true,
      "maxLength": 1000
    },
    {
      "name": "referral_type",
      "label": "Referral",
      "type": "radio",
      "legacy": {
        "column": "referral_1",
        "fieldId": 68946
      },
      "options": [
        {
          "label": "None",
          "value": "None",
          "color": "#dddddd"
        },
        {
          "label": "Person",
          "value": "Person",
          "color": "#dddddd"
        },
        {
          "label": "Organization",
          "value": "Organization",
          "color": "#dddddd"
        }
      ],
      "default": "None"
    },
    {
      "name": "referral_contact_id",
      "label": "Person",
      "type": "lookup",
      "legacy": {
        "column": "referral",
        "fieldId": 68773
      },
      "lookup": {
        "table": "contacts"
      }
    },
    {
      "name": "referral_organization_id",
      "label": "Organization",
      "type": "lookup",
      "legacy": {
        "column": "organization",
        "fieldId": 68947
      },
      "lookup": {
        "table": "organizations"
      }
    },
    {
      "name": "commission_notes",
      "label": "Commission Notes",
      "type": "textarea",
      "legacy": {
        "column": "commission_notes",
        "fieldId": 67473
      },
      "startsHidden": true,
      "maxLength": 1000
    },
    {
      "name": "survey_videos_links",
      "label": "Survey Videos Links",
      "type": "textarea",
      "legacy": {
        "column": "survey_videos_links",
        "fieldId": 67495
      },
      "heading": "FILE SECTION",
      "maxLength": 300,
      "placeholder": "Paste One Drive links to Survey Videos Here"
    },
    {
      "name": "plans",
      "label": "Plans",
      "type": "textarea",
      "legacy": {
        "column": "plans_folder",
        "fieldId": 67496
      },
      "maxLength": 1000,
      "placeholder": "Paste One Drive links to folders and special notes here"
    },
    {
      "name": "approved_amount",
      "label": "Approved",
      "type": "computed",
      "legacy": {
        "column": "approved",
        "fieldId": 68951
      },
      "heading": "FINANCIAL STATUS",
      "computed": {
        "kind": "sum",
        "table": "transactions",
        "field": "amount",
        "where": {
          "project_id": "$id",
          "type": "Proposal"
        }
      }
    },
    {
      "name": "invoiced_amount",
      "label": "Invoiced",
      "type": "computed",
      "legacy": {
        "column": "total_amount_invoiced",
        "fieldId": 68724
      },
      "computed": {
        "kind": "sum",
        "table": "transactions",
        "field": "amount",
        "where": {
          "project_id": "$id",
          "type": "Invoice"
        }
      }
    },
    {
      "name": "paid_amount",
      "label": "Paid",
      "type": "computed",
      "legacy": {
        "column": "total_amount_paid",
        "fieldId": 68725
      },
      "computed": {
        "kind": "sum",
        "table": "transactions",
        "field": "amount",
        "where": {
          "project_id": "$id",
          "type": "Payment"
        }
      }
    },
    {
      "name": "financial_status",
      "label": "Financial Status",
      "type": "select",
      "legacy": {
        "column": "financial_status",
        "fieldId": 68803
      },
      "options": [
        {
          "label": "Current",
          "value": "Current",
          "color": "#4caf50"
        },
        {
          "label": "Delinquent",
          "value": "Delinquent",
          "color": "#e91e63"
        }
      ]
    },
    {
      "name": "warranty",
      "label": "Warranty",
      "type": "boolean",
      "legacy": {
        "column": "warranty",
        "fieldId": 68808
      },
      "heading": "WARRANTY",
      "default": false
    },
    {
      "name": "start_date",
      "label": "Start Date",
      "type": "date",
      "legacy": {
        "column": "start_date",
        "fieldId": 68810
      }
    },
    {
      "name": "maintenance_plan",
      "label": "Maintenance Plan",
      "type": "boolean",
      "legacy": {
        "column": "maintenance_plan",
        "fieldId": 67482
      },
      "heading": "MAINTENANCE PLAN",
      "default": false
    },
    {
      "name": "maintenance_type",
      "label": "Type",
      "type": "select",
      "legacy": {
        "column": "maintenance_type",
        "fieldId": 67484
      },
      "startsHidden": true,
      "options": [
        {
          "label": "Bronze",
          "value": "Bronze",
          "color": "#e1936d"
        },
        {
          "label": "Silver",
          "value": "Silver",
          "color": "#dddddd"
        },
        {
          "label": "Gold",
          "value": "Gold",
          "color": "#ffeb3b"
        },
        {
          "label": "Custom",
          "value": "Custom",
          "color": "#ba68c8"
        }
      ]
    },
    {
      "name": "maintenance_status",
      "label": "Status",
      "type": "select",
      "legacy": {
        "column": "maintenance_status",
        "fieldId": 67485
      },
      "startsHidden": true,
      "options": [
        {
          "label": "Expired",
          "value": "Expired",
          "color": "#e91e63"
        },
        {
          "label": "Active",
          "value": "Active",
          "color": "#4caf50"
        },
        {
          "label": "Renewal Alert",
          "value": "Renewal Alert",
          "color": "#ff9800"
        }
      ]
    },
    {
      "name": "maintenance_purchase_date",
      "label": "Purchase Date",
      "type": "date",
      "legacy": {
        "column": "date_of_purchase",
        "fieldId": 67486
      },
      "startsHidden": true
    },
    {
      "name": "maintenance_sales_person_id",
      "label": "Sales Person",
      "type": "lookup",
      "legacy": {
        "column": "sales_person",
        "fieldId": 67487
      },
      "startsHidden": true,
      "lookup": {
        "table": "employees"
      }
    },
    {
      "name": "maintenance_amount",
      "label": "Amount",
      "type": "money",
      "legacy": {
        "column": "amount",
        "fieldId": 67488
      },
      "startsHidden": true
    },
    {
      "name": "maintenance_history",
      "label": "History",
      "type": "textarea",
      "legacy": {
        "column": "history",
        "fieldId": 67489
      },
      "startsHidden": true,
      "maxLength": 1000
    },
    {
      "name": "maintenance_receipt",
      "label": "Receipt of Payment",
      "type": "file",
      "legacy": {
        "column": "receipt_of_payment",
        "fieldId": 67490
      },
      "startsHidden": true
    },
    {
      "name": "special_orders",
      "label": "Special Orders",
      "type": "boolean",
      "legacy": {
        "column": "special_order",
        "fieldId": 67491
      },
      "heading": "EQUIPMENT AND MATERIALS",
      "default": false
    },
    {
      "name": "list_items",
      "label": "List Items",
      "type": "textarea",
      "legacy": {
        "column": "list_items",
        "fieldId": 67492
      },
      "startsHidden": true,
      "maxLength": 1000,
      "placeholder": "List all special order and custom items here. Also, items with an extended lead time that we need to plan ahead."
    },
    {
      "name": "older_reports",
      "label": "Reports and Pictures Section",
      "type": "textarea",
      "legacy": {
        "column": "reports_and_pictures_section",
        "fieldId": 67497
      },
      "heading": "OLDER REPORTS",
      "maxLength": 1000
    },
    {
      "name": "system_credentials",
      "label": "System Credentials",
      "type": "textarea",
      "legacy": {
        "column": "system_credentials",
        "fieldId": 67736
      },
      "heading": "SYSTEMS AND PASSWORDS",
      "maxLength": 1000,
      "sensitive": true
    },
    {
      "name": "systems",
      "label": "Systems",
      "type": "checkboxes",
      "legacy": {
        "column": "systems",
        "fieldId": 67737
      },
      "options": [
        {
          "label": "CRESTRON SIMPL",
          "value": "CRESTRON SIMPL",
          "color": "#f44336"
        },
        {
          "label": "CRESTRON STUDIO",
          "value": "CRESTRON STUDIO",
          "color": "#3f51b5"
        },
        {
          "label": "CRESTRON HOME",
          "value": "CRESTRON HOME",
          "color": "#009688"
        },
        {
          "label": "CONTROL4",
          "value": "CONTROL4",
          "color": "#e91e63"
        },
        {
          "label": "LUTRON QS / QSX",
          "value": "LUTRON QS / QSX",
          "color": "#ffeb3b"
        },
        {
          "label": "LUTRON LEGACY",
          "value": "LUTRON LEGACY",
          "color": "#e91e63"
        },
        {
          "label": "SONOS",
          "value": "SONOS",
          "color": "#2196f3"
        },
        {
          "label": "IC REALTIME",
          "value": "IC REALTIME",
          "color": "#4caf50"
        },
        {
          "label": "HIKVISION / ACEGEAR",
          "value": "HIKVISION / ACEGEAR",
          "color": "#ffc107"
        },
        {
          "label": "WYZE",
          "value": "WYZE",
          "color": "#9c27b0"
        },
        {
          "label": "RING",
          "value": "RING",
          "color": "#03a9f4"
        },
        {
          "label": "EERO",
          "value": "EERO",
          "color": "#f3ccf7"
        },
        {
          "label": "NEST",
          "value": "NEST",
          "color": "#8bc34a"
        },
        {
          "label": "VANTAGE",
          "value": "VANTAGE",
          "color": "#ff9800"
        },
        {
          "label": "UNIFI",
          "value": "UNIFI",
          "color": "#ffe5ad"
        },
        {
          "label": "ARAKNIS",
          "value": "ARAKNIS",
          "color": "#c5e6c1"
        },
        {
          "label": "BOND",
          "value": "BOND",
          "color": "#bcefef"
        }
      ]
    }
  ],
  "rules": [
    {
      "id": 3370,
      "title": "Building=True",
      "when": [
        {
          "field": "in_building",
          "op": "equal",
          "value": "1"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "building_id"
        },
        {
          "do": "show",
          "field": "apartment_or_unit"
        }
      ]
    },
    {
      "id": 3371,
      "title": "Building=False",
      "when": [
        {
          "field": "in_building",
          "op": "equal",
          "value": "0"
        }
      ],
      "then": [
        {
          "do": "hide",
          "field": "building_id"
        },
        {
          "do": "hide",
          "field": "apartment_or_unit"
        }
      ]
    },
    {
      "id": 3372,
      "title": "Permit=False",
      "when": [
        {
          "field": "has_permit",
          "op": "equal",
          "value": "0"
        }
      ],
      "then": [
        {
          "do": "hide",
          "field": "permit_id"
        }
      ],
      "dropped": [
        "action \"[hide-field]\" (no target field)"
      ]
    },
    {
      "id": 3373,
      "title": "Permit=True",
      "when": [
        {
          "field": "has_permit",
          "op": "equal",
          "value": "1"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "permit_id"
        }
      ],
      "dropped": [
        "action \"[show-field]\" (no target field)"
      ]
    },
    {
      "id": 3374,
      "title": "Designer=True",
      "when": [
        {
          "field": "has_designer",
          "op": "equal",
          "value": "1"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "design_firm_id"
        },
        {
          "do": "show",
          "field": "designer_notes"
        },
        {
          "do": "show",
          "field": "lead_designer_id"
        }
      ]
    },
    {
      "id": 3375,
      "title": "GC=False",
      "when": [
        {
          "field": "has_general_contractor",
          "op": "equal",
          "value": "0"
        }
      ],
      "then": [
        {
          "do": "hide",
          "field": "general_contractor_id"
        },
        {
          "do": "hide",
          "field": "general_contractor_notes"
        },
        {
          "do": "hide",
          "field": "gc_pm_id"
        }
      ]
    },
    {
      "id": 3376,
      "title": "GC=True",
      "when": [
        {
          "field": "has_general_contractor",
          "op": "equal",
          "value": "1"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "general_contractor_id"
        },
        {
          "do": "show",
          "field": "general_contractor_notes"
        },
        {
          "do": "show",
          "field": "gc_pm_id"
        }
      ]
    },
    {
      "id": 3377,
      "title": "Builder=True",
      "when": [
        {
          "field": "has_builder_developer",
          "op": "equal",
          "value": "1"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "builder_developer_id"
        },
        {
          "do": "show",
          "field": "builder_developer_notes"
        }
      ]
    },
    {
      "id": 3378,
      "title": "Builder=False",
      "when": [
        {
          "field": "has_builder_developer",
          "op": "equal",
          "value": "0"
        }
      ],
      "then": [
        {
          "do": "hide",
          "field": "builder_developer_id"
        },
        {
          "do": "hide",
          "field": "builder_developer_notes"
        }
      ]
    },
    {
      "id": 3379,
      "title": "Commission=True Person",
      "when": [
        {
          "field": "referral_type",
          "op": "equal",
          "value": "Person"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "commission_notes"
        },
        {
          "do": "show",
          "field": "referral_contact_id"
        },
        {
          "do": "hide",
          "field": "referral_organization_id"
        }
      ]
    },
    {
      "id": 3380,
      "title": "Commission=False",
      "when": [
        {
          "field": "referral_type",
          "op": "equal",
          "value": "None"
        }
      ],
      "then": [
        {
          "do": "hide",
          "field": "commission_notes"
        },
        {
          "do": "hide",
          "field": "referral_contact_id"
        },
        {
          "do": "hide",
          "field": "referral_organization_id"
        }
      ]
    },
    {
      "id": 3381,
      "title": "Maintenance=True",
      "when": [
        {
          "field": "maintenance_plan",
          "op": "equal",
          "value": "1"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "maintenance_type"
        },
        {
          "do": "show",
          "field": "maintenance_status"
        },
        {
          "do": "show",
          "field": "maintenance_purchase_date"
        },
        {
          "do": "show",
          "field": "maintenance_sales_person_id"
        },
        {
          "do": "show",
          "field": "maintenance_amount"
        },
        {
          "do": "show",
          "field": "maintenance_history"
        },
        {
          "do": "show",
          "field": "maintenance_receipt"
        }
      ]
    },
    {
      "id": 3382,
      "title": "Maintenance=False",
      "when": [
        {
          "field": "maintenance_plan",
          "op": "equal",
          "value": "0"
        }
      ],
      "then": [
        {
          "do": "hide",
          "field": "maintenance_type"
        },
        {
          "do": "hide",
          "field": "maintenance_status"
        },
        {
          "do": "hide",
          "field": "maintenance_purchase_date"
        },
        {
          "do": "hide",
          "field": "maintenance_sales_person_id"
        },
        {
          "do": "hide",
          "field": "maintenance_amount"
        },
        {
          "do": "hide",
          "field": "maintenance_history"
        },
        {
          "do": "hide",
          "field": "maintenance_receipt"
        }
      ]
    },
    {
      "id": 3383,
      "title": "Order=True",
      "when": [
        {
          "field": "special_orders",
          "op": "equal",
          "value": "1"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "list_items"
        }
      ]
    },
    {
      "id": 3463,
      "title": "Designer=False",
      "when": [
        {
          "field": "has_designer",
          "op": "not_equal",
          "value": "1"
        }
      ],
      "then": [
        {
          "do": "hide",
          "field": "design_firm_id"
        },
        {
          "do": "hide",
          "field": "designer_notes"
        },
        {
          "do": "hide",
          "field": "lead_designer_id"
        }
      ]
    },
    {
      "id": 3471,
      "title": "Order=False",
      "when": [
        {
          "field": "special_orders",
          "op": "equal",
          "value": "0"
        }
      ],
      "then": [
        {
          "do": "hide",
          "field": "list_items"
        }
      ]
    },
    {
      "id": 3474,
      "title": "Commission=True Organization",
      "when": [
        {
          "field": "referral_type",
          "op": "equal",
          "value": "Organization"
        }
      ],
      "then": [
        {
          "do": "show",
          "field": "commission_notes"
        },
        {
          "do": "hide",
          "field": "referral_contact_id"
        },
        {
          "do": "show",
          "field": "referral_organization_id"
        }
      ]
    }
  ],
  "legacy": {
    "table": "fx_techsquad_projects"
  }
};
