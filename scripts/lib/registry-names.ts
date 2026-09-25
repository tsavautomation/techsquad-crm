/**
 * Naming decisions for the registry generator (SPEC §9 Q2): clean table and
 * column names, with WebAuthor names kept in `legacy` on every definition.
 *
 * Column rule of thumb: keep the WebAuthor column unless it is misleading or
 * misspelled; single lookups end in `_id`. Anything listed here overrides that.
 */

export type TableMeta = {
  name: string;
  label: string;
  module: string;
  tab?: string;
  /** SPEC §9 Q1 proposed default — null when the title is typed in. */
  titleFormula: string | null;
  /** WebAuthor section whose fields belong to this table (sub-grids live inside the parent export). */
  section?: string;
  parent?: { table: string; field: string };
};

export const TABLES: Record<string, TableMeta> = {
  fx_techsquad_projects: { name: "projects", label: "Projects", module: "projects", tab: "projects", titleFormula: null },
  fx_techsquad_projects_xmcontacts: {
    name: "contacts", label: "Contacts", module: "projects", tab: "contacts", titleFormula: "{first_name} {last_name}", section: "Contacts",
  },
  fx_techsquad_projects_xmcontacts_interactions: {
    name: "contact_interactions", label: "Interactions", module: "projects", titleFormula: "{type} – {date}",
    section: "Interactions", parent: { table: "contacts", field: "contact_id" },
  },
  fx_techsquad_projects_xmbuildings: { name: "buildings", label: "Buildings / Developments", module: "projects", tab: "buildings", titleFormula: null },
  fx_techsquad_projects_xmpermits: {
    name: "permits", label: "Permits", module: "projects", tab: "permits", titleFormula: "{type} – {el_permit_number} – {project_id}",
  },
  fx_techsquad_projects_xmorganizations: { name: "organizations", label: "Organizations", module: "projects", tab: "organizations", titleFormula: null },
  fx_techsquad_projects_xmpunch_list: {
    name: "punch_list_items", label: "Punch List", module: "projects", tab: "punch-list", titleFormula: "{project_id} – {type}",
  },
  fx_techsquad_employee: {
    name: "employees", label: "Employees", module: "administrative", tab: "employees", titleFormula: "{first_name} {last_name}",
  },
  fx_techsquad_employee_xmfleet: {
    name: "vehicles", label: "Fleet", module: "administrative", tab: "vehicles", titleFormula: "{year} {make_and_model} ({tag_number})",
  },
  fx_techsquad_employee_xmtasks: {
    name: "tasks", label: "Tasks", module: "administrative", tab: "tasks", titleFormula: "{member_id} – {due_date}",
  },
  fx_techsquad_employee_xmrma: { name: "rmas", label: "RMA", module: "administrative", tab: "rma", titleFormula: null },
  fx_techsquad_employee_xmpayins: {
    name: "transactions", label: "Transactions", module: "administrative", tab: "transactions", titleFormula: "{payment_type} – {description}",
  },
  fx_techsquad_employee_xminventory_checkout: {
    name: "inventory_checkouts", label: "Inventory Checkout", module: "administrative", tab: "inventory-checkout",
    titleFormula: "{technician_id} – {date}",
  },
  fx_techsquad_employee_xmpayouts: {
    name: "payouts", label: "Payroll", module: "administrative", tab: "payroll", titleFormula: "{employee_id} – {reason} – {date_issued}",
  },
  fx_techsquad_inventory: {
    name: "products", label: "Products", module: "inventory", tab: "products", titleFormula: "{brand_id} {model} ({sku})",
  },
  fx_techsquad_inventory_xmsale: { name: "sales", label: "Sale", module: "inventory", tab: "sales", titleFormula: "{stock_item_id}" },
  fx_techsquad_inventory_xmstock: { name: "stock_items", label: "Stock", module: "inventory", tab: "stock", titleFormula: "{serial}" },
  fx_techsquad_help_desk: {
    name: "support_tickets", label: "Support Tickets", module: "help-desk", tab: "tickets", titleFormula: "#{id} {issue_description}",
    section: "Support Ticket",
  },
  fx_techsquad_help_desk_support_note: {
    name: "support_notes", label: "Support Notes", module: "help-desk", titleFormula: "{note_date} – {status}",
    section: "Support Note", parent: { table: "support_tickets", field: "ticket_id" },
  },
  fx_techsquad_help_desk_xmarticles: { name: "kb_articles", label: "Articles", module: "help-desk", tab: "articles", titleFormula: null },
  fx_techsquad_util_supplier: { name: "suppliers", label: "Suppliers", module: "utility", titleFormula: "{name}" },
  fx_techsquad_util_brand: { name: "brands", label: "Brands", module: "utility", titleFormula: "{name}" },
  fx_techsquad_util_knowledge_base_category: { name: "kb_categories", label: "Knowledge Base Categories", module: "utility", titleFormula: null },
  frx_techsquad_job_report: {
    name: "job_reports", label: "Job Report", module: "forms", tab: "job-reports", titleFormula: "{project_id} – {date}",
  },
  frx_techsquad_note: { name: "form_notes", label: "Note", module: "forms", tab: "notes", titleFormula: "{project_id} – {note_type}" },
  frx_techsquad_staff_performance: {
    name: "staff_performance", label: "Staff Performance", module: "forms", tab: "staff-performance", titleFormula: "{employee_id} – {date}",
  },
  frx_techsquad_survey_and_proposals: {
    name: "survey_proposals", label: "Survey and Proposals", module: "forms", tab: "survey-and-proposals", titleFormula: "{project_id} – {date_created}",
  },
  frx_techsquad_tv_installation: {
    name: "tv_installations", label: "TV Installation", module: "forms", tab: "tv-installations",
    titleFormula: "{project_id} – {room_area}",
  },
};

