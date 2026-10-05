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
| **Administrative** | Dashboard · Employees · Payroll · Transactions · Vehicle · RMA · Tasks · ~~Inventory Checkout~~ · Reports | Employees, Payroll (Payouts), Transactions (Pay-ins), Fleet (Vehicles), RMA, Tasks, *(Onboarding: see §8)* — Inventory Checkout moved to Inventory, §9.1 INV-a |
| **Inventory** | Dashboard · Product · Stock · Inventory Checkout | Products, Stock, Inventory Checkout (replaces Sale, §9.1 INV-a), *(Return / RMA: see §8)* |
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
 · new-record button "New Report" (was "New Record", Fred 2026-10-05)

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
| 15 | Upload Files (WebAuthor: "Upload Files (25MB MAX)", renamed §9.1 L-a) | `upload_files` | File upload |  |  |

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
| M12-a | **Everyone** no longer grants anything in Projects, Contacts, Organizations, Buildings or Permits; each group grants what its people need (Technicians keep Projects, Buildings, Permits, Punch List through their own group). | migration `20260926080000` |
| M12-b | Each **FLEX form** has its own record permissions (`forms.<tab>.view_page/view_all/create/modify/delete/archive`) instead of WebAuthor's single shared set. Every group kept what it had on every form, except **Technicians: no access to Staff Performance**. Lock / unlock permissions stay shared (`forms.records.*`). | migration `20260926080000` |
| M12-c | The unused **Test** group (no members, near-full access) is deactivated. | migration `20260926080000` |
| M12-d | **Office Management and COO** get the same Inventory access as Admin (Products, Stock, Sale). Inventory permissions are revisited with Phase 2. | migration `20260926080000` |
| M12-e | Only System Administrators may add people to System Administrators, change built-in groups, edit permissions or edit automations. Form settings: holders of WebAuthor's Design permission. | migrations `20260926060000`, `20260926070000` |
| B1-a | Employees › **D/L Expiration is read from the Drivers License photo** with Claude AI when a JPG/PNG/PDF is uploaded; the form is pre-filled and the person checks it. **D/L Status is read-only**: only the automation (from the expiry date) sets it, and it is current as soon as the record is saved. Other date-driven statuses stay editable (Fred's choice). | `src/lib/ai/extract.ts` |
| B1-b | **Address fields** suggest real US addresses as you type (Google Places) and fill street, city, state and ZIP. | `src/lib/records/address-actions.ts` |
| B1-c | Opening a module shows its pages as a sub-menu (sidebar on computers, a scrollable strip on phones). Money fields accept cents. | `src/components/shell/nav.tsx` |
| F1-a | New **Schedule** module (not in WebAuthor): **Visits** (project, start, duration, arrival window, technician + others going, service type, instructions, parking/access, status, repeat series) and a **Calendar** (week / team / list, drag & drop). Office groups (Admin, Office Management, COO, Project Manager, Treasurer) schedule; **Technicians see the whole team schedule, read-only**; Everyone nothing. Service types start empty (admins add them in Form settings). | migration `20260930000000`, docs/portal-features-merge.md |
| H-a | **TS Help Desk deleted completely** (Tickets, Support Notes, Articles, Knowledge Base Categories, the inactive Help Desk workflow, rule 3395 and all help-desk permissions). Its WebAuthor data will not be imported. | migration `20260930010000` |
| H-b | **FLEX Forms renamed "Reports"** (the forms technicians fill in per job). The charts-and-numbers section from the Portal design ("Relatórios") is called **Insights** to avoid the clash. | `src/config/modules.ts` |
| OD-a | **OneDrive** (personal Microsoft account, connected once by a System Administrator in Admin › OneDrive) stores **every attachment except signatures**, in `TechSquad CRM / Projects / <project #id> / <form> / <date>` (records without a project: `TechSquad CRM / <form> / <record>`). Phones upload straight to OneDrive in resumable 5 MB pieces that pause and continue after interruptions; Save waits for uploads. Existing CRM-storage files are moved over from Admin › OneDrive. | `src/lib/files/*`, migration `20260930020000` |
| L-a | Job Report label **"Upload Files (25MB MAX)" renamed "Upload Files"** (Fred 2026-09-30): uploads go to OneDrive, up to 10 GB per file. | `src/registry/tables/job_reports.ts` |
| N-a | **Top-bar search and alerts** (Fred 2026-09-30). Search: every record type the person may open, on titles, text, contact and address fields. Alerts bell (red count) lists: people **tagged in notes** with "@Name" (cleared when the record is opened or "Mark read"), approvals waiting, my visits today, my open tasks, checklist items assigned to me, and follow-ups on my notes (last 7 days). Each links to its record. | `src/lib/search/*`, `src/lib/alerts/*`, migration `20261001000000` |
| I-a | **Screen language per person** (Fred 2026-09-30): English or Português, chosen in the account menu and saved on the person's profile (`profiles.language`). Screens, form labels, dropdown options and messages are translated; stored values, emails and PDFs stay in English, and what people type is never translated. Labels renamed in Form settings show as typed until a translation is added. Same migration: people can no longer change their own Active flag or email (only user admins). | `src/i18n/*`, migration `20261001010000` |
| F2-a | **Field day** (Fred 2026-10-01). Home shows **My visits today** for anyone whose Employee email matches their login: next visit first, route for the day (Google Maps, all stops), Maps / Waze / parking links, **On my way / Check in / Check out** (times saved on the visit, status changes; no text to the client: SMS left out, 2026-09-30), what to bring, a reminder when 2+ checked-out visits have no report, and the day's hours (on site, travelling, whole day). Only the people going (technician or "also going") or people who may change visits can check in, via `public.visit_step`. Check-out opens the Job Report filled in (project, visit, team, date). **2026-10-04** (Fred: the report opened by the check-out was headed "New Record", WebAuthor's label): a new record whose title rule can already be worked out from the values it opens with (Job Report: project – technicians – date) is headed with that title; otherwise the heading stays the form's own label. | migration `20261001020000`, `src/lib/field-day/*`, `src/components/field-day/*` |
| F2-b | **Job Report extended**: Visit, **Result** (Completed / Partial / Not done), and when not completed: Reason (8: Missing material, Waiting on GC / builder, Waiting on client, Waiting on another trade, Out of time, Equipment failure / RMA, No access, Other), Waiting on whom, **What's missing** (one per line, required when Partial), What to bring, Time needed, People needed, Who can do it, Access info; plus Materials used, Problems found, Who was on site, Parking, **Customer signature**. "What's missing" **replaces Pending 1–5** (Fred 2026-10-01): those stay on old reports (shown when filled, kept for the import) but are off the form; a new automation adds one project checklist item per line. Long text boxes have a **Dictate** button (the browser's speech recognition). | rules 900201–900203, automation 900101 |
| F2-c | **Return cards**: a Partial / Not done report creates a Task (labels "Return") for the scheduler set in **Admin › Field day** (Jessica, WebAuthor employee 1004, once imported), with the missing items as its checklist, due today + the reason's days (Missing material 3, Waiting on GC / builder 5, Waiting on client 5, Waiting on another trade 5, Out of time 2, Equipment failure / RMA 7, No access 2, Other 3; editable). A 2nd unfinished report in a row on the project marks the card **Urgent**. Office Today lists **Returns needed**; **Schedule return** on the card opens a new visit filled in, and the card then points at it (status Working). The new visit shows a **briefing** from the project's last report (result, what was done, missing, bring, access, photos). | automation 900102 (action `return_card`) |
| F2-d | **Per service type** (Admin › Field day): a checklist added to the visit at check-in and tools shown as "Bring". Service types themselves are still added in Form settings › Visits (they start empty, F1-a). Tasks got Project and Labels (Urgent, Material, Client, Financial, Technical, Return) for the F3 board. | `app_settings` key `field_day` |
| F3-a | **Tasks board** (Fred 2026-10-01): columns stay the WebAuthor statuses **Pending / Working / Completed** (no "Waiting"). Cards show labels, project, due badge, checklist progress, note count (notes with @tags serve as comments) and a lock when **Private**. Filter by person and by label; **Move to…** on phones (dragging works on computers). A **Private** task is seen only by whoever made it and the person it's assigned to (and System Administrators), even by people with "View All". Any task with a project has **Put on the calendar** (a visit filled in from the task). | migration `20261001030000`, `src/components/tasks/board.tsx` |
| F3-b | **Office Today** adds: visits on site **past their planned time**, **Tasks due in 7 days** (and overdue), and **Follow up with the client**: projects in Surveying with no note after 2 days, and Proposal Sent with no note for 7 days (until the F4 contact log). Review requests wait for F4 (message templates). | `src/components/dashboard/today.tsx` |
| F4-a | **Pipeline board** (Fred 2026-10-01, "build F4" with the recommended options): `/pipeline`, one column per Project Proposal stage (plus **Not submitted** when there are any). Dragging a card (or **Move to…** on phones) takes the stage's own option, so the WebAuthor path rules hold (Proposal Approved → Installation only via ON HOLD); where the stage has **Override** and the person may act there, any stage is allowed. Dropping a Not submitted project on Surveying **submits** it. Cards show client, approved value (only for people who can open Transactions), days in the stage (amber at 14, red at 28), type and salesperson. Complete / Proposal Denied show their last 90 days unless "Show older" is used. Filter by salesperson and search. | migration `20261001040000` (`public.workflow_board`), `src/lib/pipeline/moves.ts` |
| F4-b | **Salesperson** on Projects (new, Employee, Active/Reports). **Stage auto tasks** are automations with a new action **Create a task** (text with {field} words, due in N days, for the record's Salesperson or else whoever made the change, labels): 900401 Proposal Sent → "Follow up on the proposal" in 3 days; 900402 Proposal Approved → "schedule the start" in 1 day; 900403 Complete, when the project has no Maintenance Plan → "offer a maintenance plan" in 2 days (all labelled Client; no review requests, Fred 2026-10-02). One open task per automation and record. Editable in Admin › Automations. | automations 900401–900403, `src/lib/engine/task-action.ts` |
| F4-c | **Contact log and timeline**: WebAuthor's Contact › Interactions gains **Project**, **Notes** and (hidden) **Message sent**. Project and Contact pages get **Contact the client**: **Log a call** (type, result, follow-up date, notes) and **Send a message**, and a **Timeline** (calls / messages, notes, stage changes, visits, job reports, tasks; a contact's includes the projects they own). Today adds **Call back** (follow-up date reached and nothing newer logged with that contact), and "Follow up with the client" now counts logged calls / messages as contact. | `src/lib/records/timeline.ts`, `src/components/contact/*` |
| F4-d | **Message templates** (Admin › Messages, Form designers): First contact, Visit confirmation, Proposal follow-up, Maintenance plan renewal, in English / Português / Español (blank = English), with words {first_name} {client_name} {project} {address} {sender} {visit_date} {visit_time} {plan}. The language follows the contact's Preferred Language. Nothing is ever sent to a client automatically: **Text** / **Email** only open the phone's own Messages / Mail app with the text filled in (the person still presses Send; nothing sent by the server, no Twilio) and log an Interaction; **Copy** for WhatsApp. **No Google review requests or review links to clients** (Fred 2026-10-02): the Review request template, the review link setting and Today's "Ask for a review" were removed. | app_settings `messages`, migration `20261002000000` |
| F4-e | **Partner stats** on Organizations: projects as designer, GC, builder or referral, how many reached Approved or further, approved value (Transactions viewers only), latest project and the last 8 projects. | `src/components/contact/partner-stats.tsx` |
| F5-a | **Insights** (Fred 2026-10-02, "start F5"; the page itself dates from 2026-09-30): `/insights` adds **Salespeople** (projects per Salesperson, **win rate** = approved or further ÷ approved + lost, approved value for Transactions viewers; projects with no salesperson shown last) and, in **Field work**, the **Job report results** of the period (Completed / Partial / Not done; old reports with no Result counted apart), **planned vs real time per service type** (average per visit: the visit's Duration against check-in → check-out, only over timed visits; red when real is 20 % over planned, green when 20 % under) and **visits and hours on site per technician**. Every figure is read with the viewer's own permissions, so people see totals of what they may open. | `src/lib/insights/stats.ts`, `tests/f5-insights.test.ts` |
| F5-b | **Data** adds possible duplicate **organizations** (same 10-digit phone, same email ignoring case, or same name ignoring punctuation — the same rule as contacts, now shared code). **Merging duplicates stays after the WebAuthor import (M14)** (Fred 2026-09-30), and there is no Google review link setting (F4-d). | `src/app/(app)/data/page.tsx` |
| P1-a | **Permissions per person, no groups** (Fred 2026-10-02: "too complicated… for larger companies"). §7.2–7.4 are history: each login now holds its own permission keys (`user_permissions`) and an **Administrator** flag (`profiles.is_admin`, replaces the System Administrators group: holds everything and may edit permissions; an administrator can't unmake themselves). **Admin › Users** shows, per person, a **checklist**: one row per list (Projects, Contacts, Visits…) with View / View all / Create / Edit / Delete / Archive, an extras list per module (lock / unlock, files, notes, history, audit log, restore deleted, dropdown lists), **Workflows** (move projects through the pipeline, change punch list status, change stock status — one key per workflow replaces the per-level group lists) and **Admin** (invite, edit users, form settings, automations). **Copy from another person** fills a new login. Only administrators change permissions; people with "Edit users" see them read-only. The migration gave every login exactly what their groups (plus Everyone) granted; `scripts/data/user-permissions.ts` holds the same per person for the go-live sync (`users:sync`). | migration `20261002010000`, `src/lib/permissions/checklist.ts`, `src/components/admin/permission-checklist.tsx` |
| P1-b | **WebAuthor-only permissions removed** from the catalogue (Binders, WIKI, impersonation, metrics, email broadcast…: 490 → 183 keys). Only the keys this app checks remain; the Groups and Permissions admin screens are gone (Users covers both). `app.has_permission`, `my_permissions`, `is_sysadmin` and `may_act_on_level` read the per-person tables; RLS policies are unchanged. | `supabase/tests/rls_m4.sql` (74 checks), `workflows_m9.sql` (34) |
| P1-c | **No "WebAuthor" on screen** (Fred 2026-10-02): the field catalogue, automations, form settings and Data pages no longer name it. Code comments and SPEC keep the history. | |
| P1-d | **Insights has its own permission** (`insights.page.view`, "Pages" in the checklist; everyone who could open Projects kept it). **First logins** (Fred 2026-10-02): **Luana** everything except Payroll, Staff Performance and Insights; **Jessica** everything except Payroll (and, like Saulo, not her own performance reports, P2-d); **Saulo** (COO) everything except Payroll and the Admin items (users, form settings, automations — suggested, not an administrator); **Lucas** everything except Payroll, Staff Performance, Insights, Transactions (nothing financial) and the Admin items. Nobody but Fred is an administrator. Sign-up links come from `users:sync` (`.invite-links.txt`). | migration `20261002020000`, `scripts/data/user-permissions.ts` |
| P1-e | **Technician logins** (Fred 2026-10-04, in Portuguese, after go-live): a login for **every Active or Reports employee**, address `firstname@tsav.net` (Rodolfo Quintana → quintana@, Joao Paulo → joao@, Kleider → kleider@, Roberto Pizini moves from roberto@techsquadfl.com to roberto@tsav.net). The **technician profile** (`TECHNICIAN` in `scripts/data/user-permissions.ts`): create and finish the four field reports (Job Report, Notes, Survey and Proposals, TV Installation; never Staff Performance), see Projects, Buildings, Permits, Punch List and Visits read-only (check-in / check-out stays on `visit_step`), add files, and work only on **their own tasks** (migration `20261004040000`: a task assigned to one of my Employee records is visible and editable without "View all") and alerts; nothing financial (Payroll, Transactions, Job costing, Insights, Staff Performance), no Administrative, no Inventory, no editing of other records. **Roberto Pizini** keeps his earlier set with Inventory, the only technician with it. **Karina Smiliansky** is an administrator like Fred. `users:sync` now also sets the Employee record's email from `employeeId`. **Money off their screens**: a field may carry `requires` (a permission key) in the registry; the Projects fields under FINANCIAL STATUS (Approved, Invoiced, Paid, Financial Status) require `administrative.transactions.view_page`, so lists, record pages and forms leave them out for anyone without Transactions (administrators always see them). | `scripts/data/users.ts`, `user-permissions.ts`, `sync-users.ts` |
| P2-a | **Time clock** (Fred 2026-10-02): everyone with a login whose Employee record has the same email gets **Clock in / Clock out** at the top of Today. Pressing it saves the time and the phone's position (asked only at that moment, never tracked); the entry is labelled **Office** (within the radius of the office position, Admin › Field day), **On site** (near the job address of one of the day's visits) or **Elsewhere** (with the distance), or flagged **no location** when the phone gives none (nobody is blocked). The F2 visit buttons (On my way / Check in / Check out) save the same kind of entry, with the distance to that visit's job address. Job addresses and the office address are turned into positions once through Google Places and kept in `geocodes`. Table `time_entries`; everyone sees their own entries, Employees "View all" holders see everyone's. | migration `20261002030000`, `src/lib/time-clock/*`, `src/components/time-clock/*` |
| P2-b | **Reminders and the office view**: each Employee has a **Time clock group** (Field / Office). Past the group's reminder time (Field 5:00 PM, Office 6:00 PM, editable in Admin › Field day) a still-open day shows a warning on the clock card, an **alert on the bell** ("Still clocked in") and a **Still clocked in** section on the office Today. **Management › Time clock** (`/time-clock`, Employees "View all") lists each day per person with map links; Employees editors can **correct a time** (the original is kept and the correction signed) or remove an entry (soft delete). | `src/app/(app)/time-clock/page.tsx` |
| P2-c | **Performance reports**: Staff Performance gains **Aspect** (Speed, Quality of work, Punctuality, Communication, Safety, Teamwork, Customer care, Initiative), **Weight** (Minor / Normal / Major, default Normal), **Project** and **Visit**. **Score engine** (`src/lib/performance/score.ts`): every aspect starts at 70; a report moves it ±5 × weight (1/2/3); a report counts half after 180 days; 0–100; the overall score is the average of the aspects with reports. Bands: 85+ excellent, 70–84 good, 55–69 watch, below 55 needs attention. Reports with no aspect count under "General". | `tests/p2-time-clock.test.ts` |
| P2-d | **Employee › Performance** section (Staff Performance "View all" holders: Fred, Jessica, Saulo). **Nobody but an administrator sees reports about themselves** (Fred 2026-10-02: Jessica and Saulo cannot see their own): the section is hidden on their own Employee record and a restrictive policy (migration `20261002040000`) keeps their own reports out of every list. Technicians see only their **My skills** card on Today, never the score. score ring and band, a bar per aspect, positive / negative per month (6 months), **field signals** over the last 90 days (Punctuality: clock-ins within 5 min of the start time and visit check-ins inside the arrival window; Speed: real vs planned visit time, 85 on plan; Quality: Completed share minus 2 per return), the latest reports and **New report** (prefilled). **Skills** (Network, Cabling, AV design, Programming, Electrical, Lighting control, Shades, Cameras / security, Troubleshooting, Leadership, Customer communication, Sales) with three levels (Learning · Can do · Expert), table `employee_skills`. Nothing about performance appears on Today or Insights. | `src/components/performance/*` |
| P2-f | **Skills grade** (Fred 2026-10-02, "show the employee his grade and how he can improve"): each skill is worth up to 3 points (Learning 1, Can do 2, Expert 3); the grade is the share of the maximum (3 × 12 skills) with a letter: **A** 85 %+, **B** 70 %+, **C** 55 %+, **D** below. **How to improve** lists the next steps in order: skills not started first, then those one level from Expert. Shown on the Employee › Performance skills grid (office) and as **My skills** on the employee's own Today page (grade, levels, next steps). | `skillsGrade()` in `src/lib/performance/score.ts`, `src/components/performance/my-skills.tsx` |
| P2-e | **Privacy**: position is captured only when a button is pressed; employees see only their own entries; corrections are signed. Office address and start time: Fred to fill in Admin › Field day (asked 2026-10-02). | |
| F7-a | **Undo** (Fred 2026-10-02, "continue with the builds"): the **Saved** toast after editing a record, and the **Deleted** / **Archived** toasts, carry an **Undo** button for 8 seconds (delete → restore, archive → unarchive, edit → the fields go back). Each **update** entry in a record's **History** also has **Undo**, for anyone who may edit the record. Undo writes through the normal save path (permissions, rules, audit log; automations run) and only puts back fields that still hold the value that entry set — fields someone changed since are kept and named in the message. Masked sensitive values, the title and system columns are never touched; workflow stage moves use the workflow's own Override instead. | `src/lib/records/undo-patch.ts`, `undoChangeAction`, `tests/f7-undo.test.ts` |
| F8-a | **Map** (Fred 2026-10-02, "a section on the CRM that shows a MAP connected to the schedule"): **Schedule › Map** (`/schedule/map`, same permission as the Calendar) shows one day at a time (previous / Today / next, a date box, a technician filter): every visit of that Eastern day as a **numbered pin** (1, 2, 3… in the technician's day, in the visit's status colour; cancelled visits left out), the **office** (Admin › Field day position) as a square, and under the map the **jobs per technician** (time, status, service type, people also going, address) and the vans. Tapping a number flies to the pin; the pin's popup opens the visit. Job addresses are turned into positions through the same `geocodes` cache as the time clock; visits with no or unknown address are listed but not drawn. Map tiles come from OpenStreetMap (no key). **2026-10-04** (Fred): the pin and the list circle show the technician's **initials** ("CG" for Carlos Gurgel; first and last name) instead of the stop number, so the office sees who is where; a stop with no technician keeps its number. Same day: **every employee** may open the map (anyone who may see Visits; the vans still need Fleet view), and the pin colour follows the day: **blue** until the check-in, **green** while on site, **red** after the check-out (cancelled keeps its status colour), with a legend under the map. | `src/lib/schedule/map.ts`, `src/components/schedule/map-view.tsx`, `leaflet-map.tsx` |
| F8-b | **Bouncie** (Fred 2026-10-02, "integration with Bouncie (bouncie.dev) to show live location of the correspondent vehicles"): **Admin › Bouncie** (administrators) connects the company's Bouncie account once (OAuth 2.0 authorization code; tokens kept encrypted in `app_integrations` key `bouncie`, refreshed automatically, the refresh token rotates). The map then shows each van as a **pill with its heading arrow and the driver's name** (orange = moving, dark = parked, grey when Bouncie hasn't heard from it for 10 min, lighter after an hour), refreshed every 15 s while the page is open; the popup and the list give speed, parked / moving, when it last reported and the street. **Only people who may open the Fleet list see the vans** (administrators always). Fleet records gain **Usual driver** (Employee) and **Bouncie device** (IMEI, only when Bouncie's VIN differs); a Bouncie vehicle is paired by Bouncie device, else by VIN#. Positions are read server-side only (the token never reaches phones) and cached 10 s. The Bouncie app **CRM** (client id `techsquad-crm`, created 2026-10-02 on bouncie.dev under info@techsquadfl.com) has two redirect URIs: `https://techsquad-crm.vercel.app/api/bouncie/callback` and `http://localhost:3000/api/bouncie/callback`; its keys go in `BOUNCIE_CLIENT_ID` / `BOUNCIE_CLIENT_SECRET`. Connected on dev the same day: all 5 trackers (TS CARLOS, TSAV1, TSAV3, TSAV4, TSAV5) matched Fleet records by VIN. The pill shows the driver's name, else the Bouncie nickname ("TSAV1 Ford"); ages read "reported 2 h ago" / "23 h ago" / "3 days ago". | migration `20261002050000`, `src/lib/bouncie/*`, `/api/bouncie/*`, `tests/f8-map.test.ts` |
| F9-a | **Job hours** (Fred 2026-10-02, "F9 Job hours"): hours of work per job and per person come from the visits' **check-in → check-out** (or → now while still on site), computed on read and never stored. **Team credit**: everyone on a visit — the Technician **and everyone in Also going** — earns the whole window; one person on site 3 h with a helper = **6 technician-hours** on the job, 3 per person. The **planned** figure counts people the same way (Expected duration × crew), so planned and real compare like for like (Claude's call, so the two totals mean the same thing). `time_entries` are untouched: they belong to whoever pressed the button. Cancelled visits never count. | `src/lib/hours/engine.ts`, `tests/f9-hours.test.ts` |
| F9-b | **Visits and hours on this job**, a card at the top of each **Project** page for people who may open Visits, shown whenever the project has a Visit record **or a Job Report** (Fred 2026-10-02, looking at Gustavo Lima: "I don't see the Dashboard counting the visits"): **Times visited** (the F9-d day count, with the last date), **On site** (technician-hours, with the number of people; "no check-ins yet" on old projects), and when there are Visit records **Planned** (and "over / under plan so far", compared only over the visits that were timed, since the planned total also holds future visits), **Scheduled visits** (how many, how many timed) and the clock time (one window per visit, people not multiplied); the split **per person**; and the visits latest first (date, service type, status, who, planned → real, red when 20 % over and green when 20 % under; "On site now" while someone is checked in). **Insights › Field work** adds **Hours by project** (top 8 by technician-hours in the period, for people who may open Projects) and its hours by technician now credit people also going. | `src/components/project/project-hours.tsx`, `/insights` |
| F9-c | The same rule everywhere hours are counted: Today's **My day so far** already lists the visits a person is only "also going" on (their times are the visit's), the **performance Speed signal** already reads those visits, and both now use the engine's window; Insights' **hours by technician** reads `visits_team` too. Phase 2 job costing hangs hours on job-report team rows the same way (every engine row carries the people and the minutes). | `src/lib/field-day/day.ts`, `src/lib/insights/stats.ts`, `performance-panel.tsx` |
| F9-d | **Visits** on Projects (Fred 2026-10-02, "add to every project a new field called visits… regardless of the hours… work retroactively by looking at the Job Reports"): a computed field under a new **FIELD WORK** heading, just before FINANCIAL STATUS. **One visit = one Eastern-time day we were on the job**: the project's Job Report dates plus the days a Visit was checked in on, each day once (two technicians reporting the same day = one visit; 20 of the 113 imported projects with reports had such pairs). Never stored; `project_visit_days()` for the page, the same count in record views (emails, automations). On dev the 520 imported reports give 113 projects a count (the busiest 52 and 53 days). **2026-10-04** (Fred, Stern Residence - 6070 NBR showing 3 after the archive import): a past **Done** visit counts as a day on the job too, so the Google Calendar history, which has no check-ins, is included. | migrations `20261002060000`, `20261004030000`, `src/registry/tables/projects.ts` |
| F10-a | **Vehicle on visits** (Fred 2026-10-03, "we don't really have a designated driver for each vehicle… when we fill out visit we must choose a tech, a project and a vehicle"): Visits gain **Vehicle** (Fleet record, **required**, under Team after Technician). Today's visit card and the Schedule › Map stop list show the van. On the map, a van is labelled with the **technician of today's visit that uses it** (earliest first); Fleet › **Usual driver** stays only as the fallback when no visit names the van that day. Visits created before this have no vehicle; the next edit asks for one. | migration `20261002070000`, `src/registry/tables/visits.ts`, `src/lib/bouncie/match.ts`, `/api/bouncie/vehicles` |
| F12-a | **Claude API** (Fred 2026-10-03, "Let's do the Claude API… at least the API is done"; AI proof-reading of reports is **phase 5**): one server-side client in `src/lib/ai/claude.ts` (official `@anthropic-ai/sdk`, key `ANTHROPIC_API_KEY`, never in the browser), used by the licence-photo reading (B1-a, still the small fast model) and by everything AI later; the default model for new work is `claude-opus-5-5`. **Admin › AI** (administrators) shows whether the key is set, a **Test connection** button (one tiny request, shows the model and the time), what the AI does today and what phase 5 adds, and click-by-click steps to create the key at console.anthropic.com and put it in Vercel. | `src/lib/ai/claude.ts`, `src/lib/ai/extract.ts`, `src/app/(app)/admin/ai/page.tsx` |
| F11-a | **Checklist › Assign to** (Fred 2026-10-03, "do it"): every checklist item has an **Assign to…** box (people with an active login); new items can be assigned as they are added. The person sees their open items in the **alerts bell** (already the case) and the name shows on ticked items. Anyone who may see the record may assign, as with ticking. Automations still create items unassigned. | `record_checklist_items.assigned_to`, `src/components/records/record-panels.tsx` |
| F11-b | **Delete a login** (Fred 2026-10-03): administrators can **delete for good** a login that **never signed in** (an invite that went nowhere); the button appears on the person's page only then. Logins that were used are deactivated, never deleted, so their name stays on the records, notes and history they made. | `deleteUserAction`, `src/app/(app)/admin/users/[id]/page.tsx` |
| F13-a | **Pay rate per employee** (Fred 2026-10-03, "pay rate per person should also be a variable item… so the system calculates job costing according to each tech that went there"): an **Employee › Pay rate** panel for people with the **Job costing** permission: the rate in force today, **Set rate** (rate per hour, from a date, optional note) and the history. Rates live in their own table (`employee_pay_rates`, one row per change), not on the Employee form, so they never appear in lists, emails, PDFs or the record history, and only that permission can read them (database policy). Costing uses the rate **in force on each visit's day**. | migration `20261002080000`, `src/components/employee/pay-rate-panel.tsx`, `src/lib/costing/actions.ts` |
| F13-b | **Job costing** card on each **Project** page, only for the **Job costing** permission (granted to **Lucas, Saulo, Fred, Jessica and Luana**; administrators always; it shows in the per-person checklist under Pages): **Approved** (Apply to Project › Proposal), **Labour** = each person's time on site (F9-a crew rule) × their rate that day, **Materials** = the Cost of **Sale** records whose Destination is the project (Inventory Checkouts have no cost, so they don't count yet), **Margin** = approved − labour − materials (red when negative, amber under 20 %), labour per person (with "no pay rate" links when a rate is missing). Computed on read, never stored. Materials from stock movements and inventory checkouts are Phase 2's ledger. | `src/lib/costing/engine.ts`, `tests/f13-costing.test.ts`, `src/components/project/job-costing.tsx` |
| F14-a | **Merge duplicates** (Fred 2026-10-03, "do it"; kept for after the import as agreed 2026-09-30): on **Data**, each group of possible duplicate **contacts** or **organizations** has **Keep** (the oldest is proposed) and a tick per other record, then **Merge**. One database step (`merge_records`) moves **every reference** to the kept record (projects, permits, transactions, interactions, referrals, notes, comments, checklist items, files, @tags), fills the kept record's **blank fields** from the merged ones (oldest first), sends the merged records to the **trash** (restorable) and writes a **Merged** entry in every record's history. Needs **Edit and Delete** on that list; others only see the groups. | migration `20261002090000`, `src/lib/data/merge-actions.ts`, `src/components/data/merge-group.tsx` |
| UI-a | **Wide screens** (Fred 2026-10-03, "make the desktop version wider to use all the screen horizontally, at least optimized to 1920 × 1080", phones unchanged): pages widen up to 1600 px. **Record pages** (≥ 1280 px): toolbar and fields on the left with the fields in **two columns** (long types — text areas, files, addresses — take the row), and the workflow, the add-on cards (hours, costing, performance, pay rate…) and the sections (notes, files, history…) stacked on the right. **Forms** (≥ 1024 px): fields in two columns, headings and long types across both. **Today**: time clock, visits and tiles across the top, then "needs attention" on the left and "my assigned" on the right. **Insights**: three columns of cards. **Data**: duplicate contacts and organizations side by side. Lists, calendar and map use the full width. Phones keep exactly the same single column and order. | `src/app/(app)/[module]/[tab]/[id]/page.tsx`, `src/components/records/record-form.tsx`, `src/app/(app)/page.tsx` |
| UI-b | **Card title bands** (Fred 2026-10-03, "a contrast color on the title of each block (or tile) where the title is… all across the site"): the first title row of every card, the header of every collapsible section (Contact the client, Timeline, Notes, Files, History…) and the section headings inside a record's field list (BASIC INFORMATION…) sit on a **tinted band** that reaches the card's edges (Tech Squad blue mixed into the card colour, 12 % by day and 22 % by night). One global style in `globals.css`, so new cards get it without extra code; number tiles (Today's counts, Data's KPIs) have no title and stay as they are. | `src/app/globals.css` |
| UI-c | **One type scale** (Fred 2026-10-03, "I see an inconsistency of font styles and sizes"): every card title and section header is **15 px semibold** in the card's text colour (the band rule sets it, so no card can drift); body text uses five sizes only — **11 px** for tiny uppercase labels, **12 px** for meta lines, **13 px** for secondary text, **14 px** for body, **16 px** for inputs — with page titles at 21/24 px and big numbers at 28 px. The in-between sizes the Portal mock-ups used (10, 10.5, 11.5, 12.5, 13.5, 14.5 px) were folded into the nearest step across 38 files. | `src/app/globals.css`, `src/components/**` |
| F15-a | **Google Calendar connection** (Fred 2026-10-03, "integrate with Google Calendar, so years of calendar (visit) data feeds my current calendar"; one shared calendar on techsquadfl@gmail.com, "title will say project and technician name, each tech has a different color, most entries also have address, what to do and vehicle TAG"): **Admin › Google Calendar** (administrators). An administrator connects the Google account (OAuth, offline access; tokens encrypted in `app_integrations` key `google_calendar`), picks **which calendar** holds the visits (only that one is read or written), and sets a **colour → technician** legend (Google's 11 event colours; suggested from the events whose title names someone, editable). Needs `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` from an OAuth client in the existing Google Cloud project; the consent screen must be **published** or Google drops the connection after 7 days. | `src/lib/google/client.ts`, `/api/google/{connect,callback}`, `src/app/(app)/admin/google-calendar` |
| F15-b | **History import**, in two steps so the colours can be checked in between, each chunked and resumable (serverless time limits; a stale heartbeat lets the hourly tick or the page carry on): **1. Read the calendar** from a chosen date (default 2015-01-01) → every event as Google sent it into `calendar_events`; **2. Create visits** → each event becomes a **Visit**: Project by the **matching engine** (project name in the title, owner's name, street number + street word of the address, rarer words weigh more; "high" only when clearly ahead of the runner-up), Technician from the **name in the title** (unique first names count; a shared first name needs the surname), other names → **Also going**, otherwise the **colour**; Vehicle from the **tag number** in the text; start / duration from the event (snapped to the form's options; all-day = 8:00–16:00); description → Instructions; past events **Done**, Google-cancelled **Cancelled**. When AI is on (Admin › AI key present; switch on the page) Claude (Haiku) decides the unclear ones against the project list and **skips** entries that aren't jobs (holidays, meetings). Re-running never duplicates: events already turned into visits are only re-linked. **The calendar's own convention** (seen in the 37,000 events of techsquadfl2@gmail.com, 2026-10-04): titles read **"Technician – Client – Place"**, one entry per technician, so the technician is the **first segment only** (a client called Carlos never becomes the technician Carlos), nobody is "also going", and the Admin page has a **Names → technicians** card (the names seen most often, e.g. JP, Uli, Junior, Roberto; filled automatically when only one employee has that first name) beside the colour legend. **Not a job, never a visit** (rule, no AI needed): "Name – Warehouse", "Name – Off", folga / férias / Brasil, payday, birthdays, and repeats **more than a year ahead** (recurring entries ran to 2056). **Units** count: "#903", "Apt 2103", "Oceana 706N"; a project in the same building with another unit is ruled out, the same unit is a strong match. | `src/lib/google/match.ts`, `src/lib/google/sync.ts`, `src/lib/google/ai.ts`, `tests/f15-google-calendar.test.ts`, migration `20261003000000` |
| F15-c | **Only what matches** (Fred 2026-10-04, "skip the calendar entries that are not compliant, looking to import only what I can"): an event whose project the engine couldn't tell is **left out** (kept as "unmatched" in `calendar_events`, no visit). **Match again** on the Admin page queues those events once more, after projects, names or colours were added. Safety net kept for the few visits that can end up without a project (a Google event changed later, an edit): grey on the calendar with Google's title, an **Unassigned** lane in the Team view, a notice with the count, and **/schedule/needs-project** (people who may open Visits) with a project search box (picking a project fills just that field; the vehicle waits for the next edit, as F10-a allows) and **Not a job** (removes the visit, leaves Google alone). | `src/app/(app)/schedule/needs-project`, `src/components/schedule/needs-project-list.tsx` |
| F15-d | **Two-way sync**, every hour on the tick (`google:<slot>` run) and on **Sync now**: **pull** = Google's incremental changes (sync token; an expired token re-reads the calendar without duplicating) → a moved event moves the visit, a cancelled event cancels it, a new event becomes a visit through the same matching; **push** = visits changed since they last agreed with Google (`updated_at > google_synced_at`, kept equal by `google_mark_synced()`) → an event in the calendar's own convention: "Project – Technician", job address, description with service type, vehicle tag, also going, arrival window, instructions, parking and the CRM link, the technician's colour, `crm_visit_id` as a private property; deleted, archived or cancelled visits delete their event. **When both sides changed, the CRM wins.** Imported history is not rewritten until a visit is edited. **Not a job** on the review list never touches Google. | `src/lib/google/sync.ts`, `src/lib/engine/automations.ts` (tick) |
| F15-e | **Technician colours and the Day view** (Fred 2026-10-04, "bring the same technician colors into this CRM calendar… give me the option to see the calendar expanded by day… entries become squeezed"): every visit block on the Calendar (Week, Team, Day, phone list) is coloured by its **technician**, Google's colour for the people in the Admin › Google Calendar legend and a steady palette colour (by employee id) for everyone else; the left edge and a light tint of the block, a legend of first names above the grid, Cancelled still struck through. A visit with nobody assigned keeps the status colour (grey when it has no project). New **Day** view: one day, **a column per technician** with visits that day (plus Unassigned), the hours down the side, every block at full column width with time, address, service and the first line of the instructions; previous / next move one day; dragging a block to another column hands the visit to that technician; the day headers of the Week view open that day. **2026-10-04** (Fred: the week of 10/05 showed a full Monday but "Day" showed one visit): the Day button opens a day of the week on screen (today when it is in that week, else its first day with visits), not always today. | `src/lib/schedule/colors.ts`, `src/components/schedule/calendar.tsx` |
| UI-d | **List search looks further than the name** (Fred 2026-10-04, Inventory Checkout "the search bar is only for name search; add project and the material name"): on every list, the search box matches the record's name, every plain text field of the record (Equipment, notes, addresses typed as text…) and the names of the records it points at (Project, Technician, Product, Contact…). Sensitive fields are never searched. Same box, same as-you-type behaviour. | `src/lib/records/data.ts` (`searchClause`) |
| INV-a | **Inventory Checkout lives under Inventory and replaces Sale** (Fred 2026-10-04, "Inventory checkout lives inside Administrative; it should be moved to the Inventory tab, to replace Sale; checkout would be the same as sale"). The list, its form and its records are unchanged; only the menu (Inventory › Product · Stock · Inventory Checkout) and the permission keys move: `administrative.inventory-checkout.*` became `inventory.inventory-checkout.*` and every person kept exactly the rights they had; lock / unlock follows the Inventory module. The **Sale** list left the menu and the permission checklist (its keys were removed); the `sales` table stays in the database, empty, since nothing was ever imported into it. Phase 2 job costing will take materials from Inventory Checkouts (today the costing card still reads the empty Sale table). | migration `20261004000000`, `src/config/modules.ts`, `scripts/data/user-permissions.ts` |
| INV-b | **Inventory import** (Fred 2026-10-04, Portuguese brief + "OK for your suggestion, migrate"): the Sortly export (docs/sortly-export.xlsx, 5,480 rows, 2018–2021) and the later sales-platform export (docs/sales-export.xlsx, 5,144 rows, 2021–2024) loaded by `scripts/import-inventory.ts` (dry run / --apply, repeatable: every row carries a `source_ref`). Rules: one **Product** per distinct model / name (brands normalised: CRESTROM → Crestron…, 62 brands), SKU = shared part number or UPC, cost from the newest row, no photos; **Warehouse / Van Branca / Van Preta** stay stock locations (subfolder = location); client folders are matched to projects with the archive engine, the archive's folder decisions and linked folders, plus a strict name rule (both names in exactly one project, place agreeing), and become **Inventory Checkouts** (one per Sortly folder + subfolder, one per sales client + PO + date; lines "01 - Brand Model – S/N … – MAC …"); whatever doesn't match goes to `docs/inventory-folders.xlsx` (Project 1 / Project 2 / Other / New / Stock / Skip) and is loaded on the next run. A serial that also appears in the sales export is taken from the sales export only (542 Sortly rows). **Quantities per location live in a ledger**: `stock_movements` (opening rows from the import; Phase 2 adds ins / outs) summed by the `stock_levels` view and shown on each Product page ("Stock by location"); never hand-edited. **Stock** records only for serialized units still on the shelf or in RMA (616); delivered units are on the checkout lines. Products gained **Description** (the sales "Type") and Model allows 80 characters. First load 2026-10-04: 1,198 products, 737 movements (853 units, 107 locations), 616 stock records, 583 checkouts on 95 projects; 262 folders (4,852 rows) await Fred's sheet. | migration `20261004050000`, `scripts/import-inventory.ts`, `src/components/product/stock-levels.tsx` |
| UI-e | **Office lists stay on the office computer** (Fred 2026-10-05, "technicians don't have to see in their home screen: Approved no visit scheduled, Maintenance plan renewals, Follow up with the client, Recently modified… no mobile profile should have that, it pollutes the UI; leave it just for clerical staff on the web version"): those four Today lists are never rendered on phones (below the md breakpoint) and, on computers, only for people who may **create Projects** (`isOfficeUser`); technicians never get them. The other Today cards (visits, late, over time, tasks due, return cards, documents expiring) are unchanged. | `src/components/dashboard/today.tsx`, `widgets.tsx` |
| UI-f | **Technician tiles count only their own day** (Fred 2026-10-05, "visits today shows visits for all techs, should show only his own; plan renewals does not concern technicians"): for anyone who is not office staff (may not create Projects) the Today tiles **My visits today / On site now / Late** count only visits where the person is the Technician or in Also going, and the **Plan renewals** tile is not shown. Office staff keep the team-wide numbers. | `src/components/dashboard/kpis.tsx` |
| UI-g | **Job Report button and page say "New Report"** (Fred 2026-10-05, twice: "JOB REPORTS > NEW RECORD, it should say NEW REPORT… the title on the next page also"): the list button, the new-record page heading and the Create sheet use the table's new-record label, which for Job Report is now "New Report" (WebAuthor had "New Record"). After a check-out the heading is the report's own title (project – technician – date) as before. | `src/registry/tables/job_reports.ts` |
| UI-h | **Technicians can pick vehicles and colleagues, and file reports only under their own name** (Fred 2026-10-05, "the dropdown should show only his own name, no tech should be able to submit a report as someone else; vehicle and team are not populating"): the Team / Tag Someone / Vehicle pickers, the lookup titles and the save-side filter check read the name views `employee_names` and `vehicle_names` (readable by every signed-in user; the tables keep their permissions). For anyone who is not office staff, the Job Report **Team** picker offers only their own Employee record, a new report starts with Team = themselves, and the server refuses any other person ("You can only file this under your own name"). | migration `20261005010000`, `src/lib/auth/office.ts`, `field-actions.ts`, `save.ts` |
| UI-i | **Timeline entries are titled with the people and the date** (Fred 2026-10-05, "all the job reports inside its project tab should read the Technician and Date as title, not Visit done"): on project and contact timelines a visit reads "Marcelo Opazo" (technician + Also going; the status follows only when it is not Done, e.g. Scheduled) over its date, and a Job Report reads the team names (the result follows when there is one). Names come from the employee_names view, so technicians see them too. | `src/lib/records/timeline.ts` |
| OD-c | **PDF copies in OneDrive** (Fred 2026-10-04, "what about the text from the report, will it dump into OneDrive as a PDF as well?… do it, as precaution if CRM goes offline, dump into the same folder respecting the naming logic: job, technician, date"): every record of a form that can carry files (Job Report, Note, Survey and Proposals, TV Installation, Staff Performance, Projects, Punch List, RMA, Employees, Fleet…) gets a **PDF of its text** (no photos: they already sit in the same folder, and embedding them made each copy take seconds) in its OneDrive folder, next to its files, named **"Form – Job – Technician – MM-DD-YYYY (id).pdf"** (the record number keeps two reports of the same day apart; the technician is the record's employee lookup, all names when several went). Written in the background right after each save and **rewritten in place** on every later change (the same OneDrive file; renamed if job, technician or date changed; written afresh if someone deleted it in OneDrive). Records saved before this got theirs from **Admin › OneDrive › Write the PDF copies now** and from the hourly check, which writes for a minute each hour until none are left. Deleted records keep their last PDF. Sensitive fields never appear (the PDF builder already leaves them out). Table `record_pdfs` remembers the OneDrive item per record. | migration `20261004010000`, `src/lib/files/record-pdf.ts`, `pdf-name.ts`, `tests/od-record-pdf.test.ts` |
| F16-a | **Report archive** (Fred 2026-10-04, "before WebAuthor we used JotForm, and before that a text file, PDF or even a JPG screenshot… how could I import all this data into the CRM? not as a PDF file to consume storage, but reading the text from it and creating a CRM entry"): **Admin › Report archive** (administrators) reads the old field reports straight from the connected OneDrive, `PROJECTS TS / <designer or GC> / <client folder> / "…Reports" / files` (6,435 files in 723 folders on 2026-10-04), and makes **one Job Report and one Visit per file**. Nothing is copied: each report's Files field points at the original where it sits. **Names carry the facts**: the client folder "LAST, FIRST - PLACE # UNIT [- number]" gives the client, place and unit; the file name "2020-03-20 - Continuum 3707_Service Call_Roberto_Rodolfo.pdf" gives the date (also "05-17-2024", "10-07-25", "May 24th, 2018"), the job, the type of visit and the technicians; "(1)" and "_a" copies of the same visit are attached to the report already made for that day. The **project** is found with the calendar import's scoring (client, place, job, unit); folders with no project are listed on the page with the two likeliest projects, to fix and run again. **Technicians** come from the names map (Roberto = Pizini unless the map says otherwise, Rodolfo = Rodolfo Oliveira); names seen in five or more files with no employee are **added as inactive employees** (Fred 2026-10-04: Fernando, Bruno, Anderson, Felipe, Richard, Rinaldo, Rodrigo, Otavio…), so every old team is complete. | migration `20261004020000`, `src/lib/archive/*`, `tests/f16-report-archive.test.ts` |
| F16-b | **Reading the text**: the two form layouts are read by their labels, without AI: **123FormBuilder** tables (Client Name, Date, Check-in, Check-out, "Team-Roberto yes", Service performed / annotations, Entry ID) and **JotForm** "SERVICE CALL / JOB REPORT" PDFs (client / job name, unit, date, check-in / check-out, team chips, job performed over several pages, "did you receive any payments"). Typed notes, Word files, screenshots and scanned PDFs are read by **Claude (Haiku)** into the same fields. **Credentials** (network names, Wi-Fi passwords, logins, PINs, IP addresses) are moved into the encrypted **Login and Passwords** field by rule and by Claude, never left in the Report. Pending items fill Pending 1–5, materials and problems their fields, "Payment received: …" is noted in the report, a "Maintenance" visit ticks Maintenance Plan Service Call. The **Visit** (status Done) gets the form's **check-in and check-out** as real times, so the old jobs count in Hours on this job and job costing; 9:00 for two hours when the file has no times. Visits from the archive are never pushed to Google Calendar, and no automation (e-mail) fires for imported records. | `src/lib/archive/parse.ts`, `read.ts`, `ai.ts` |
| F16-c | **How it runs**: 1. **List the files** (resumable walk of the tree, by folder index); 2. **Dry run** (reads every file, decides project / date / technicians, writes nothing but what it found, so the page can show counts, folders with no project and unreadable files); 3. **Import** (creates the records; files the dry run read are not read or paid for again; only files that found their project are created). **Files dated on or after the first WebAuthor report** (the cutoff date on the page) are skipped: that period is already in the CRM. Spreadsheets, videos and the like are skipped as not reports. Each step runs in the background in chunks with a heartbeat, like the calendar import; the page polls and restarts a chunk that died. | `src/lib/archive/sync.ts`, `src/app/(app)/admin/report-archive` |
| F16-d | **Folders decided by hand** (Fred 2026-10-04, reviewing the dry run: "ROCA, CEZAR - ONE PARK GROVE #15A" is the same apartment as Pam Gelsomini's project but a different owner, "to be treated independently"; "120 W RIVO ALTO" is not Jun Isaji's One Ocean project; the scorer cannot tell those from "WAGNER, RICHARD - APOGEE #1402" → John Rutherford, which is right). Admin › Report archive has a list **Folders decided by hand**: a client folder → a project, or **No project**. The import follows the list before any scoring; a decision survives listing the files again. Kept in `app_integrations` key `report_archive_folders`. **New project from this folder** creates the project through the ordinary write path (type Residential, category Low Voltage, named "Last, First - Place", the unit in Apartment or Unit #, the place as the street of the job address until someone types the real one), owned by a contact of that name, found or created as an End Customer, and decides the folder to it. Fred answers in a spreadsheet of the folders with no project (`docs/report-archive-folders.xlsx`: Project 1 / Project 2 / Other / New / Skip), applied through the page. Same day: the client folder name counts in the score (it was dropped as the "technician" segment), "Last, First" folders match "Last, First" projects, a unit number is never a street number, NYC reads as New York, files over 25 MB are skipped unread, four folder-days are read at once. | `src/lib/archive/match.ts`, `actions.ts`, `report-archive-panel.tsx` |
| M7-d | Hidden fields keep their stored values (as in WebAuthor), so switching back restores them. The only exception is where a rule explicitly clears a value (Inventory Checkout › Tools clears Project). | `src/lib/rules/evaluate.ts` |
