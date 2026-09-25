// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_util_brand) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const brands: TableDef = {
  "name": "brands",
  "label": "Brands",
  "module": "utility",
  "itemLabel": "Brand",
  "newRecordLabel": "New Brand",
  "titleFormula": "{name}",
  "fields": [
    {
      "name": "title",
      "label": "Title",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 88256
      },
      "hidden": true,
      "maxLength": 200
    },
    {
      "name": "name",
      "label": "Brand",
      "type": "text",
      "legacy": {
        "column": "brand",
        "fieldId": 88257
      },
      "required": true,
      "maxLength": 100
    }
  ],
  "rules": [],
  "legacy": {
    "table": "fx_techsquad_util_brand"
  }
};
