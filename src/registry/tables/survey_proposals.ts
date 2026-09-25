// Generated from techsquad_crm_spec.json (WebAuthor table frx_techsquad_survey_and_proposals) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const surveyProposals: TableDef = {
  "name": "survey_proposals",
  "label": "Survey and Proposals",
  "module": "forms",
  "tab": "survey-and-proposals",
  "itemLabel": "Report",
  "newRecordLabel": "New Report",
  "titleFormula": "{project_id} – {date_created}",
  "fields": [
    {
      "name": "title",
      "label": "Title",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 71393
      },
      "hidden": true,
      "maxLength": 200
    },
    {
      "name": "project_id",
      "label": "Project",
      "type": "lookup",
      "legacy": {
        "column": "project",
        "fieldId": 71394
      },
      "lookup": {
        "table": "projects"
      },
      "placeholder": "Leave it blank for new projects"
    },
    {
      "name": "survey_details",
      "label": "Survey Details",
      "type": "textarea",
      "legacy": {
        "column": "survey_details",
        "fieldId": 71395
      },
      "maxLength": 1000
    },
    {
      "name": "pictures_and_videos",
      "label": "Pictures and Videos",
      "type": "file",
      "legacy": {
        "column": "pictures_and_videos",
        "fieldId": 71396
      }
    },
    {
      "name": "plans",
      "label": "Plans",
      "type": "file",
      "legacy": {
        "column": "plans",
        "fieldId": 71397
      }
    }
  ],
  "rules": [],
  "legacy": {
    "table": "frx_techsquad_survey_and_proposals"
  }
};
