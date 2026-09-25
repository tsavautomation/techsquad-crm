// Generated from techsquad_crm_spec.json (WebAuthor table fx_techsquad_help_desk_xmarticles) by scripts/generate-registry.ts.
// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.
import type { TableDef } from "../types";

export const kbArticles: TableDef = {
  "name": "kb_articles",
  "label": "Articles",
  "module": "help-desk",
  "tab": "articles",
  "itemLabel": "Article",
  "newRecordLabel": "New Article",
  "titleFormula": null,
  "fields": [
    {
      "name": "title",
      "label": "Title",
      "type": "text",
      "legacy": {
        "column": "title",
        "fieldId": 67618
      },
      "required": true,
      "maxLength": 200
    },
    {
      "name": "category_id",
      "label": "Category",
      "type": "lookup",
      "legacy": {
        "column": "fx_techsquad_util_knowledge_base_category_id",
        "fieldId": 67643
      },
      "lookup": {
        "table": "kb_categories"
      }
    },
    {
      "name": "audience_group_ids",
      "label": "Audience",
      "type": "group",
      "legacy": {
        "column": "site_group_id_list",
        "fieldId": 67642
      },
      "multiple": true,
      "placeholder": "Select Group(s)"
    },
    {
      "name": "status",
      "label": "Status",
      "type": "select",
      "legacy": {
        "column": "status",
        "fieldId": 67645
      },
      "options": [
        {
          "label": "Pending",
          "value": "Pending",
          "color": "#ffe5ad"
        },
        {
          "label": "Published",
          "value": "Published",
          "color": "#00b74a"
        }
      ]
    },
    {
      "name": "updated_on",
      "label": "Date of Update",
      "type": "date",
      "legacy": {
        "column": "date_of_update",
        "fieldId": 67640
      },
      "required": true,
      "default": "today"
    },
    {
      "name": "photo",
      "label": "Photo",
      "type": "file",
      "legacy": {
        "column": "photo",
        "fieldId": 67639
      }
    },
    {
      "name": "files",
      "label": "Videos/Files",
      "type": "file",
      "legacy": {
        "column": "video",
        "fieldId": 67641
      }
    },
    {
      "name": "video_link",
      "label": "Video Link",
      "type": "text",
      "legacy": {
        "column": "video_link",
        "fieldId": 67638
      },
      "maxLength": 200
    },
    {
      "name": "content",
      "label": "Content",
      "type": "richtext",
      "legacy": {
        "column": "content",
        "fieldId": 67637
      }
    },
    {
      "name": "view_count",
      "label": "View Count",
      "type": "number",
      "legacy": {
        "column": "view_count",
        "fieldId": 67644
      },
      "hidden": true
    }
  ],
  "rules": [],
  "legacy": {
    "table": "fx_techsquad_help_desk_xmarticles"
  }
};
