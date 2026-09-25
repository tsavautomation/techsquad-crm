// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_util_knowledge_base_category) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const kbCategories: TableDef = {
  "name": "kb_categories",
  "label": "Knowledge Base Categories",
  "module": "utility",
  "itemLabel": "Knowledge Base Categories",
  "newRecordLabel": "New Knowledge Base Categories",
  "titleFormula": null,
  "fields": [
    {
      "name": "title",
      "label": "Title",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 67646
      },
      "maxLength": 200
    },
    {
      "name": "icon_class",
      "label": "Icon Class",
      "type": "text",
      "legacy": {
        "column": "icon_class",
        "fieldId": 67647
      },
      "maxLength": 50
    },
    {
      "name": "sort_order",
      "label": "Place",
      "type": "number",
      "legacy": {
        "column": "place",
        "fieldId": 67648
      }
    },
    {
      "name": "active",
      "label": "Active",
      "type": "boolean",
      "legacy": {
        "column": "active",
        "fieldId": 67649
      },
      "default": true
    }
  ],
  "rules": [],
  "legacy": {
    "table": "fx_techsquad_util_knowledge_base_category"
  }
};
