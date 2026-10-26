// Visits on the calendar (F1 Scheduling, docs/portal-features-merge.md §A). Not from WebAuthor:
// built for the Portal features, so it has no legacy names. Maintained by hand.
import type { TableDef } from "../types";

const NEW = { column: "", fieldId: 0 };

export const DURATIONS = [
  { label: "30 min", value: "30" },
  { label: "45 min", value: "45" },
  { label: "1 h", value: "60" },
  { label: "1 h 30", value: "90" },
  { label: "2 h", value: "120" },
  { label: "3 h", value: "180" },
  { label: "4 h", value: "240" },
  { label: "6 h", value: "360" },
  // Fred 2026-10-07 (SPEC §9.1 F21-e): a full day is 7 hours, not 8.
  { label: "7 h (full day)", value: "420" },
];

export const visits: TableDef = {
  name: "visits",
  label: "Visits",
  module: "schedule",
  tab: "visits",
  itemLabel: "Visit",
  newRecordLabel: "New Visit",
  // F24-c: the technician in the title tells two visits of the same project at the same hour apart (the Job Report's Visit list).
  // J-k: an internal event has no project; its subject takes the project's place in the title.
  titleFormula: "{project_id}{subject} – {starts_at} – {technician_id}",
  origin: "new",
  formAddon: "visit",
  detailAddon: "visit",
  fields: [
    { name: "title", label: "Title", type: "text", hidden: true, legacy: NEW },
    // J-k (Jessica 2026-10-20, SPEC §9.1): a client visit needs its project; an internal event (warehouse, training…) has a subject instead.
    {
      name: "kind",
      label: "Type",
      type: "select",
      required: true,
      default: "Visit",
      heading: "Visit",
      options: [
        { label: "Client visit", value: "Visit", color: "#2563eb" },
        // SV-a (Fred 2026-10-26): a survey at a new client has no project yet; it carries its own address and contact.
        { label: "Survey", value: "Survey", color: "#0d9488" },
        { label: "Internal (warehouse, training…)", value: "Internal", color: "#6b7280" },
      ],
      legacy: NEW,
    },
    { name: "project_id", label: "Project", type: "lookup", lookup: { table: "projects" }, legacy: NEW },
    { name: "subject", label: "What for", type: "text", startsHidden: true, maxLength: 80, placeholder: "Warehouse, training, meeting…", legacy: NEW },
    { name: "starts_at", label: "Date and start time", type: "datetime", required: true, legacy: NEW },
    {
      name: "duration",
      label: "Expected duration",
      type: "select",
      required: true,
      default: "120",
      options: DURATIONS,
      legacy: NEW,
    },
    {
      name: "arrival_window",
      label: "Arrival time told to the client",
      type: "select",
      required: true,
      default: "60",
      options: [
        { label: "Exact time", value: "0" },
        { label: "Within 30 min", value: "30" },
        { label: "Within 1 h", value: "60" },
        { label: "Within 2 h", value: "120" },
      ],
      legacy: NEW,
    },
    { name: "technician_id", label: "Technician", type: "lookup", required: true, heading: "Team", lookup: { table: "employees" }, legacy: NEW },
    // F10-a: no designated driver per van, so a visit says which vehicle goes. Optional since J-r (Jessica 2026-10-21):
    // a visit can be booked before the van is known; the map and Google push already cope with no vehicle.
    { name: "vehicle_id", label: "Vehicle", type: "lookup", lookup: { table: "vehicles" }, legacy: NEW },
    { name: "team_ids", label: "Also going", type: "lookup", multiple: true, lookup: { table: "employees" }, legacy: NEW },
    // Starts with no options; admins add them in Form settings (Fred 2026-09-30, option C).
    { name: "service_type", label: "Service type", type: "select", options: [], legacy: NEW },
    // F22-c (Fred 2026-10-07): is this visit part of the project under way, or a service call billed on its own?
    {
      name: "billing",
      label: "Project or service call",
      type: "select",
      help: "A service call is billed on its own: when it is Done, Accounting gets a task to invoice it.",
      options: [
        { label: "Part of the project", value: "Project", color: "#2563eb" },
        { label: "Service call (billed separately)", value: "Service call", color: "#d97706" },
        // J-s2 (Jessica via Fred 2026-10-26): the hand-over visit that closes the project.
        { label: "Final delivery", value: "Final delivery", color: "#16a34a" },
      ],
      legacy: NEW,
    },
    { name: "instructions", label: "Instructions for the technician", type: "textarea", heading: "Details", maxLength: 2000, placeholder: "E.g. talk to the super, bring the tall ladder…", legacy: NEW },
    { name: "access_notes", label: "Parking and access", type: "textarea", maxLength: 1000, placeholder: "E.g. visitor parking on P2, check in at the front desk…", legacy: NEW },
    // F21-b (Fred 2026-10-07): a survey at a new client has no project address yet, so the visit can carry its own.
    { name: "address", label: "Visit address", type: "address", help: "Only when it differs from the project's address: a survey at a new client, another site. Blank = the project's address.", legacy: NEW },
    // SV-a: who the technician meets at a survey (shown by the Survey rule); optionally a contact already in the CRM.
    { name: "contact_name", label: "Contact name", type: "text", startsHidden: true, maxLength: 120, legacy: NEW },
    { name: "contact_phone", label: "Contact phone", type: "phone", startsHidden: true, legacy: NEW },
    { name: "contact_email", label: "Contact email", type: "email", startsHidden: true, legacy: NEW },
    { name: "contact_id", label: "Contact (if already in the CRM)", type: "lookup", startsHidden: true, lookup: { table: "contacts" }, legacy: NEW },
    {
      name: "status",
      label: "Status",
      type: "select",
      required: true,
      default: "Scheduled",
      options: [
        // F19-a: proposed by the AI review of a Job Report; a PM approves (→ Scheduled) or discards it.
        { label: "Proposed", value: "Proposed", color: "#a16207" },
        { label: "Scheduled", value: "Scheduled", color: "#2563eb" },
        { label: "On the way", value: "On the way", color: "#7c3aed" },
        { label: "On site", value: "On site", color: "#d97706" },
        { label: "Done", value: "Done", color: "#16a34a" },
        { label: "Cancelled", value: "Cancelled", color: "#9ca3af" },
      ],
      legacy: NEW,
    },
    // F6 Client portal (Fred 2026-10-10): the office ticks the visits the maintenance plan pays for; the portal counts them.
    { name: "maintenance_visit", label: "Counts toward the maintenance plan", type: "boolean", default: false, help: "Tick when this visit is one of the visits included in the customer's maintenance plan.", legacy: NEW },
    // F2 Field day: set by the people going (Today screen), shown on the visit once filled.
    { name: "on_way_at", label: "On my way", type: "datetime", readOnly: true, formHidden: true, heading: "In the field", legacy: NEW },
    { name: "checked_in_at", label: "Checked in", type: "datetime", readOnly: true, formHidden: true, legacy: NEW },
    { name: "checked_out_at", label: "Checked out", type: "datetime", readOnly: true, formHidden: true, legacy: NEW },
    // "Schedule return" on a return card fills this; the card then points at this visit.
    { name: "return_task_id", label: "Return card", type: "lookup", formHidden: true, lookup: { table: "tasks" }, legacy: NEW },
    // F19-a: the Job Report whose AI review proposed this return visit.
    { name: "proposed_from_report_id", label: "Proposed from report", type: "lookup", readOnly: true, formHidden: true, lookup: { table: "job_reports" }, legacy: NEW },
    {
      name: "repeat",
      label: "Repeat",
      type: "select",
      heading: "Repeat",
      createOnly: true,
      options: [
        { label: "Every week", value: "weekly" },
        { label: "Every 2 weeks", value: "biweekly" },
        { label: "Every month", value: "monthly" },
        { label: "Every 3 months", value: "quarterly" },
        { label: "Every 6 months", value: "semiannual" },
        { label: "Every year", value: "yearly" },
      ],
      legacy: NEW,
    },
    { name: "repeat_count", label: "Number of visits in the series", type: "number", createOnly: true, startsHidden: true, default: "4", help: "Including this one (2 to 24).", legacy: NEW },
  ],
  rules: [
    // SV-a: a survey has no project; its own address and the contact met there are what the technician needs.
    {
      id: 900004,
      title: "Survey has an address and a contact instead of a project",
      when: [{ field: "kind", op: "equal", value: "Survey" }],
      then: [
        { do: "hide", field: "project_id" },
        { do: "clear", field: "project_id" },
        { do: "clear", field: "subject" },
        { do: "require", field: "address" },
        { do: "show", field: "contact_name" },
        { do: "require", field: "contact_name" },
        { do: "show", field: "contact_phone" },
        { do: "show", field: "contact_email" },
        { do: "show", field: "contact_id" },
        { do: "hide", field: "billing" },
        { do: "clear", field: "billing" },
        { do: "hide", field: "maintenance_visit" },
      ],
    },
    { id: 900001, title: "Show series size when repeating", when: [{ field: "repeat", op: "not_empty" }], then: [{ do: "show", field: "repeat_count" }, { do: "require", field: "repeat_count" }] },
    // J-k: a client visit needs its project; an internal event hides the project and the client-only fields and needs a subject.
    { id: 900002, title: "Client visit needs a project", when: [{ field: "kind", op: "equal", value: "Visit" }], then: [{ do: "require", field: "project_id" }, { do: "clear", field: "subject" }] },
    {
      id: 900003,
      title: "Internal event has a subject instead of a project",
      when: [{ field: "kind", op: "equal", value: "Internal" }],
      then: [
        { do: "hide", field: "project_id" },
        { do: "clear", field: "project_id" },
        { do: "show", field: "subject" },
        { do: "require", field: "subject" },
        { do: "hide", field: "billing" },
        { do: "hide", field: "maintenance_visit" },
      ],
    },
  ],
  legacy: { table: "" },
};
