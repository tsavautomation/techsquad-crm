# TechSquad CRM — Functional Specification (Phase 1)

Source: `techsquad_crm_spec.json`, a read-only configuration export of **techsquad.webauthor.com** taken 2026-09-25. It contains structure only, no business records.

This document describes the existing WebAuthor system in plain English, so it can be rebuilt feature-for-feature. Wherever the export is ambiguous, broken or self-contradictory, the problem is flagged inline with ⚠ and collected in **§9 Open questions**. Those items need a decision before or during the build.

---

## 1. The big picture

### 1.1 Modules (main menu)

WebAuthor groups the tables into five menu areas. In the new app each area becomes a top-level navigation item, and each record type becomes a tab inside it. The tab order below is taken from WebAuthor.

| Module (menu) | Tabs, in WebAuthor order | Record types (tables) |
|---|---|---|
| **Projects** | Dashboard · Projects · Contacts · Organizations · Buildings / Developments · Permits · Punch List · Map View · Reports | Projects, Contacts (+ Interactions sub-grid), Organizations, Buildings / Developments, Permits, Punch List |
| **Administrative** | Dashboard · Employees · Payroll · Transactions · Vehicle · RMA · Tasks · Inventory Checkout · Reports | Employees, Payroll (Payouts), Transactions (Pay-ins), Fleet (Vehicles), RMA, Tasks, Inventory Checkout, *(Onboarding: see §8)* |
| **Inventory** | Dashboard · Product · Stock | Products, Stock, Sale, *(Return / RMA: see §8)* |
| **TS Help Desk** | Dashboard · Tickets · Articles | Support Tickets (+ Support Notes sub-grid), Knowledge Base Articles |
| **FLEX Forms** | one list per form | Job Report, Note, Staff Performance, Survey and Proposals, TV Installation |
| *Utility tables* | managed from each module's Options → Utility Tables | Brands, Suppliers, Knowledge Base Categories |

That makes **28 tables**: 23 record types, 2 sub-grid child tables and 3 utility lists.

### 1.2 Volume of existing data (for the later data migration)

These are the record counts shown on the WebAuthor report pages at export time. Phase 1 moves no data, but the counts show how large the future import will be.

| Record type | Records | Record type | Records |
|---|---|---|---|
| Projects | 260 (254 in the Proposal workflow) | Employees | 31 |
| Contacts | 299 (5 archived) | Payroll | 246 |
| Contact Interactions | 3 | Transactions | 168 |
| Organizations | 93 | Inventory Checkout | 527 |
| Buildings / Developments | 70 | RMA | 76 (45 archived) |
| Permits | 35 | Tasks | 15 |
| Punch List | 77 (51 archived) | Fleet | 14 (1 archived) |
| Files attached (Projects module) | 174 | Files attached (Administrative module) | 270 |
| Stock | 6 in the Stock workflow | Help Desk | 0 |

### 1.3 Behaviour every record has (WebAuthor platform features)

Every table gets the following automatically. None of it is repeated in the field lists below.

- **System columns**: `id`, *Created By* (user), *Date Created*, *Modified By* (user), *Date Modified*. Several tables also carry a hidden, read-only *Organization/Agency* (`client_id`). That is WebAuthor's multi-tenant marker and has no meaning for a single company, so it is dropped.
- **Record title**: every record has a `title` used wherever it is shown in a lookup or link. On some tables it is a real field (for example *Project Name*). On others it is hidden and auto-generated. ⚠ The export does not include the formula for the auto-generated titles (§9 Q1).
- **Files pod**: any number of files can be attached to a record. **Notes / Activity**: time-stamped notes on a record. **Comments** on fields. **Audit log / history** of changes.
- **Archive**: archived records drop out of the default lists but can still be viewed. **Delete** is soft: deleted records go to a *Deleted Items* page and can be restored.
- **Submit & lock**: every record type is set to *lock on submit*. Only Projects and Punch List show a **Submit** button. Submitting stamps *Date Submitted*, sets *Locked*, and starts the workflow configured for that record type (§6). Locked records can only be edited by users with *Modify Locked* permission.
- **Checklist**: records can carry checklist items. The Job Report triggers add checklist items to the linked Project (§5).
- **Summary section**: a system block that shows counts of related records. For example, a Project shows how many Job Reports, Pay-ins, RMAs and so on point at it. These counts are computed, not stored.
- **Grid (list) view**: search, sort, filter, saved views, bulk update, inline edit, export and "merge". Which of these a user gets depends on permissions (§7).

---

## 2. How the tables relate

In WebAuthor, the tables inside a module are **siblings, not children**. A Permit does not "belong to" a Project through a hidden parent key. They are connected only by the explicit *lookup* fields listed below. The two true parent→child tables are **Contact → Interactions** and **Support Ticket → Support Notes**.

```
                          ┌──────────── Organizations ◄──────────────┐
                          │   (type = Design Firm / GC / Developer   │
                          │    Builder / Municipality / Supplier …)  │
                          ▼                                          │
 Buildings ◄── Projects ──► Contacts ──► Organizations (Organization Name, filtered by same Type)
               ▲  ▲  ▲  ▲                      │
   Permits ────┘  │  │  └── Punch List, RMA, Transactions, Inventory Checkout,
 (Municipality→Org│  │       Sale/Stock (Destination), Job Report, Note,
  Owner→Contact)  │  │       Survey & Proposals, TV Installation
                  │  └── Maintenance-plan Sales Person → Employees
                  └── Permit chosen on the project → Permits

 Employees ◄── Punch List Team, Tasks Member, Payroll, Inventory Checkout Technician,
               Sale/Stock Staff, Job Report Team & Tag Someone (many),
               TV Installation Team (many), Staff Performance, Contacts "referred by Employee"
 Fleet ◄────── Job Report Vehicle (only vehicles with Populate on Reports = Yes)
 Products ◄─── Stock (SKU) ◄── Sale (Serial)        Brands ◄── Products, Stock, Sale
 Suppliers ◄── Products                             KB Categories ◄── Articles
```

### 2.1 Every lookup (foreign key)

"one" means the field holds a single record. "many" means it holds several (multi-select). A filter means the picker only offers matching records.

| From table | Field (column) | Points to | Picker filter |
|---|---|---|---|
| Projects | Job Owner (`contact`) | one Contacts |  |
| Projects | Building / Development (`which_one`) | one Buildings / Developments |  |
| Projects | Choose Permit (`permit`) | one Permits |  |
| Projects | Design Firm (`job_designer`) | one Organizations | Type = Design Firm |
| Projects | Lead Designer (`designer`) | one Contacts | Type = Design Firm |
| Projects | General Contractor (`job_gc`) | one Organizations | Type = General Contractor |
| Projects | GC PM (`gc_pm`) | one Contacts | Type = General Contractor |
| Projects | Builder / Developer (`is_there_a_builder_or_developer_involved`) | one Organizations | Type = Developer Builder |
| Projects | Person (`referral`) | one Contacts |  |
| Projects | Organization (`organization`) | one Organizations |  |
| Projects | Sales Person (`sales_person`) | one Employees |  |
| Contacts | Organization Name (`organization_name`) | one Organizations | Type = this contact's Type |
| Contacts | Organization (`referred_by_organization`) | one Organizations |  |
| Contacts | Person (`referred_by_contact`) | one Contacts |  |
| Contacts | Employee (`employee`) | one Employees |  |
| Permits | Municipality (`municipality`) | one Organizations | Type = Municipality |
| Permits | Project (`project`) | one Projects |  |
| Permits | Owner Name (`first_name`) | one Contacts |  |
| Punch List | Project (`project`) | one Projects |  |
| Punch List | Team (`team_1`) | one Employees |  |
| Tasks | Member (`member`) | one Employees |  |
| RMA | Client (`fld_client`) | one Projects |  |
| RMA | Manufacturer (`manufacturer`) | one Organizations |  |
| Transactions (Pay-ins) | Apply to Project (`project_payin`) | one Projects |  |
| Transactions (Pay-ins) | Pay Individual (`pay_individual`) | one Contacts |  |
| Transactions (Pay-ins) | Pay Organization (`pay_organization`) | one Organizations |  |
| Inventory Checkout | Project (`project`) | one Projects |  |
| Inventory Checkout | Technician (`technician`) | one Employees |  |
| Payroll (Payouts) | Employee (`employee`) | one Employees |  |
| Products | Supplier (`supplier`) | one Suppliers (utility list) |  |
| Products | Brand (`brand`) | one Brands (utility list) |  |
| Sale | Serial (`serial`) | one Stock |  |
| Sale | Brand (`brand`) | one Brands (utility list) |  |
| Sale | Destination (`destination`) | one Projects |  |
| Sale | Staff (`staff_member`) | one Employees |  |
| Stock | SKU (`sku`) | one Products |  |
| Stock | Brand (`brand`) | one Brands (utility list) |  |
| Stock | Destination (`destination`) | one Projects |  |
| Stock | Staff (`staff_member`) | one Employees |  |
| Knowledge Base Articles | Category (`fx_techsquad_util_knowledge_base_category_id`) | one Knowledge Base Categories (utility list) |  |
| Knowledge Base Articles | Audience (`site_group_id_list`) | many User groups |  |
| Job Report | Project (`project`) | one Projects |  |
| Job Report | Team (`team_1`) | many Employees | Status = Active + Reports |
| Job Report | Tag Someone (`tag_someone`) | many Employees |  |
| Job Report | Vehicle (`vehicle`) | one Fleet (Vehicles) | Populate on Reports = Yes |
| Note | Project (`project`) | one Projects |  |
| Staff Performance | Staff Member (`staff_member`) | one Employees | Status = Active or Active + Reports |
| Survey and Proposals | Project (`project`) | one Projects |  |
| TV Installation | Project (`project`) | one Projects |  |
| TV Installation | Team (`team`) | many Employees | Status = Active + Reports |

Pickers that depend on another field:
- **Projects → Design Firm / General Contractor / Builder-Developer** only offer Organizations of the matching Type.
- **Projects → Lead Designer / GC PM** only offer Contacts whose Type is *Design Firm* or *General Contractor* respectively.
- **Contacts → Organization Name** only offers Organizations whose Type equals *this contact's* Type.

### 2.2 Auto-fill when a lookup is picked

When the user picks a record in these lookups, values are copied from the picked record into the form. The user can still edit them afterwards.

