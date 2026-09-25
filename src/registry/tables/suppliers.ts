// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_util_supplier) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const suppliers: TableDef = {
  "name": "suppliers",
  "label": "Suppliers",
  "module": "utility",
  "itemLabel": "Record",
  "newRecordLabel": "New Record",
  "titleFormula": "{name}",
  "fields": [
    {
      "name": "title",
      "label": "Title",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 88250
      },
      "hidden": true,
      "maxLength": 200
    },
    {
      "name": "name",
      "label": "Company Name",
      "type": "text",
      "legacy": {
        "column": "company_name",
        "fieldId": 88255
      },
      "required": true,
      "maxLength": 50
    }
  ],
  "rules": [],
  "legacy": {
    "table": "fx_techsquad_util_supplier"
  }
};