/** Per legacy table: WebAuthor column → new column. */
export const COLUMN_RENAMES: Record<string, Record<string, string>> = {
  fx_techsquad_projects: {
    current_phase: "job_status",
    category_1: "category",
    contact: "job_owner_id",
    home_address: "job_address",
    is_this_project_located_in_a_building_or_developme: "in_building",
    which_one: "building_id",
    project_permit: "has_permit",
    permit: "permit_id",
    is_there_a_designer_involved: "has_designer",
    job_designer: "design_firm_id",
    designer: "lead_designer_id",
    notes: "designer_notes",
    is_there_a_gg_involved: "has_general_contractor",
    job_gc: "general_contractor_id",
    gc_pm: "gc_pm_id",
    is_there_a_builder_or_developer_involved_1: "has_builder_developer",
    is_there_a_builder_or_developer_involved: "builder_developer_id",
    builber_developer_notes: "builder_developer_notes",
    referral_1: "referral_type",
    referral: "referral_contact_id",
    organization: "referral_organization_id",
    plans_folder: "plans",
    approved: "approved_amount",
    total_amount_invoiced: "invoiced_amount",
    total_amount_paid: "paid_amount",
    date_of_purchase: "maintenance_purchase_date",
    sales_person: "maintenance_sales_person_id",
    amount: "maintenance_amount",
    history: "maintenance_history",
    receipt_of_payment: "maintenance_receipt",
    special_order: "special_orders",
    reports_and_pictures_section: "older_reports",
  },
  fx_techsquad_projects_xmcontacts: {
    organization_name: "organization_id",
    home_address: "address",
    secretary_or_concierge: "has_alternate_contact",
    concierge: "alternate_name",
    alternate_role_tilte: "alternate_role_title",
    email_1_2_3: "alternate_email",
    language: "preferred_language",
    customer_notes: "notes",
    referred_by_1: "was_referred",
    referred_by_organization: "referred_by_organization_id",
    referred_by_contact: "referred_by_contact_id",
    employee: "referred_by_employee_id",
  },
  fx_techsquad_projects_xmbuildings: {
    home_address: "address",
    work_hours_1: "work_hours",
    upload_coi: "coi_file",
    phone_number_main: "admin_phone",
    email: "admin_email",
    phone_number_alternate: "receiving_phone",
    email_1_2: "receiving_email",
    front_desk_or_engineering: "front_desk_contact",
    email_1: "front_desk_email",
  },
  fx_techsquad_projects_xmpermits: {
    home_address: "address",
    first_name: "owner_contact_id",
    owner_phone_number: "owner_phone",
    permit_number: "el_permit_number",
    permit_expiration_date: "expiration_date",
    permit_expiration: "expiration_status",
    permit_card: "permit_card_image",
    inspection_records_and_additional_files: "inspection_files",
  },
  fx_techsquad_projects_xmorganizations: {
    certificate_of_insurance_coi: "coi_file",
    login: "portal_login",
    password: "portal_password",
    contracts_dealer_application: "dealer_contracts",
    product_catalogs_and_brochures: "catalogs",
  },
  fx_techsquad_projects_xmpunch_list: {
    team_1: "team_member_id",
    urgency: "priority",
    status_1: "status",
    file_upload: "files",
  },
  fx_techsquad_employee: {
    department: "departments",
    phone_number: "phone",
    drivers_license: "drivers_license_file",
    dl_status_1: "dl_status",
    type_1: "employment_type",
    workers_comp_exemption_certificate: "workers_comp_certificate",
    sunbiz: "ein",
    workers_comp_exemption_expiration: "workers_comp_expiration",
    effective_start_date: "start_date",
  },
  fx_techsquad_employee_xmfleet: {
    tag: "tag_number",
    insurance_card_1_2: "insurance_card",
    vehicle: "photo",
    maintenance_records_invoices_receipts: "maintenance_records",
    title_1: "dmv_title",
  },
  fx_techsquad_employee_xmtasks: { deatils: "details", status_1: "due_status", file_upload: "files" },
  fx_techsquad_employee_xmrma: {
    fld_client: "project_id",
    equipment_description_or_model: "equipment",
    serial_number: "serial_numbers",
    rma_receipt: "receipt_files",
  },
  fx_techsquad_employee_xmpayins: {
    project_payin: "project_id",
    payin_type_1: "type",
    pay_individual: "contact_id",
    pay_organization: "organization_id",
    portal_proposal: "portal_number",
    proposal_pdf: "pdf",
  },
  fx_techsquad_employee_xmpayouts: {
    method_of_payment: "payment_method",
    check_image_or_electronic_receipt: "receipt",
    details_optional: "details",
  },
  fx_techsquad_inventory_xmsale: { serial: "stock_item_id", destination: "destination_project_id", staff_member: "staff_id" },
  fx_techsquad_inventory_xmstock: { sku: "product_id", destination: "destination_project_id", staff_member: "staff_id" },
  fx_techsquad_help_desk: {
    upload_error: "error_files",
    priority_level: "priority",
    are_you_the_only_one_with_this_issue: "only_me",
  },
  fx_techsquad_help_desk_xmarticles: {
    fx_techsquad_util_knowledge_base_category_id: "category_id",
    site_group_id_list: "audience_group_ids",
    date_of_update: "updated_on",
    video: "files",
  },
  fx_techsquad_util_supplier: { company_name: "name" },
  fx_techsquad_util_brand: { brand: "name" },
  fx_techsquad_util_knowledge_base_category: { place: "sort_order" },
  frx_techsquad_job_report: {
    team_1: "team_ids",
    tag_someone: "tagged_ids",
    pending: "pending_1",
    next_pending: "pending_2",
    next_pendning: "pending_3",
    fld_4_pending: "pending_4",
    fld_5_pending: "pending_5",
    login_and_passwords: "logins_and_passwords",
    upload_files: "files",
  },
  frx_techsquad_note: { type_of_note: "note_type" },
  frx_techsquad_staff_performance: { staff_member: "employee_id", positive_negative: "type", upload_picture: "picture" },
  frx_techsquad_tv_installation: { brand_and_model_number: "brand_and_model", team: "team_ids", disclaimer: "validated_by" },
};

/** Stored encrypted and masked (SPEC §9 Q18). Keys are new table.column. */
export const SENSITIVE = new Set([
  "employees.ssn",
  "organizations.portal_password",
  "projects.system_credentials",
  "job_reports.logins_and_passwords",
]);

/** Workflow started when a record is submitted (SPEC §6). */
export const SUBMIT_WORKFLOWS: Record<string, string> = {
  "1171": "project_proposal",
  "1170": "punch_list",
  "1234": "stock_status",
};

/** Columns that are platform features, not form fields (SPEC §1.3). */
export const SYSTEM_COLUMNS = new Set([
  "person_id_creator",
  "person_id_modifier",
  "date_created",
  "date_modified",
  "client_id",
  "locked",
  "date_submitted",
]);

/** Legacy (table, column) pairs that look like system columns but are real user fields. */
export const NOT_SYSTEM = new Set(["fx_techsquad_employee_xmrma.date_submitted"]);