| Form | When this is picked… | …copy these values | Note |
|---|---|---|---|
| Projects | Job Owner (Contact) | Contact *Main Phone* → *Owner Contact* | only if the source is not empty |
| Permits | Project | Project *Job Address* → *Address*; Project *Job Owner* → *Owner Name*; Project *Owner Contact* → *Owner Phone Number* | only if the source is not empty |
| Stock | SKU (Product) | Location, Product Type, Brand, Model, Sell Price, Cost | these Stock fields are read-only, so they always come from the Product |
| Sale | Serial (Stock item) | MAC, Product Type, Brand, Model, Sell Price, Cost (+ Location ⚠ the Sale table has no Location field, §9 Q12) | read-only copies |
| Employees | Drivers License upload | An ID-card scan (OCR) fills First/Last Name, Home Address, D/L Expiration and Date of Birth (+ State, City, Zip and DL Number ⚠ those fields do not exist, §9 Q13) | WebAuthor AI feature. Phase 1 stores the upload only; the scan is a good Phase 2 AI task |

### 2.3 Computed (formula) fields

| Table | Field | Formula |
|---|---|---|
| Projects | Approved | Sum of *Transactions.Amount* where *Apply to Project* = this project and *Type* = `Proposal` (label "Approved Proposal") |
| Projects | Invoiced | Same, with *Type* = `Invoice` |
| Projects | Paid | Same, with *Type* = `Payment` |

*Reimbursement* and *Account Credit* transactions are not counted anywhere.

---

## 3. Tables and fields

Conventions for the tables below:
- **Req ✔** means required when saving. A required field that a rule has hidden is **not** enforced. This matters for Transactions, where every branch has required fields.
- **Options** are listed in display order. If the stored value differs from the label, it is shown as *(stored as `value`)*. Every dropdown also has an empty "Select One" choice, which is not listed.
- **"starts hidden (shown by a rule)"** means the field is hidden when the form opens and appears only when a rule in §4 shows it.
- Bold rows in a table are section headings on the form.
- System columns (§1.3) are omitted.

### Projects

`fx_techsquad_projects` · module **Projects**
 · new-record button "New Project" · submitting a record starts workflow **Project Proposal** and locks the record

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Job Status | `current_phase` | Dropdown |  | Options: Surveying · Create Proposal · Proposal Revisions · Proposal Sent · Proposal Approved · ON HOLD · Infrastructure · Installation · Programming · Complete · Proposal Denied |
| | **BASIC INFORMATION** | | | | |
| 2 | Project Name | `title` | Text | ✔ | max 50 chars |
| 3 | Type | `type` | Dropdown | ✔ | Options: Residential · Commercial |
| 4 | Category | `category_1` | Dropdown | ✔ | Options: Low Voltage · Electrical |
| 5 | Job Owner | `contact` | Lookup → Contacts | ✔ | on pick, copies main_phone→owner_contact (only non-empty values) |
| 6 | Job Address | `home_address` | Address |  |  |
| 7 | Owner Contact | `owner_contact` | Phone |  | max 30 chars |
| 8 | Owner Contact Intl | `owner_contact_intl` | Text |  | must match `^[0-9+\-() ]{1,20}$` (max 20); max 30 chars |
| 9 | Door / Gate Code | `door_gate_code` | Text |  |  |
| 10 | Building or Development | `is_this_project_located_in_a_building_or_developme` | Yes/No |  |  |
| 11 | Building / Development | `which_one` | Lookup → Buildings / Developments |  | starts hidden (shown by a rule) |
| 12 | Apartment or Unit  # | `apartment_or_unit` | Text |  | starts hidden (shown by a rule); max 20 chars |
| | **INSURANCE AND PERMIT INFORMATION** | | | | |
| 13 | Job COI | `job_coi` | File upload |  |  |
| 14 | Permit | `project_permit` | Yes/No |  |  |
| 15 | Choose Permit | `permit` | Lookup → Permits |  | starts hidden (shown by a rule) |
| | **INDIVIDUALS AND ORGANIZATIONS INVOLVED** | | | | |
| 16 | Designer | `is_there_a_designer_involved` | Yes/No |  |  |
| 17 | Design Firm | `job_designer` | Lookup → Organizations |  | starts hidden (shown by a rule); only offers records where Type = Design Firm |
| 18 | Lead Designer | `designer` | Lookup → Contacts |  | only offers records where Type = Design Firm |
| 19 | Designer Notes | `notes` | Long text |  | starts hidden (shown by a rule); max 1000 chars |
| 20 | General Contractor | `is_there_a_gg_involved` | Yes/No |  |  |
| 21 | General Contractor | `job_gc` | Lookup → Organizations |  | starts hidden (shown by a rule); only offers records where Type = General Contractor |
| 22 | GC PM | `gc_pm` | Lookup → Contacts |  | only offers records where Type = General Contractor |
| 23 | GC Notes | `general_contractor_notes` | Long text |  | starts hidden (shown by a rule); max 1000 chars |
| 24 | Builder or Developer | `is_there_a_builder_or_developer_involved_1` | Yes/No |  |  |
| 25 | Builder / Developer | `is_there_a_builder_or_developer_involved` | Lookup → Organizations |  | starts hidden (shown by a rule); only offers records where Type = Developer Builder |
| 26 | Builder / Developer Notes | `builber_developer_notes` | Long text |  | starts hidden (shown by a rule); max 1000 chars |
| 27 | Referral | `referral_1` | Radio buttons |  | Options: None · Person · Organization; default: None |
| 28 | Person | `referral` | Lookup → Contacts |  |  |
| 29 | Organization | `organization` | Lookup → Organizations |  |  |
| 30 | Commission Notes | `commission_notes` | Long text |  | starts hidden (shown by a rule); max 1000 chars |
| | **FILE SECTION** | | | | |
| 31 | Survey Videos Links | `survey_videos_links` | Long text |  | placeholder “Paste One Drive links to Survey Videos Here”; max 300 chars |
| 32 | Plans | `plans_folder` | Long text |  | placeholder “Paste One Drive links to folders and special notes here”; max 1000 chars |
| | **FINANCIAL STATUS** | | | | |
| 33 | Approved | `approved` | Computed |  | = SUM of Transactions.Amount where Apply to Project = this project and Type = Proposal |
| 34 | Invoiced | `total_amount_invoiced` | Computed |  | = SUM of Transactions.Amount where Apply to Project = this project and Type = Invoice |
| 35 | Paid | `total_amount_paid` | Computed |  | = SUM of Transactions.Amount where Apply to Project = this project and Type = Payment |
| 36 | Financial Status | `financial_status` | Dropdown |  | Options: Current · Delinquent |
| | **WARRANTY** | | | | |
| 37 | Warranty | `warranty` | Yes/No |  |  |
| 38 | Start Date | `start_date` | Date |  |  |
| | **MAINTENANCE PLAN** | | | | |
| 39 | Maintenance Plan | `maintenance_plan` | Yes/No |  |  |
| 40 | Type | `maintenance_type` | Dropdown |  | Options: Bronze · Silver · Gold · Custom; starts hidden (shown by a rule) |
| 41 | Status | `maintenance_status` | Dropdown |  | Options: Expired · Active · Renewal Alert; starts hidden (shown by a rule) |
| 42 | Purchase Date | `date_of_purchase` | Date |  | starts hidden (shown by a rule) |
| 43 | Sales Person | `sales_person` | Lookup → Employees |  | starts hidden (shown by a rule) |
| 44 | Amount | `amount` | Money |  | starts hidden (shown by a rule) |
| 45 | History | `history` | Long text |  | starts hidden (shown by a rule); max 1000 chars |
| 46 | Receipt of Payment | `receipt_of_payment` | File upload |  | starts hidden (shown by a rule) |
| | **EQUIPMENT AND MATERIALS** | | | | |
| 47 | Special Orders | `special_order` | Yes/No |  |  |
| 48 | List Items | `list_items` | Long text |  | starts hidden (shown by a rule); placeholder “List all special order and custom items here. Also, items with an extended lead time that we need to plan ahead.”; max 1000 chars |
| | **OLDER REPORTS** | | | | |
| 49 | Reports and Pictures Section | `reports_and_pictures_section` | Long text |  | max 1000 chars |
| | **SYSTEMS AND PASSWORDS** | | | | |
| 50 | System Credentials | `system_credentials` | Long text |  | max 1000 chars |
| 51 | Systems | `systems` | Checkboxes (multi) |  | Options: CRESTRON SIMPL · CRESTRON STUDIO · CRESTRON HOME · CONTROL4 · LUTRON QS / QSX · LUTRON LEGACY · SONOS · IC REALTIME · HIKVISION / ACEGEAR · WYZE · RING · EERO · NEST · VANTAGE · UNIFI · ARAKNIS · BOND |
| 52 | Locked | `locked` | Yes/No |  |  |
| 53 | Date Submitted | `date_submitted` | Date + time |  |  |

*Summary counts shown on the record:* Files, Notes, WF Timeline, RMA, Job Report, Pay-ins, Inventory Checkout, TV Installation, Survey and Proposals, Note, Sale, Stock.

### Contacts

`fx_techsquad_projects_xmcontacts` · module **Projects**
 · new-record button "New Contact"

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Title | `title` | Hidden |  | auto-generated record title (not on form) |
| 2 | Type | `type` | Dropdown | ✔ | Options: End Customer · Designer *(stored as `Design Firm`)* · Commercial Customer · Developer / Builder *(stored as `Developer Builder`)* · General Contractor · Concierge · Realtor · Supplier · Service Provider; default: End Customer |
| 3 | First Name | `first_name` | Text | ✔ | max 40 chars |
| 4 | Last Name | `last_name` | Text |  | max 40 chars |
| 5 | Organization Name | `organization_name` | Lookup → Organizations |  | starts hidden (shown by a rule); only offers Organizations whose Type = this contact's Type |
| 6 | Role / Position | `role_position` | Text |  | starts hidden (shown by a rule) |
| 7 | Alias / DBA | `alias_dba` | Text |  |  |
| 8 | Address | `home_address` | Address |  |  |
| 9 | Main Phone | `main_phone` | Phone |  | max 20 chars |
| 10 | Phone Ext | `phone_extension` | Text |  | max 10 chars |
| 11 | Intl Phone | `intl_phone` | Text |  | must match `^[0-9+\-() ]{1,20}$` (max 20); max 25 chars |
| 12 | Email | `email` | Email |  | max 50 chars |
| 13 | Alternate Contact ? | `secretary_or_concierge` | Yes/No |  |  |
| 14 | Alternate Name | `concierge` | Long text |  | starts hidden (shown by a rule); max 50 chars |
| 15 | Alternate Role / Tilte | `alternate_role_tilte` | Text |  | starts hidden (shown by a rule) |
| 16 | Alternate Intl Phone | `alternate_intl_phone` | Text |  | starts hidden (shown by a rule); must match `^[0-9+\-() ]{1,20}$` (max 20); max 25 chars |
| 17 | Alternate Phone | `alternate_phone` | Phone |  | starts hidden (shown by a rule); max 20 chars |
| 18 | Alternate Email | `email_1_2_3` | Email |  | starts hidden (shown by a rule) |
| 19 | Preferred Language | `language` | Dropdown |  | Options: English · Español · Português |
| 20 | Notes | `customer_notes` | Long text |  | placeholder “Details, Special Instructions, Etc”; max 1000 chars |
| 21 | Profile Picture | `profile_picture` | Image |  |  |
| | **Referral** | | | | |
| 22 | Referred by anyone? | `referred_by_1` | Yes/No |  |  |
| 23 | Organization | `referred_by_organization` | Lookup → Organizations |  |  |
| 24 | Person | `referred_by_contact` | Lookup → Contacts |  |  |
| 25 | Employee | `employee` | Lookup → Employees |  |  |

