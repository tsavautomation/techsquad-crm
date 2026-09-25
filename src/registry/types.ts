// Shape of the table registry: one definition per record type, generated from the
// WebAuthor export by scripts/generate-registry.ts and then maintained by hand.
// Forms, grids, validation and (from M4) the database schema are driven by it.

export type FieldType =
  | "text"
  | "textarea"
  | "richtext"
  | "select" // dropdown, one value
  | "radio" // radio buttons, one value
  | "checkboxes" // several values from a fixed list
  | "boolean" // Yes / No
  | "date"
  | "datetime"
  | "money"
  | "number"
  | "phone"
  | "email"
  | "url"
  | "address"
  | "lookup" // reference to another table's record(s)
  | "user" // reference to a login (profiles)
  | "group" // reference to user group(s)
  | "file" // any upload, stored in attachments
  | "image"
  | "signature"
  | "ssn"
  | "ein"
  | "computed";

/** `retired` (Form settings, M12): no longer offered for new choices; existing records keep and show it. */
export type FieldOption = { label: string; value: string; color?: string; retired?: boolean };

/** Filter applied to a lookup picker: fixed values, or the current value of another field on this form. */
export type LookupFilter = Record<string, string | string[] | { sameAs: string }>;

export type AutoFill = {
  /** Field on the looked-up record … */
  from: string;
  /** … copied into this field on the current form. */
  to: string;
};

export type ComputedDef = {
  kind: "sum";
  table: string;
  field: string;
  /** `$id` means the current record's id. */
  where: Record<string, string>;
};

export type FieldDef = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  readOnly?: boolean;
  /** Not shown on the form at all (e.g. auto-generated title). */
  hidden?: boolean;
  /** Hidden when the form opens; a rule shows it. */
  startsHidden?: boolean;
  /** Heading printed above this field on the form. */
  heading?: string;
  options?: FieldOption[];
  multiple?: boolean;
  lookup?: {
    table: string;
    filter?: LookupFilter;
    autofill?: AutoFill[];
    /** Only copy non-empty values when auto-filling. */
    autofillOnlyNonEmpty?: boolean;
  };
  default?: string | boolean;
  maxLength?: number;
  pattern?: string;
  placeholder?: string;
  /** Help text under the field (Form settings, M12). */
  help?: string;
  notFuture?: boolean;
  fileTypes?: string[];
  computed?: ComputedDef;
  /** Encrypted at rest, masked in the UI, never emailed. */
  sensitive?: boolean;
  /** WebAuthor origin, for the data import and traceability. */
  legacy: { column: string; fieldId: number };
};

export type RuleOperator = "equal" | "not_equal" | "not_empty" | "date_before_today";
export type RuleCondition = { field: string; op: RuleOperator; value?: string };
export type RuleAction =
  | { do: "show" | "hide" | "clear" | "require"; field: string }
  | { do: "set"; field: string; value: string };

export type RuleDef = {
  id: number;
  title: string;
  /** The rule fires when ANY condition matches. */
  when: RuleCondition[];
  then: RuleAction[];
  /** Parts of the WebAuthor rule that pointed at nothing (see SPEC §9). */
  dropped?: string[];
};

export type TableDef = {
  name: string;
  label: string;
  module: string;
  /** Tab slug in src/config/modules.ts; child tables have none. */
  tab?: string;
  itemLabel: string;
  newRecordLabel: string;
  /** Child tables (sub-grids) belong to one parent record. */
  parent?: { table: string; field: string };
  /** Records can be submitted (locks them, may start a workflow). */
  submit?: { showButton: boolean; workflow?: string };
  /** How the record's display title is built, e.g. "{first_name} {last_name}". Null = the `title` field is typed in. */
  titleFormula: string | null;
  fields: FieldDef[];
  rules: RuleDef[];
  legacy: { table: string };
};