*Summary counts shown on the record:* Interactions, Projects, Payouts, Permits, Payments.

### Contact Interactions

`fx_techsquad_projects_xmcontacts_interactions` · module **Projects**
 · child rows of a Contact (shown as the “Interactions” sub-grid on the contact)

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Title | `title` | Hidden | ✔ | auto-generated record title (not on form); read-only |
| 2 | Type | `type` | Radio buttons |  | Options: Phone Call · Email · Text · In Person |
| 3 | Date | `date` | Date |  | default: today |
| 4 | Result | `result` | Dropdown |  | Options: No Answer · Voicemail · Interested |
| 5 | Follow Up Date | `follow_up_date` | Date |  |  |

### Buildings / Developments

`fx_techsquad_projects_xmbuildings` · module **Projects**
 · new-record button "New Building"

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Building / Developement | `title` | Text | ✔ | max 50 chars |
| 2 | Address | `home_address` | Address |  |  |
| 3 | Work Hours | `work_hours_1` | Text |  | max 30 chars |
| 4 | Details | `details` | Long text |  | max 1000 chars |
| 5 | Website | `website` | URL |  |  |
| 6 | Certificate of Insurance ( COI ) | `upload_coi` | File upload |  |  |
| 7 | COI Expiration | `coi_expiration` | Date |  |  |
| 8 | Picture | `picture` | Image |  |  |
| 9 | COI Status | `coi_status` | Dropdown |  | Options: Active · Expired |
| | **Administrative Office** | | | | |
| 10 | Building Admin | `admin_name` | Text |  | max 30 chars |
| 11 | Admin Phone | `phone_number_main` | Phone |  | max 30 chars |
| 12 | Email | `email` | Email |  |  |
| | **Receiving Office** | | | | |
| 13 | Receiving Agent | `receiving_agent` | Text |  | max 30 chars |
| 14 | Receiving Phone | `phone_number_alternate` | Phone |  | max 30 chars |
| 15 | Email | `email_1_2` | Email |  |  |
| | **Front Desk / Engineering** | | | | |
| 16 | Contact | `front_desk_or_engineering` | Text |  | max 50 chars |
| 17 | Front Desk Phone | `front_desk_phone` | Phone |  | max 30 chars |
| 18 | Email | `email_1` | Email |  |  |

*Summary counts shown on the record:* Projects.

### Permits

`fx_techsquad_projects_xmpermits` · module **Projects**
 · new-record button "New Permit"

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Title | `title` | Hidden |  | auto-generated record title (not on form) |
| 2 | Municipality | `municipality` | Lookup → Organizations | ✔ | only offers records where Type = Municipality |
| 3 | Type | `type` | Dropdown | ✔ | Options: Electrical · Low Voltage |
| 4 | Project | `project` | Lookup → Projects | ✔ | on pick, copies home_address→home_address, contact→first_name, owner_contact→owner_phone_number (only non-empty values) |
| 5 | Address | `home_address` | Address |  |  |
| 6 | Owner Name | `first_name` | Lookup → Contacts |  |  |
| 7 | Owner Phone Number | `owner_phone_number` | Phone |  | max 30 chars |
| 8 | Status | `status` | Dropdown |  | Options: Applied · Ready for 1st Inspection · Passed Rough · Passed Final, Done *(stored as `Passed Final Done`)* · Failed Inspection, Re-schedule *(stored as `Failed Inspection Re-schedule`)* · Missing Documents |
| 9 | EL Permit Number | `permit_number` | Text |  |  |
| 10 | Master Permit Number | `master_permit_number` | Text |  |  |
| 11 | Permit Expiration Date | `permit_expiration_date` | Date |  |  |
| 12 | Permit Expiration | `permit_expiration` | Dropdown |  | Options: Active · Expired · Renew Soon |
| 13 | Permit Card ( JPG ) | `permit_card` | Image |  |  |
| 14 | Permit Card ( PDF ) | `permit_card_pdf` | File upload |  |  |
| 15 | Notes | `notes` | Long text |  | max 1000 chars |
| 16 | Inspection Records and Additional Files | `inspection_records_and_additional_files` | File upload |  |  |

*Summary counts shown on the record:* Projects.

### Organizations

`fx_techsquad_projects_xmorganizations` · module **Projects**
 · new-record button "New Organization"

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Organization Name | `title` | Text |  | max 50 chars |
| 2 | Type | `type` | Dropdown | ✔ | Options: Design Firm · Commercial Customer · Developer / Builder *(stored as `Developer Builder`)* · General Contractor · Concierge · Realtor · Supplier · Municipality · Service Provider |
| 3 | DBA ( or Legal name ) | `dba_or_legal_name` | Text |  | max 50 chars |
| 4 | Address | `address` | Address |  |  |
| 5 | Main Phone | `main_phone` | Phone |  | max 15 chars |
| 6 | Main Email | `main_email` | Email |  | max 50 chars |
| 7 | Default Commission / Markup | `default_commission_markup` | Text |  | Options: 5% · 10% · 15% · 20% · 25% · 30%; starts hidden (shown by a rule); max 20 chars |
| 8 | Tax Exempt ? | `tax_exempt` | Yes/No |  | starts hidden (shown by a rule) |
| 9 | Florida DR-13 | `florida_dr13` | File upload |  | starts hidden (shown by a rule) |
| 10 | Certificate of insurance ( COI ) | `certificate_of_insurance_coi` | File upload |  | starts hidden (shown by a rule) |
| 11 | Dealer Number | `dealer_number` | Text |  | starts hidden (shown by a rule); max 20 chars |
| 12 | COI Expiration | `coi_expiration` | Date |  |  |
| 13 | Website | `website` | URL |  |  |
| 14 | Login | `login` | Text |  | starts hidden (shown by a rule) |
| 15 | Password | `password` | Text |  | starts hidden (shown by a rule); max 20 chars |
| 16 | Contracts, Dealer Application | `contracts_dealer_application` | File upload |  | starts hidden (shown by a rule) |
| 17 | Price Sheets | `price_sheets` | File upload |  | starts hidden (shown by a rule) |
| 18 | Product Catalogs and Brochures | `product_catalogs_and_brochures` | File upload |  | starts hidden (shown by a rule) |
| 19 | Logo | `logo` | Image |  |  |
| 20 | Details | `details` | Long text |  | max 1000 chars |

*Summary counts shown on the record:* Contacts, Payouts, Projects, RMA, Permits, Payments.

### Punch List

`fx_techsquad_projects_xmpunch_list` · module **Projects**
 · new-record button "New Item" · submitting a record starts workflow **Punch List Workflow** and locks the record

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Created | `title` | Hidden |  | auto-generated record title (not on form) |
| 2 | Project | `project` | Lookup → Projects |  |  |
| 3 | Type | `type` | Dropdown |  | Options: RFI ( Request for Information ) · Infrastructure · Installation · Programming · Purchase · Proposal / Change Order · Engraving |
| 4 | Team | `team_1` | Lookup → Employees |  |  |
| 5 | Details | `details` | Long text |  | max 1000 chars |
| 6 | Priority | `urgency` | Dropdown |  | Options: Urgent · ASAP · To Be Scheduled |
| 7 | Due Date | `due_date` | Date |  |  |
| 8 | Status | `status_1` | Dropdown |  | Options: Review · Scheduled · In Progress · On Hold · Completed · Canceled |
| 9 | Locked | `locked` | Yes/No |  | default: 0 |
| 10 | File Upload | `file_upload` | File upload |  |  |
| 11 | Date Submitted | `date_submitted` | Date + time |  |  |

### Employees

`fx_techsquad_employee` · module **Administrative**
 · new-record button "New Employee"

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Title | `title` | Hidden |  | auto-generated record title (not on form) |
| 2 | First Name | `first_name` | Text | ✔ | max 30 chars |
| 3 | Last Name | `last_name` | Text | ✔ | max 30 chars |
| 4 | Department | `department` | Radio buttons (multi-select) | ✔ | Options: LOW VOLTAGE · ELECTRICAL |
| 5 | Status | `status` | Dropdown | ✔ | Options: Active · Active + Reports *(stored as `Reports`)* · Inactive · Freelance |
| 6 | Date of Birth | `date_of_birth` | Date |  | cannot be in the future |
| 7 | Home Address | `home_address` | Address |  |  |
| 8 | Email | `email` | Email |  |  |
| 9 | Phone Number | `phone_number` | Phone |  | max 30 chars |
| 10 | Drivers License | `drivers_license` | File upload |  | allowed: jpg,jpeg,png,pdf; ID-card scan auto-fills: state_in_address→state, first_name→first_name, address→home_address, last_name→last_name, expiration_date→dl_expiration, zip_code_in_address→zip, document_number→dl_number, city_in_address→city, date_of_birth→date_of_birth |
| 11 | D/L Expiration | `dl_expiration` | Date |  |  |
| 12 | D/L Status | `dl_status_1` | Dropdown |  | Options: Active · Expired |
| 13 | Type | `type_1` | Radio buttons | ✔ | Options: 1099 Sub · W2 Employee |
| 14 | Social Security Number | `ssn` | SSN (masked) |  |  |
| 15 | Company Name | `company_name` | Text |  |  |
| 16 | Workers' Comp Exemption Certificate | `workers_comp_exemption_certificate` | File upload |  |  |
| 17 | EIN# | `sunbiz` | EIN (Sunbiz link) |  |  |
| 18 | Workers' Comp Exemption Expiration | `workers_comp_exemption_expiration` | Date |  |  |
| 19 | Effective Start Date | `effective_start_date` | Date |  |  |
| 20 | Termination Date | `termination_date` | Date |  |  |

*Summary counts shown on the record:* Files, Notes, WF Timeline, Projects, Punch List, Job Report, Contacts, TV Installation, Sale, Stock.

### Fleet (Vehicles)

`fx_techsquad_employee_xmfleet` · module **Administrative**
 · new-record button "New Vehicle"

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Populate on Reports | `populate_on_reports` | Radio buttons |  | Options: Yes · No |
| 2 | Year | `year` | Number |  |  |
| 3 | Make and Model | `make_and_model` | Text |  | max 50 chars |
| 4 | Tag # | `tag` | Text |  | max 20 chars |
| 5 | VIN# | `vin` | Text |  | max 17 chars |
| 6 | Insurance Card | `insurance_card_1_2` | Image |  |  |
| 7 | FL Registration | `fl_registration` | Image |  |  |
| 8 | Vehicle | `vehicle` | Image |  |  |
| 9 | Maintenance Records, Invoices, Receipts | `maintenance_records_invoices_receipts` | File upload |  |  |
| 10 | DMV Title | `title_1` | File upload |  |  |

*Summary counts shown on the record:* Job Report.

### Tasks

`fx_techsquad_employee_xmtasks` · module **Administrative**
 · new-record button "New Task"

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Date Created | `title` | Text |  | not shown on the form (auto title); max 50 chars |
| 2 | Member | `member` | Lookup → Employees |  |  |
| 3 | Status | `status` | Dropdown |  | Options: Pending · Working · Completed |
| 4 | Details | `deatils` | Long text |  | max 1000 chars |
| 5 | Due Date | `due_date` | Date |  |  |
| 6 | Priority | `priority` | Dropdown |  | Options: ASAP · Urgent |
| 7 | Status | `status_1` | Dropdown |  | Options: On-Time · Due |
| 8 | File Upload | `file_upload` | File upload |  |  |

### RMA

`fx_techsquad_employee_xmrma` · module **Administrative**
 · new-record button "New RMA"

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Title | `title` | Text |  |  |
| 2 | Client | `fld_client` | Lookup → Projects |  |  |
| 3 | Manufacturer | `manufacturer` | Lookup → Organizations |  |  |
| 4 | Equipment Description or Model # | `equipment_description_or_model` | Text |  |  |
| 5 | Serial Number (s) | `serial_number` | Text |  |  |
| 6 | Date Submitted | `date_submitted` | Date |  | default: today |
| 7 | RMA Number | `rma_number` | Text |  | max 50 chars |
| 8 | Details | `details` | Long text |  | max 1000 chars |
| 9 | Status | `status` | Dropdown |  | Options: RMA Created · Sent to Manufacturer · Completed ( received ) |
| 10 | Upload Receipt or Pictures | `rma_receipt` | File upload |  |  |

### Transactions (Pay-ins)

`fx_techsquad_employee_xmpayins` · module **Administrative**
 · new-record button "New Transaction"

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Title | `title` | Text |  | not shown on the form (auto title); max 200 chars |
| 2 | Payment Type | `payment_type` | Radio buttons | ✔ | Options: Apply to Project · Pay Individual · Pay Organization |
| 3 | Apply to Project | `project_payin` | Lookup → Projects | ✔ | starts hidden (shown by a rule) |
| 4 | Type | `payin_type_1` | Dropdown | ✔ | Options: Approved Proposal *(stored as `Proposal`)* · Invoice · Payment · Reimbursement · Account Credit *(stored as `Credit`)*; starts hidden (shown by a rule) |
| 5 | Pay Individual | `pay_individual` | Lookup → Contacts | ✔ | starts hidden (shown by a rule) |
| 6 | Pay Organization | `pay_organization` | Lookup → Organizations | ✔ | starts hidden (shown by a rule) |
| 7 | Reason | `reason` | Radio buttons | ✔ | Options: Commission · Services or Goods · Reimbursement; starts hidden (shown by a rule) |
| 8 | Description | `description` | Text | ✔ |  |
| 9 | Portal Proposal or Invoice # | `portal_proposal` | Text |  | starts hidden (shown by a rule); max 10 chars |
| 10 | Amount | `amount` | Money | ✔ |  |
| 11 | Date | `date` | Date |  | default: today |
| 12 | PDF | `proposal_pdf` | File upload |  |  |

### Inventory Checkout

`fx_techsquad_employee_xminventory_checkout` · module **Administrative**
 · new-record button "New Checkout"

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Type | `type` | Radio buttons |  | Options: Materials for a Project *(stored as `Materials`)* · Tools for Technician *(stored as `Tools`)*; default: Materials |
| 2 | Project | `project` | Lookup → Projects |  |  |
| 3 | Technician | `technician` | Lookup → Employees |  |  |
| 4 | Date | `date` | Date |  | default: today |
| 5 | Equipment | `equipment` | Long text |  |  |
| 6 | Pictures | `pictures` | File upload |  |  |

### Payroll (Payouts)

`fx_techsquad_employee_xmpayouts` · module **Administrative**
 · new-record button "New Payment"

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Title | `title` | Hidden |  | auto-generated record title (not on form) |
| 2 | Employee | `employee` | Lookup → Employees |  |  |
| 3 | Reason | `reason` | Dropdown | ✔ | Options: Scheduled Salary or Compensation · Salary Advance · Loan · Commission · Reimbursement |
| 4 | Amount | `amount` | Money |  |  |
| 5 | Date Issued | `date_issued` | Date |  | default: today |
| 6 | Method of payment | `method_of_payment` | Dropdown |  | Options: Check · Zelle or wire transfer · Cash |
| 7 | Check Number | `check_number` | Number |  | starts hidden (shown by a rule) |
| 8 | Check image or electronic receipt | `check_image_or_electronic_receipt` | File upload |  |  |
| 9 | Details ( Optional ) | `details_optional` | Long text |  | max 1000 chars |

### Products

`fx_techsquad_inventory` · module **Inventory**
 · new-record button "New Product"

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Title | `title` | Hidden |  | auto-generated record title (not on form) |
| 2 | Product Type | `product_type` | Dropdown |  | Options: Amplifier · Dimmer · Speaker · Television |
| 3 | Supplier | `supplier` | Lookup → Suppliers (utility list) |  |  |
| 4 | Brand | `brand` | Lookup → Brands (utility list) |  |  |
| 5 | SKU | `sku` | Text |  | max 20 chars |
| 6 | Model | `model` | Text |  | max 30 chars |
| 7 | Sell Price | `sell_price` | Money |  |  |
| 8 | Cost | `cost` | Money |  |  |
| 9 | Location | `location` | Text |  | max 50 chars |
| 10 | Image | `image` | File upload |  |  |

*Summary counts shown on the record:* Files, Notes, WF Timeline.

### Sale

`fx_techsquad_inventory_xmsale` · module **Inventory**
 · new-record button "New Item"

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Title | `title` | Hidden |  | auto-generated record title (not on form) |
| 2 | Serial | `serial` | Lookup → Stock | ✔ | on pick, copies mac_address→mac_address, product_type→product_type, brand→brand, model→model, sell_price→sell_price, cost→cost, location→location; picker shows the target's serial |
| 3 | MAC | `mac_address` | Text |  | read-only; max 50 chars |
| 4 | Product Type | `product_type` | Dropdown |  | Options: Amplifier · Dimmer · Speaker · Television; read-only |
| 5 | Brand | `brand` | Lookup → Brands (utility list) |  | read-only |
| 6 | Model | `model` | Text |  | read-only; max 30 chars |
| 7 | Sell Price | `sell_price` | Money |  | read-only |
| 8 | Cost | `cost` | Money |  | read-only |
| 9 | Destination | `destination` | Lookup → Projects |  |  |
| 10 | Staff | `staff_member` | Lookup → Employees |  |  |

*Summary counts shown on the record:* Files, Notes.

### Stock

`fx_techsquad_inventory_xmstock` · module **Inventory**
 · new-record button "New Item" · submitting a record starts workflow **Stock Status** and locks the record

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | SKU | `sku` | Lookup → Products | ✔ | on pick, copies location→location, product_type→product_type, brand→brand, model→model, sell_price→sell_price, cost→cost; picker shows the target's sku |
| 2 | Serial | `serial` | Text | ✔ | max 50 chars |
| 3 | MAC | `mac_address` | Text |  | max 50 chars |
| 4 | Location | `location` | Text |  | read-only; max 50 chars |
| 5 | Product Type | `product_type` | Dropdown |  | Options: Amplifier · Dimmer · Speaker · Television; read-only |
| 6 | Brand | `brand` | Lookup → Brands (utility list) |  | read-only |
| 7 | Model | `model` | Text |  | read-only; max 30 chars |
| 8 | Sell Price | `sell_price` | Money |  | read-only |
| 9 | Cost | `cost` | Money |  | read-only |
| 10 | Destination | `destination` | Lookup → Projects |  |  |
| 11 | Staff | `staff_member` | Lookup → Employees |  |  |
| 12 | Status | `status` | Dropdown |  | Options: In Stock · On Project · RMA |
| 13 | Locked | `locked` | Yes/No |  | not shown on the form |
| 14 | Date Submitted | `date_submitted` | Date |  | not shown on the form |

*Summary counts shown on the record:* Files, Notes, WF Timeline, Sale.

### Support Tickets

`fx_techsquad_help_desk` · module **TS Help Desk**
 · new-record button "New Ticket"

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Title | `title` | Hidden |  | auto-generated record title (not on form) |
| 2 | Issue Description | `issue_description` | Long text | ✔ | placeholder “Please explain your issue.”; max 500 chars |
| 3 | Upload or Paste Error | `upload_error` | File upload |  |  |
| 4 | Priority Level | `priority_level` | Dropdown | ✔ | Options: Low · Medium · High · Urgent |
| 5 | Are you the only one with this issue? | `are_you_the_only_one_with_this_issue` | Radio buttons | ✔ | Options: Yes *(stored as `1`)* · No *(stored as `0`)*; default: 1 |
| 6 | Status | `status` | Dropdown | ✔ | Options: Pending · In-Progress · Completed |
| 7 | Assigned To | `assigned_to` | Lookup → User |  | read-only |
| 8 | Issue Category | `issue_category` | Dropdown |  | Options: EFS Mod · CRM Issue · Hardware · Software · Revation Issue · Login Issue · Tableau Issue |
| 9 | Date Closed | `date_closed` | Date |  |  |

*Summary counts shown on the record:* Files, Notes, WF Timeline, Support Note.

### Support Notes

`fx_techsquad_help_desk_support_note` · module **TS Help Desk**
 · child rows of a Support Ticket (the “Support Note” sub-grid); notes can be added/edited but not deleted

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Assigned to | `assigned_to` | Lookup → User | ✔ |  |
| 2 | Note Date | `note_date` | Date | ✔ | default: today |
| 3 | Note | `note` | Long text | ✔ | max 300 chars |
| 4 | Issue Category | `issue_category` | Dropdown | ✔ | Options: EFS Mod · CRM Issue · Hardware · Software · Revation Issue · Login Issue · Tableau Issue · Other |
| 5 | Status | `status` | Dropdown | ✔ | Options: Pending · Closed · Send to DEL |
| 6 | Closed Date | `closed_date` | Date |  | default: today |

### Knowledge Base Articles

`fx_techsquad_help_desk_xmarticles` · module **TS Help Desk**
 · new-record button "New Article"

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Title | `title` | Text | ✔ | max 200 chars |
| 2 | Category | `fx_techsquad_util_knowledge_base_category_id` | Lookup → Knowledge Base Categories (utility list) |  |  |
| 3 | Audience | `site_group_id_list` | Lookup (multi) → User group |  | placeholder “Select Group(s)” |
| 4 | Status | `status` | Dropdown |  | Options: Pending · Published |
| 5 | Date of Update | `date_of_update` | Date | ✔ | default: today |
| 6 | Photo | `photo` | File upload |  |  |
| 7 | Videos/Files | `video` | File upload |  |  |
| 8 | Video Link | `video_link` | Text |  | max 200 chars |
| 9 | Content | `content` | Rich text |  |  |
| 10 | View Count | `view_count` | Hidden |  | not shown on form |

### Suppliers (utility list)

`fx_techsquad_util_supplier` · module **Utility tables**
 · new-record button "New Record"

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Title | `title` | Hidden |  | auto-generated record title (not on form) |
| 2 | Company Name | `company_name` | Text | ✔ | max 50 chars |

### Brands (utility list)

`fx_techsquad_util_brand` · module **Utility tables**
 · new-record button "New Brand"

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Title | `title` | Hidden |  | auto-generated record title (not on form) |
| 2 | Brand | `brand` | Text | ✔ |  |

### Knowledge Base Categories (utility list)

`fx_techsquad_util_knowledge_base_category` · module **Utility tables**

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Title | `title` | Text |  | max 200 chars |
| 2 | Icon Class | `icon_class` | Text |  | max 50 chars |
| 3 | Place | `place` | Number |  |  |
| 4 | Active | `active` | Yes/No |  | default: 1 |

### Job Report

`frx_techsquad_job_report` · module **FLEX Forms**
 · new-record button "New Record"

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Title | `title` | Hidden |  | auto-generated record title (not on form) |
| 2 | Project | `project` | Lookup → Projects | ✔ |  |
| 3 | Date | `date` | Date | ✔ | default: today |
| 4 | Team | `team_1` | Lookup (multi) → Employees | ✔ | only offers records where Status = Active + Reports (`Reports`) |
| 5 | Tag Someone | `tag_someone` | Lookup (multi) → Employees |  |  |
| 6 | Vehicle | `vehicle` | Lookup → Fleet (Vehicles) | ✔ | only offers records where Populate On Reports = Yes |
| 7 | Report | `report` | Long text |  |  |
| 8 | 1 - Pending | `pending` | Long text |  | max 8000 chars |
| 9 | 2 - Pending | `next_pending` | Long text |  | starts hidden (shown by a rule); max 8000 chars |
| 10 | 3 - Pending | `next_pendning` | Long text |  | starts hidden (shown by a rule); max 8000 chars |
| 11 | 4 - Pending | `fld_4_pending` | Long text |  | starts hidden (shown by a rule); max 8000 chars |
| 12 | 5 - Pending | `fld_5_pending` | Long text |  | starts hidden (shown by a rule); max 8000 chars |
| 13 | Login and Passwords | `login_and_passwords` | Long text |  | max 1000 chars |
| 14 | Maintenance Plan Service Call ? | `maintenance_plan_service_call` | Yes/No |  |  |
| 15 | Upload Files (25MB MAX) | `upload_files` | File upload |  |  |

*Summary counts shown on the record:* Files, Notes.

### Note

`frx_techsquad_note` · module **FLEX Forms**
 · new-record button "New Note"

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Title | `title` | Hidden |  | auto-generated record title (not on form) |
| 2 | Project | `project` | Lookup → Projects |  |  |
| 3 | Type of Note | `type_of_note` | Radio buttons |  | Options: ORDER MATERIAL *(stored as `ORDER`)* · INFORMATION · ISSUE |
| 4 | Description | `description` | Long text |  | max 1000 chars |

*Summary counts shown on the record:* Files, Notes.

### Staff Performance

`frx_techsquad_staff_performance` · module **FLEX Forms**

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Title | `title` | Hidden |  | auto-generated record title (not on form) |
| 2 | Staff Member | `staff_member` | Lookup → Employees | ✔ | only offers employees with Status Active or Active + Reports |
| 3 | Date | `date` | Date |  |  |
| 4 | Type | `positive_negative` | Radio buttons |  | Options: Positive · Negative |
| 5 | Description | `description` | Long text |  | max 2500 chars |
| 6 | Upload Picture | `upload_picture` | File upload |  | allowed: jpg,jpeg,png |

*Summary counts shown on the record:* Files, Notes.

### Survey and Proposals

`frx_techsquad_survey_and_proposals` · module **FLEX Forms**
 · new-record button "New Report"

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Title | `title` | Hidden |  | auto-generated record title (not on form) |
| 2 | Project | `project` | Lookup → Projects |  | placeholder “Leave it blank for new projects” |
| 3 | Survey Details | `survey_details` | Long text |  | max 1000 chars |
| 4 | Pictures and Videos | `pictures_and_videos` | File upload |  |  |
| 5 | Plans | `plans` | File upload |  |  |

*Summary counts shown on the record:* Files, Notes.

### TV Installation

`frx_techsquad_tv_installation` · module **FLEX Forms**
 · new-record button "New Installation"

| # | Field | Column | Type | Req | Options / notes |
|---|---|---|---|---|---|
| 1 | Title | `title` | Hidden |  | auto-generated record title (not on form) |
| | **INSTALLATION AND EQUIPMENT CONDITION FORM** | | | | |
| 2 | Date | `date` | Date |  | default: today |
| 3 | Project | `project` | Lookup → Projects | ✔ |  |
| 4 | Room / Area | `room_area` | Text | ✔ | placeholder “Ex: Living Room” |
| 5 | Brand and Model Number | `brand_and_model_number` | Text | ✔ | placeholder “Ex: Samsung QN65Q80” |
| 6 | Serial Number | `serial_number` | Text | ✔ |  |
| 7 | Team | `team` | Lookup (multi) → Employees | ✔ | only offers records where Status = Active + Reports (`Reports`) |
| 8 | Pictures | `pictures` | File upload | ✔ |  |
| | **INSTALLATION AND EQUIPMENT CONDITION FORM** | | | | |
| 9 | Validated by | `disclaimer` | Text | ✔ | max 50 chars |
| 10 | Email | `email` | Email | ✔ |  |
| 11 | Signature | `signature` | Signature | ✔ |  |

*Summary counts shown on the record:* Files, Notes.



---

## 4. Field rules (show / hide logic on forms)

Rules run live on the form as values change, and again when the form opens. A rule with several conditions fires when **any** of them matches (OR).

**How the new app will evaluate rules.** WebAuthor applies each rule's actions as an event, so what you see can depend on the order in which you clicked. The rebuild evaluates rules declaratively instead. The starting visibility is the one in §3, then every rule whose condition currently matches is applied in rule-number order. The result then depends only on the current values. ⚠ Blank Yes/No fields are treated as **No** (§9 Q3).

### 4.1 Projects
| # | When… | Then… |
|---|---|---|
| 3370 / 3371 | **Building or Development** = Yes / No | show / hide *Building / Development* and *Apartment or Unit #* |
| 3373 / 3372 | **Permit** = Yes / No | show / hide *Choose Permit* |
| 3374 / 3463 | **Designer** = Yes / is not Yes | show / hide *Design Firm*, *Lead Designer*, *Designer Notes* |
| 3376 / 3375 | **General Contractor** (Yes/No) = Yes / No | show / hide *General Contractor* (org), *GC PM*, *GC Notes* |
| 3377 / 3378 | **Builder or Developer** = Yes / No | show / hide *Builder / Developer*, *Builder / Developer Notes* |
| 3380 | **Referral** = None | hide *Commission Notes*, *Person*, *Organization* |
| 3379 | **Referral** = Person | show *Commission Notes* and *Person*; hide *Organization* |
| 3474 | **Referral** = Organization | show *Commission Notes* and *Organization*; hide *Person* |
| 3381 / 3382 | **Maintenance Plan** = Yes / No | show / hide *Type, Status, Purchase Date, Sales Person, Amount, History, Receipt of Payment* |
| 3383 / 3471 | **Special Orders** = Yes / No | show / hide *List Items* |
| 3399 / 3400 | Maintenance **Type** = Silver / Gold | ⚠ no target fields, so these do nothing (§9 Q4) |

### 4.2 Contacts
| # | When… | Then… |
|---|---|---|
| 3289 / 3461 | **Alternate Contact ?** = Yes / not Yes | show / hide *Alternate Name, Alternate Role / Title, Alternate Phone, Alternate Intl Phone, Alternate Email* |
| 3462 | **Type** = End Customer | hide *Organization Name*, *Role / Position*; show *Referred by anyone?* |
| 3296 | **Type** ≠ End Customer | show *Organization Name*, *Role / Position*; hide *Referred by anyone?* and its *Organization / Person / Employee* fields |
| 3467 / 3468 | **Referred by anyone?** = Yes / No | show / hide the referral *Organization*, *Person*, *Employee* |

### 4.3 Organizations: field visibility by Type
Net effect of rules 3298, 3299, 3300, 3301, 3302, 3366, 3369 and 3584. ✔ = shown, blank = hidden. *Website* and *Details* are always shown. *Florida DR-13* is shown only when **Tax Exempt ?** = Yes (rules 3367 / 3368).

| Type | Commission / Markup | Tax Exempt ? | COI | COI Expiration | Logo | Dealer # | Login | Password | Contracts / Dealer App | Price Sheets | Catalogs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Design Firm, Developer / Builder, General Contractor | ✔ | ✔ | ✔ | ✔ | ✔ | | | | | | |
| Concierge | ✔ | ✔ | | ✔ | ✔ | | | | | | |
| Realtor | ✔ | | | | ✔ | | | | | | |
| Commercial Customer | | ✔ | | ✔ | ✔ | | | | | | |
| Supplier | | ✔ | | | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Service Provider ⚠ | | | | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Municipality | | | ✔ | ✔ | | | ✔ | ✔ | | | |
| (none chosen) | | | | ✔ | ✔ | | | | | | |

⚠ Rules 3299 and 3300 test for "Service provider" with a lower-case p, but the option is "Service Provider". The row above assumes the match is meant to be case-insensitive (§9 Q5).

### 4.4 Transactions (Pay-ins)
| # | **Payment Type** = | Shown | Hidden |
|---|---|---|---|
| 3476 | Apply to Project | Apply to Project, Type, Portal Proposal or Invoice # | Pay Individual, Pay Organization, Reason |
| 3477 | Pay Individual | Pay Individual, Reason | Apply to Project, Type, Portal #, Pay Organization |
| 3478 | Pay Organization | Pay Organization, Reason | Apply to Project, Type, Portal #, Pay Individual |

### 4.5 Other tables
| Table | # | When… | Then… |
|---|---|---|---|
| Employees | 3464 | **D/L Expiration** is before today | set *D/L Status* = Expired (live on the form) |
| Inventory Checkout | 3579 | **Type** = Materials | show *Project* |
| Inventory Checkout | 3580 | **Type** = Tools | hide *Project* **and clear its value** |
| Payroll | 3364 / 3365 | **Method of payment** = Check / anything else | show / hide *Check Number* |
| Payroll | 3600 | **Reason** = Scheduled Salary or Compensation, Salary Advance or Loan | show *Employee*. ⚠ The rest of this rule targets fields that no longer exist (Type, Individual, Organization) and both shows and hides *Amount* (§9 Q6) |
| Job Report | 3822, 3823, 3827, 3828 | **1 - Pending** filled → show **2 - Pending**; 2 filled → show 3; 3 → 4; 4 → 5 | a cascade of up to 5 "pending item" boxes |
| Support Notes | 3395 | **Status** = Closed | *Closed Date* becomes required |

---

## 5. Triggers (automations): 39 in total, all active

**Event types.** *Record Added*; *Record Modified*; *Field Change: X* (fires when field X changes value); *Daily* (at 12:00 AM US Eastern); *Hourly*. A trigger can listen to several events. For example, "Daily + Added + Modified + Field change" means it is checked every night **and** immediately whenever the record is saved.

**"Days to Today".** Conditions like "Expiration (Days To Today)" use **today − date**. The result is **positive when the date is in the past** and negative when it is in the future.

**Email actions.** All email actions have an **empty body**. The message is made of options:
- **Record card**: a formatted summary of the record's fields.
- **View link**: a link back to the record.
- **Record PDF**: the record attached as a PDF.
- **File attachments**: files from one of the record's upload fields.

`{XM:field}` in a subject is a merge token that inserts that field's display value.

### 5.1 Status housekeeping (update a field on the same record)
| ID | Table | Events | Condition | Action |
|---|---|---|---|---|
| 694 | Buildings | Daily, Added, Modified, COI Expiration changed | COI Expiration is 30+ days in the future (days ≤ −30) | COI Status = **Active** |
| 695 | Buildings | same | COI Expiration is today or past (days ≥ 0) | COI Status = **Expired** |
| 691 | Permits | Daily, Added, Modified, Permit Expiration changed | Permit Expiration Date is 31+ days away (≤ −31) | Permit Expiration = **Active** |
| 693 | Permits | Daily, Added, Permit Expiration Date changed | expires within the next 1–29 days (−30 < days < 0) | Permit Expiration = **Renew Soon** |
| 692 | Permits | Daily, Added, Modified, Permit Expiration Date changed | expiration today or past (≥ 0) | Permit Expiration = **Expired** |
| 689 | Projects | Daily, Added, Modified, Date Modified changed | Purchase Date was < 334 days ago | Maintenance Status = **Active** |
| 686 | Projects | Daily, Added, Purchase Date changed | Purchase Date was 336–365 days ago (335 < days ≤ 365) | Maintenance Status = **Renewal Alert** |
| 690 | Projects | Daily, Added, Modified, Purchase Date changed | Purchase Date was more than 365 days ago | Maintenance Status = **Expired** |
| 708 | Projects | Hourly | Invoiced ≤ Paid **and** Financial Status ≠ Current | Financial Status = **Current** |
| 707 | Projects | Hourly | Invoiced > Paid **and** Financial Status ≠ Delinquent | Financial Status = **Delinquent** |
| 725 | Projects | Date Submitted changed | Date Submitted is now empty (record was "unsubmitted") | clear **Job Status** |
| 688 | Employees | Daily, Added, Modified, D/L Expiration changed | D/L Expiration is no more than 1 day past (days ≤ 1) | D/L Status = **Active** |
| 687 | Employees | Daily, Added, D/L Expiration changed | D/L Expiration is 1+ days past (days ≥ 1) | D/L Status = **Expired** |
| 700 | Tasks | Daily, Modified, Due Date changed | Due Date is today or past | second Status field (`status_1`) = **Due** |
| 838 | Punch List | Status changed | Status = Completed | **Archive** the record |

⚠ Several of these thresholds leave gaps or overlap (days 334–335 for maintenance plans, exactly 30 days for permits, 1–29 days before COI expiry, day 1 for driver's licences). Nulls also need a rule: what happens if nothing has been invoiced? See §9 Q7.

### 5.2 Emails
| ID | Table | Events | Condition | From → To | Subject | Includes |
|---|---|---|---|---|---|---|
| 696 | Permits | Status changed | always | info@tsav.net → fred@tsav.net | Permit Status Changed | card, link, PDF |
| 698 | Punch List | Daily, Added, Modified, Due Date changed | Due Date is today, or exactly 7, 14 or 30 days ago | info@ → info@tsav.net | Punch List item for {project} is Due Today | card, link, PDF; **also sets Status = "Expired"** ⚠ |
| 730 | Punch List | Added | Team = Carlos Gurgel | info@ → carlosgurgel@tsmiami.com | Punch Item for {project} was added | card, link |
| 731 | Punch List | Added | Team = Frederico Smiliansky | info@ → fred@tsav.net | same | card, link |
| 732 | Punch List | Added | Team = Jessica Villegas | info@ → jessica@tsav.net | same | card, link |
| 733 | Punch List | Added | Team = Luana Freitas | info@ → luana@tsav.net | same | card, link |
| 734 | Punch List | Added | Team = Lucas Oliveira | info@ → lucas@tsav.net | same | card, link |
| 735 | Punch List | Added | Team = Saulo da Silva | **saulo@tsav.net → lucas@tsav.net** ⚠ | same | card, link |
| 736 | Punch List | Added | Team = Ulisses Dias Filho | saulo@tsav.net → uli@tsav.net | same | card, link |
| 705 | Tasks | Added, Status changed | Member = Carlos Gurgel | info@ → carlosgurgel@tsmiami.com | Task Added or Due | card, link, PDF |
| 699 | Tasks | Added, Status changed | Member = Frederico Smiliansky | info@ → fred@tsav.net | same | card, link, PDF |
| 701 | Tasks | Added, Status changed | Member = Jessica Villegas | info@ → jessica@tsav.net | same | card, link, PDF |
| 702 | Tasks | Added, Status changed | Member = Luana Freitas | info@ → luana@tsav.net | same | card, link, PDF |
| 706 | Tasks | Added, Status changed | Member = Lucas Oliveira | info@ → lucas@tsav.net | same | card, link, PDF |
| 704 | Tasks | Added, Status changed | Member = Saulo da Silva | info@ → saulo@tsav.net | same | card, link, PDF |
| 703 | Tasks | Added, Status changed | Member = Ulisses Dias Filho | info@ → uli@tsav.net | same | card, link, PDF |
| 839 | Job Report | Added | always | "TS CRM" → techsquadreports@gmail.com | {project} ( {team} ) - {date} | card, PDF, **the Upload Files attachments** |
| 713 | TV Installation | Added | always | "TS CRM" → **the Email typed on the form** (the customer who signed), BCC techsquadreports@gmail.com | Installation and Condition Form {project} {room_area} {brand_and_model_number} | PDF, **the Pictures attachments** |

The Team and Member conditions compare against Employee record IDs: 1000 Fred, 1002 Carlos, 1004 Jessica, 1005 Luana, 1006 Lucas, 1012 Saulo, 1013 Ulisses. "TS CRM" is a sender display name, not an address. "Tasks: Status changed" refers to the first *Status* field (Pending / Working / Completed).

### 5.3 Checklist automation
| ID | Table | Events | Condition | Action |
|---|---|---|---|---|
| 856 | Job Report | Added | *1 - Pending* not empty | add a checklist item with that text **to the Project the report is for** |
| 860, 861, 862, 863 | Job Report | Added | *2 / 3 / 4 / 5 - Pending* not empty | same, for pending boxes 2–5 |
| 837 | Projects | ⚠ **no event set** | — | add checklist item "{checklist}", but no such field exists. This trigger is effectively dead (§9 Q8) |

Triggers 860–863 had WebAuthor's debug mode switched on. That has no effect on behaviour.

---

## 6. Workflows (4)

A workflow is a set of **levels** (stages). A record enters the workflow at its starting level. While it sits at a level, the users allowed to act on that level (the "recipients", by group) see it in their **My Assigned** queue and can click one of the level's **outcomes** to move it on.

Common settings on every level, unless stated otherwise:
- comments are allowed but optional;
- "save for later" is allowed;
- no email is sent;
- no signature is needed;
- no field editing happens inside the workflow step.

**Entering a level sets one field** on the record, shown under "sets" below. Every transition is kept as a **timeline** ("WF Timeline" in the Summary block) with who, when and any comment.

### 6.1 Project Proposal (Projects), 11 levels
Starts when a Project is **submitted**. Recipients at every level: Everyone, Office Management, System Administrators.

| Level | Colour | Entering sets Job Status to | Outcomes → go to |
|---|---|---|---|
| 1 Surveying *(start)* | #2196f3 | Surveying | Create Proposal → 2 · Still Surveying → 1 · **Override** → user picks any level · **Remove from Workflow** → unsubmit (record leaves the workflow and unlocks, and trigger 725 then clears Job Status) |
| 2 Create Proposal | #1266f1 | Create Proposal | Proposal Review → 3 · Proposal Sent → 4 |
| 3 Proposal Revisions | #ff9800 | Proposal Revisions | Proposal Sent → 4 |
| 4 Proposal Sent | #c5e6c1 | Proposal Sent | Proposal Approved → 5 · Proposal Denied → 11 · Proposal Revisions → 3 |
| 5 Proposal Approved | #4caf50 | Proposal Approved | Complete → 10 · Creating Proposal → 2 · On Hold → 6 |
| 6 ON HOLD | #f44336 | ON HOLD | Infrastructure → 7 · Installation → 8 · Programming → 9 · Proposal Review → 3 |
| 7 Infrastructure | #ffeb3b | Infrastructure | Installation → 8 · ON HOLD → 6 · Complete → 10 |
| 8 Installation | #9c27b0 | Installation | Programming → 9 · ON HOLD → 6 · Complete → 10 |
| 9 Programming | #ffcdd2 | Programming | Complete → 10 · ON HOLD → 6 |
| 10 Complete | #212121 | Complete | Create Proposal → 2 · Surveying → 1 |
| 11 Proposal Denied | #dddddd | Proposal Denied | Surveying → 1 · Create Proposal → 2 · Complete → 10 |

Note that Proposal Approved cannot go straight to Infrastructure, Installation or Programming. The only path is through ON HOLD (or Override).

### 6.2 Punch List Workflow (Punch List), 6 levels
Starts when a Punch List item is **submitted**. Recipients: Everyone, Office Management, System Administrators.

| Level | Colour | Entering sets Status to | Outcomes → go to |
|---|---|---|---|
| 1 Review *(start)* | #03a9f4 | Review | Approved → 2 · Canceled → 6 |
| 2 Scheduled | #ff9800 | ⚠ "Approved", which is not a Status option (§9 Q9) | In Progress → 3 · On Hold → 4 · Completed → 5 · Canceled → 6 |
| 3 In Progress | #009688 | In Progress | On Hold → 4 · Completed → 5 · Canceled → 6 |
| 4 On Hold | #ffc107 | On Hold | In Progress → 3 · Completed → 5 · Canceled → 6 |
| 5 Completed | #4caf50 | Completed | *(end)*. Trigger 838 also archives the item |
| 6 Canceled | #f44336 | Canceled | In Progress → 3 · Scheduled → 2 · On Hold → 4 |

### 6.3 Stock Status (Inventory → Stock), 3 levels
Starts when a Stock record is **submitted**. The Stock form has no Submit button, so it is effectively started on save or by an admin (§9 Q10). Recipients: Admin, System Administrators.

| Level | Colour | Entering sets Status to | Outcomes |
|---|---|---|---|
| 1 In Stock *(start)* | #8bc34a | In Stock | On Project → 2 |
| 2 On Project | #03a9f4 | On Project | RMA → 3 |
| 3 RMA | #f44336 | RMA | *(end)* |

### 6.4 Help Desk Workflow (Support Tickets), 2 levels
Built by WebAuthor support and never attached to the ticket form (0 records). **Submitted** (#f44336, start) → *Completed* → **Completed** (#3f51b5). "Send email" is switched on, but no recipients are set.

---

## 7. Users, groups and permissions

### 7.1 Users (12)
| User | Email | Groups (besides Everyone) |
|---|---|---|
| Fred Smiliansky | fred@tsav.net | System Administrators, Admin, Treasurer, Electrical Dept, LV Dept |
| Mike Meyer | teddym2112@icloud.com | System Administrators |
| Webauthor Support | support@webauthor.com | System Administrators *(vendor account, not migrated)* |
| Jessica Villegas | jessica@tsav.net | Admin, Office Management |
| Luana Freitas | luana@tsav.net | Accounting, Office Management, Electrical Dept |
| Roberto Pizini | roberto@techsquadfl.com | Office Management |
| Saulo Da Silva | saulo@tsav.net | COO, Electrical Dept |
| Ulisses Dias | uli@tsav.net | COO, Electrical Dept |
| Lucas Oliveira | lucas@tsav.net | Project Manager |
| Karina Smiliansky | karina@tsav.net | Treasurer, Electrical Dept, LV Dept |
| Carlos Gurgel | carlosgurgel@tsmiami.com | *(Everyone only)* |
| Technician Test | info@tsav.net | Technician |

Nobody has MFA enabled. *Users* are the 12 people who log in. *Employees* are a separate HR table with 31 records. The two are not linked in WebAuthor.

### 7.2 Groups (12)
System Administrators (`SYSADMIN`) · Everyone (`EVERYONE`, every user is automatically in it) · Accounting · Admin · Office Management (`OFFICE MGMT`) · COO (`OPERATIONS`) · Technician · Project Manager · Treasurer · Test *(no members)* · Electrical Department (`ELECTRICAL`) · LV Department (`LOW VOLTAGE`).

Electrical and LV Department grant **no permissions**. They are used only for grouping people. Because **Everyone** contains every user, anything granted to Everyone is available to all logged-in users.

### 7.3 Record permissions
Abbreviations: SA = System Administrators, EV = Everyone, ACC = Accounting, ADM = Admin, OM = Office Management, COO, TECH = Technician, PM = Project Manager, TRE = Treasurer, TST = Test.

"View" is the tab/page plus *View All Records*. Without View All, a user sees only the records they created. "Admin tools" is Form Designer and Import.

| Module › Record type | View | Create | Modify | Delete | Archive | Admin tools |
|---|---|---|---|---|---|---|
| Projects › Projects | **everyone** | ACC ADM COO OM PM SA TST TRE | same as Create | same | TST TRE | ACC ADM SA TST TRE |
| Projects › Contacts | **everyone** | ACC ADM COO OM PM SA TST TRE | same | same | SA | ACC ADM SA TST TRE |
| Projects › Organizations | **everyone** | ADM COO OM PM SA TST TRE | same | same | SA | ADM SA TST TRE |
| Projects › Buildings | **everyone** | ACC ADM COO OM PM SA TST TRE | same | same | SA | ACC ADM SA TST TRE |
| Projects › Permits | **everyone** | ACC ADM COO OM PM SA TST TRE | same | same | SA | ACC ADM SA TST TRE |
| Projects › Punch List | ACC COO OM PM SA **TECH** TST TRE *(not ADM, not EV)* | ACC COO OM PM SA TST TRE | same | same | SA | designer ACC SA TST TRE; import SA TST TRE |
| Administrative › Employees | COO OM SA TST TRE | same | same | same | nobody | SA TST |
| Administrative › Fleet | COO OM PM SA TST TRE | same | same | same | nobody | SA TST |
| Administrative › Tasks | COO OM PM SA **TECH** TST TRE | same (incl. TECH) | same (incl. TECH) | COO OM PM SA TST TRE | nobody | SA TST |
| Administrative › RMA | COO OM PM SA **TECH** TST TRE | COO OM PM SA TST TRE | same | same | nobody | SA TST |
| Administrative › Transactions | COO OM SA TST TRE | same | same | same | nobody | designer SA TST; import COO SA TST |
| Administrative › Payroll | page: PM SA TST TRE; view all: SA TST TRE | PM SA TST TRE | SA TST TRE | SA TST | nobody | SA TST |
| Administrative › Inventory Checkout | page: COO OM SA TECH TST TRE; view all: COO OM SA TECH TST | COO OM SA **TECH** TST TRE | COO OM SA TST TRE | COO OM SA TST TRE | nobody | COO SA TST |
| Administrative › Onboarding *(§8)* | SA TST | SA TST | SA TST | SA TST | nobody | SA TST |
| Inventory › Products | ADM SA | ADM SA | ADM SA | SA | nobody | SA |
| Inventory › Stock | ADM SA | ADM SA | ADM SA | SA | nobody | SA |
| Inventory › Sale, Return / RMA | ⚠ **nobody** (§9 Q11) | nobody | nobody | nobody | nobody | nobody |
| TS Help Desk › Tickets, Articles | OM SA TST | OM SA TST | OM SA TST | OM SA TST | OM SA TST | OM SA TST |
| FLEX Forms › all 5 forms | ACC ADM COO OM PM SA **TECH** TST TRE | same | ACC ADM COO OM SA **TECH** TST TRE *(not PM)* | ACC ADM COO OM SA TST TRE | ACC ADM COO OM PM SA TST TRE | ACC ADM COO OM PM SA TST |

Per-form permission rows for the FLEX forms are empty in the export. The module-level FLEX Forms permissions shown in the last row apply to all five forms.

### 7.4 Module-level actions (condensed)
| Capability | Projects module | Administrative module | Inventory | Help Desk |
|---|---|---|---|---|
| Lock / unlock records | ACC ADM SA TST TRE | ADM SA TST TRE | SA | OM SA TST |
| Edit locked records | ACC ADM COO OM SA TST TRE | ADM OM SA TST TRE | SA | OM SA TST |
| Delete locked records | ACC ADM COO OM PM SA TST TRE | ADM OM SA TST TRE | SA | OM SA TST |
| Bulk move workflow level | ACC ADM SA TST TRE | ADM SA TST TRE | SA | OM SA TST |
| Grid bulk update / inline edit | everyone | ADM COO OM PM SA TST TRE | SA | OM SA TST |
| Files: add · delete | everyone · ACC ADM COO OM PM SA TST TRE | ADM COO OM PM SA TECH TST TRE · ADM SA TST TRE | ADM SA · SA | OM SA TST |
| Notes: add · delete | everyone · ACC ADM COO OM PM SA TST TRE | ADM COO OM PM SA TECH TST TRE · ADM COO OM PM SA TST TRE | ADM SA · SA | OM SA TST |
| Dashboard | everyone | ADM COO OM PM SA TST TRE | ADM SA | OM SA TST |
| Reports page | COO OM PM TST TRE | ADM COO OM PM SA TST TRE | nobody | OM SA TST |
| Metrics page | OM TST TRE | TST TRE | nobody | OM SA TST |
| Audit log · Deleted items | everyone · everyone | ADM COO OM PM SA TST TRE | SA | OM SA TST |
| Setup (fields, rules, triggers, codes, permissions) | ACC ADM SA TST (+OM for field design, +COO for workflow setup) | ADM SA TST (+TRE for workflows) | SA (+ADM for workflows) | OM SA TST |
| Impersonate users | ACC ADM SA TST | ADM SA TST TRE | SA | OM SA TST |

Site-wide admin (members, groups, settings) goes to ADM, SA and TST. COO can also add members and impersonate. OM can also edit site settings. The Files library (shared folders) lets COO, OM, PM, SA, TST and TRE upload, edit and delete. Everyone can edit their own profile.

---

## 8. Things the export mentions but does not define

These are **not** in the 28 tables. Phase 1 will not build them unless you ask.

- **Onboarding** (Administrative) has permissions and 1 record, but no table definition was exported.
- **Return / RMA** (Inventory) has permissions only, granted to nobody.
- **Map View** tab in Projects (a WebAuthor map of Job Addresses).
- WebAuthor platform extras: Binders, WIKI / Hubs, dashboard pods (My Assigned, My Tasks, Recently Modified, Upcoming, Views), Metrics, Mail-merge, Email broadcast, Guides/Tooltips, Integration Feeds, Routines (none configured), Support/tickets to WebAuthor, and site theme CSS.
- Email templates, form templates, binders, saved views and codes: all empty in the export.
- Site settings: time zone **US Eastern**; verified system sender `noreply@webauthor.com`.

---

## 9. Open questions and inconsistencies

These need a decision. Unless you say otherwise, the build will use the proposed default.

| # | Issue | Proposed default |
|---|---|---|
| Q1 | Auto-generated **record titles**: the formula is not exported for Contacts, Interactions, Permits, Punch List ("Created"), Employees, Tasks ("Date Created" text field), Transactions, Payroll, Products, Sale, Stock, Tickets, FLEX forms. | Contacts "First Last"; Employees "First Last"; Permits "Type – Permit # – Project"; Punch List "Project – Type"; Transactions "Payment Type – Description"; Payroll "Employee – Reason – Date"; Products "Brand Model (SKU)"; Stock/Sale "Serial"; Tickets "#id – first 50 chars"; FLEX forms "Project – Date". Tell me your real formats if different. |
| Q2 | Column names are messy (for example `is_there_a_builder_or_developer_involved` is actually the Builder/Developer **lookup**, and `builber_developer_notes`, `next_pendning`). | Use clean names in the new database, keep every label and option identical, and keep a legacy→new name map for the data import. |
| Q3 | Rules fire on "= No", but a new record's Yes/No is blank. That means GC PM and Lead Designer would appear on a blank form. | Yes/No fields default to **No**. |
| Q4 | Rules 3399 / 3400 (Silver / Gold plan) and 3372 / 3373 have empty targets. | Port them as no-ops (or drop them). |
| Q5 | "Service provider" vs "Service Provider" in Organization rules. | Case-insensitive match (the Service Provider row in §4.3). |
| Q6 | Payroll rule 3600 references deleted fields and shows and hides Amount at once. | Only "show Employee" survives; Amount stays visible. |
| Q7 | Date-threshold gaps (maintenance day 334, permit −30, COI −29…−1, D/L day 1 overlap); empty Invoiced/Paid. | Close the gaps (Active < 335; Renew Soon −30…−1; D/L Expired only when past); treat empty money as 0. Or keep exact WebAuthor behaviour if you prefer. |
| Q8 | Trigger 837 has no event and uses a non-existent field. | Import it as **disabled**. |
| Q9 | The Punch "Scheduled" level writes Status = "Approved", and trigger 698 writes "Expired". Neither is an option. | Scheduled level writes **"Scheduled"**. Trigger 698 still emails but does **not** overwrite Status. |
| Q10 | Stock workflow starts on submit, but Stock has no Submit button. | Start the workflow automatically when a Stock record is created. |
| Q11 | Inventory › Sale has no permissions (invisible). | Give Sale the same rights as Stock (ADM, SA). |
| Q12 | Sale auto-fill copies Location, but Sale has no Location field. | Ignore that mapping. |
| Q13 | Driver's-licence scan maps to non-existent State / City / Zip / DL Number. | Phase 1: upload only. Phase 2: AI extraction with those fields added. |
| Q14 | Trigger 735 (Saulo) emails **lucas@**, and 735 / 736 are sent *from* saulo@. | Keep as configured. Confirm, though it looks like a copy-paste slip. |
| Q15 | The per-person email triggers are hard-coded by employee (7 near-identical triggers each for Punch List and Tasks). | Port them exactly as data (editable in an Automations admin screen). Optionally replace them later with one "email the assigned employee" rule. |
| Q16 | Punch List *Team* is stored as text but behaves as a single employee. | Single employee lookup. |
| Q17 | Employees *Department* is a radio group flagged multi-select. | Checkboxes: LOW VOLTAGE and/or ELECTRICAL. |
| Q18 | Sensitive data in plain fields: SSN, Organization *Password*, Project *System Credentials*, Job Report *Login and Passwords*. | Encrypt at rest, mask in the UI, and restrict to groups with Modify rights. |
| Q19 | Is **System Administrators** a super-user? WebAuthor does not grant SA "Records: Archive" in Projects, for example. | SA = full access everywhere. |
| Q20 | Carlos Gurgel is only in *Everyone*. He can therefore see Projects, Contacts and so on, but **not** the FLEX forms, Punch List or Tasks, even though triggers email him about punch items and tasks. | Keep as is. Add him to a group if he should have access. |

### 9.1 Decisions (Fred, 2026-09-25)

Overall rule: **fix WebAuthor's errors** rather than copy them. Where no specific answer was given, the proposed default above applies.

| # | Decision | Where it lives |
|---|---|---|
| Q1 | Titles: Contacts & Employees "First Last"; **Permit "Project – Type – Status"**; Punch List "Project – Type"; Payroll "Employee – Reason – Date"; Vehicle "Year Make and Model (Tag)"; **Job Report "Project – Technician(s) – Date"**; other tables as proposed. | `titleFormula` in each registry table |
| Q2 | Clean names, legacy map kept. | registry `legacy` fields |
| Q3 | Yes/No fields default to No. | registry defaults |
| Q4 | Rules 3399 / 3400 removed; the empty targets of 3372 / 3373 are ignored. | registry |
| Q5 | Case-insensitive match; "Service Provider" behaves as in §4.3. | registry rules |
| Q6 | Rule 3600 shows Employee and Amount; the references to deleted fields are dropped. | registry |
| Q7 | **Close the date gaps**: Maintenance Active < 335 days, Renewal Alert 335–365, Expired > 365; Permit Active ≤ −31, Renew Soon −30…−1, Expired ≥ 0; COI Active until the day before expiry, Expired ≥ 0; D/L Expired only when the date is in the past. Empty money counts as 0. | automations (M10–M11) |
| Q8 | Trigger 837 imported **disabled**. | automations (M10) |
| Q9 | Punch "Scheduled" level writes Status **"Scheduled"**. Trigger 698 still emails but does **not** change Status. | workflows (M9), automations (M10) |
| Q10 | Stock workflow starts automatically when a Stock record is created. | workflows (M9) |
| Q11 | Sale gets exactly the grants of Stock. | migration `20260925220000_m3_decisions.sql` |
| Q12 | Sale Location auto-fill ignored. | registry |
| Q13 | Driver's-licence scan: Phase 2. | — |
| Q14 | **Trigger 735 emails saulo@tsav.net** (it was going to lucas@). | automations (M10) |
| Q15 | Per-person email triggers ported one-to-one as editable data. | automations (M10) |
| Q16 | Punch List Team = one employee. | registry |
| Q17 | Employee Departments = checkboxes. | registry |
| Q18 | Sensitive fields encrypted and masked. | registry `sensitive`, schema (M4) |
| Q19 | **System Administrators have full access everywhere.** | `app.is_sysadmin()` (M2) |
| Q20 | Carlos unchanged; not invited yet (nor Mike Meyer). | `scripts/data/users.ts` |
| M7-a | **A hidden field doesn't trigger rules.** Changing a Contact's Type away from End Customer hides "Referred by anyone?" *and* the referral fields it controlled. Switching an Organization to Realtor hides Tax Exempt *and* Florida DR-13. WebAuthor could leave these showing. | `src/lib/rules/evaluate.ts` |
| M7-b | **Project totals only count "Apply to Project" transactions.** A transaction switched to Pay Individual/Organization keeps its hidden Project/Type values (as in WebAuthor), but they no longer affect Approved / Invoiced / Paid. | migration `20260926010000_m7_financials_fix.sql` |
| M7-c | **Picker filters are enforced on save, not just in the picker.** If a contact's Type changes, a previously picked Organization of another type is cleared on the form and refused by the server. The same applies to Job Report / TV Installation teams (Active + Reports only), vehicles (Populate on Reports) and staff (Active / Reports). | `src/lib/records/save.ts`, `record-form.tsx` |
| M9-a | **Who moves workflow stages** (replaces WebAuthor's "Everyone"): Project Proposal: Office Management, Project Manager, COO, Admin, System Administrators. Punch List: everyone who can edit punch items (Accounting, COO, Office Management, Project Manager, Treasurer, Test, System Administrators) **plus Technicians**. Stock Status: Admin, System Administrators. | `workflow_level_groups` (editable in M12) |
| M9-b | Submitted Projects stay **locked** while in the workflow, as in WebAuthor; Project Managers can move stages but not edit a locked project's fields. **No emails** on stage changes. The Help Desk workflow is imported but inactive. | migrations `20260926030*` |
| M11-a | Daily / hourly automations run on **live, unarchived** records only (an archived record is finished with, so e.g. a completed punch item gets no more "due" emails). "Daily" runs once per Eastern-time date, on the first timer call after midnight ET; "hourly" once per ET hour. Uploads that never became an attachment (form abandoned) are removed after 48 hours. | `src/lib/engine/schedule.ts`, migration `20260926050000` |
| M7-d | Hidden fields keep their stored values (as in WebAuthor), so switching back restores them. The only exception is where a rule explicitly clears a value (Inventory Checkout › Tools clears Project). | `src/lib/rules/evaluate.ts` |
