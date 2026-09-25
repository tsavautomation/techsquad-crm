# Build plan: Phase 1 (exact rebuild, no data)

Each milestone is small, ends with something you can click on, and stops for your OK before the next one starts.

---

## 0. What you need to set up (one-time, about 1 hour)

You create the accounts yourself; I cannot create accounts or enter passwords. Once you paste me the keys (into `.env.local`, never into chat), I do the rest.

| # | What | Why | Plan / cost (check current pricing) |
|---|---|---|---|
| 1 | **Node.js LTS** from nodejs.org, and **Git** from git-scm.com, on this PC | to run and version the app | free |
| 2 | **GitHub** account + an empty private repo `techsquad-crm` | code backup; Vercel deploys from it | free |
| 3 | **Supabase** account → 2 projects: `techsquad-crm-dev` and later `techsquad-crm-prod`, region **East US** | database, logins, file storage | dev: Free. Prod: **Pro ≈ $25/mo** (free projects pause after a week of inactivity and have no backups) |
| 4 | **Vercel** account, signed in with GitHub | hosting | **Pro ≈ $20/mo**: Hobby is for non-commercial use and only allows daily cron jobs, and we need hourly |
| 5 | **Resend** account + verify the **tsav.net** domain (you or whoever manages tsav.net DNS adds 3–4 DNS records) | send email as info@tsav.net / saulo@tsav.net | Free tier (3,000/mo) is likely enough |
| 6 | A subdomain for the app, for example **crm.tsav.net** (one DNS record pointing to Vercel) | nice URL | free |

Phase 2 will also need a Microsoft 365 / Entra app registration (OneDrive), a Google Cloud project (Drive) and an Anthropic API key. None of those are needed now.

---

## Milestones

| # | Milestone | You'll be able to… | Done when |
|---|---|---|---|
| **M1** | **Skeleton + login + deploy.** Next.js app, Tailwind / shadcn, Supabase auth (login, logout, forgot password), mobile layout shell with the 5 modules as empty nav, PWA manifest, deployed to Vercel preview | open the preview URL on your iPhone, log in, add it to the home screen | login works on iPhone Safari; lint, typecheck and tests pass |
| **M2** | **Users, groups, permissions.** Tables `profiles`, `groups`, `group_members`, `permissions`; seed the 12 groups and the full permission matrix (SPEC §7); `app.has_permission()` + RLS helper; the nav hides what a user can't access; invite the 11 real users (not WebAuthor Support) | log in as different people and see different menus | a test proves each group's menu matches SPEC §7 |
| **M3** | **Registry generated + reviewed.** Script turns the JSON into 28 TypeScript table definitions (fields, options, lookups, auto-fill, rules, legacy names); parity test vs the JSON; you answer SPEC §9 Q1–Q20 | review a printable "field catalogue" page | parity test green; open questions answered |
| **M4** | **Database schema.** Migrations for all 28 tables with FKs and indexes; join tables for multi-lookups; generic tables (attachments, notes, comments, checklist, audit log); views for Approved / Invoiced / Paid and summary counts; RLS on every table; encryption for sensitive fields | inspect tables in the Supabase dashboard | migrations apply cleanly to an empty dev DB; RLS tests pass per group |
| **M5** | **Generic list + detail + form (core field types).** One set of pages driven by the registry: list (search / sort / filter, cards on mobile), detail view, create / edit form. Field types: text, long text, dropdown, radio, checkboxes, Yes/No, date, date-time, money, number, phone, email, URL, address | create and edit Buildings, Suppliers and Brands end-to-end | simple tables fully usable on iPhone |
| **M6** | **Remaining field types.** Lookups (search-as-you-type, filtered + dependent pickers, multi-select), auto-fill on pick (SPEC §2.2), file / image upload (direct to Supabase Storage, camera on iPhone), signature pad, rich text, SSN / EIN, computed fields, auto titles | create a Project, Permit, Job Report and TV Installation with photos and signature | every field in SPEC §3 renders and saves |
| **M7** | **Field rules engine.** show / hide / set / clear / toggle-required, live on the form and enforced on the server (hidden = not required); all rules from SPEC §4 | watch Organization fields change by Type, and Job Report pending boxes cascade | unit test per rule in SPEC §4 |
| **M8** | **Record features.** Notes, files pod, comments, checklist items, archive / unarchive, soft delete + Deleted Items, audit log / history, submit & lock, Modify Locked permission, Summary counts | full record lifecycle | tests for lock / archive permissions |
| **M9** | **Workflows.** First confirm with Fred who may move each stage (WebAuthor's "Everyone" is not intended). Engine + seed the 4 workflows (SPEC §6): submit → start level, outcome buttons, Override, Remove from Workflow (unsubmit), field updates per level, timeline with comments, "My Assigned" queue, bulk move | drive a Project from Surveying to Complete on the phone | each workflow's transitions tested |
| **M10** | **Automations: events + email.** Engine + seed all 39 triggers as data (SPEC §5): update fields, send email (record card, view link, record PDF, file attachments), add checklist items (incl. to the linked Project), archive. Email outbox, Resend, **test mode** that sends everything to you. Admin screen to view, enable and edit automations and see their run log | add a Punch List item and receive the test email | each trigger has a test |
| **M11** | **Scheduled automations.** Vercel Cron (daily 00:00 ET, hourly); expiry / status triggers; idempotent re-runs | see statuses flip overnight in dev | time-travel tests on "days to today" logic |
| **M12** | **Dashboards + admin.** Per-module dashboard (My Assigned, My Tasks, Recently Modified); admin screens: users ↔ groups, **editable permission matrix**, utility lists, automations; **"Form settings" screen: edit labels, dropdown options (add / rename / re-colour / retire), required yes/no, field order and help text without code**; **permission review session with Fred** (several WebAuthor grants need adjusting) | manage users without me | admins can do everything SPEC §7 gives them |
| **M13** | **Hardening + go-live of the empty system.** Parity walk-through against SPEC (checklist per table), iPhone QA, security review (RLS, secrets, sensitive fields), prod Supabase project, crm.tsav.net domain, backups on, email test mode off | use it for real (still without the old data) | you sign off |

**After Phase 1 (separate, optional): M14 data import.** A script that reads a full WebAuthor data export and loads it using the legacy name map and legacy IDs. It is planned now (legacy IDs + mapping are kept) so it's cheap later.

---

## Decisions I'm proposing (tell me if you disagree)

1. **Real tables + a registry** (not a generic "form builder" database). It is faster, safer, and makes Phase 2 costing reports simple SQL. Trade-off: adding a field later means a small code change, not a click in an admin screen.
2. **Clean column names** with a legacy map (SPEC §9 Q2). Labels and options stay identical.
3. **Triggers and workflows stored as data** with an admin screen, so they can be adjusted without code. The 14 per-person email triggers are ported one-to-one (Q15).
4. **Resend for email** in Phase 1. If tsav.net mail is on Microsoft 365, we could switch to sending through M365 in Phase 2 alongside OneDrive.
5. **Not rebuilding in Phase 1**: Map View, Binders, WIKI / Hubs, Metrics dashboards, mail-merge, email broadcast, Onboarding / Return-RMA (undefined in the export) (SPEC §8). Each can be added later.

## How Phase 2 is already accounted for
- **Job report → OneDrive / Google Drive**: the files layer already supports a storage `provider`, uploads already go direct from the phone, and projects get a drive-folder reference. Phase 2 adds a Graph / Drive connector and resumable video upload.
- **Inventory & job costing**: typed tables with real FKs; multi-person team fields are join tables (room for hours per tech); Sale / Checkout already link products to projects. Phase 2 adds a stock-movement ledger and costing views.
- **AI**: all writes go through one path with an audit log; automations have pluggable action types and a run log; emails go through an outbox that can require approval before sending.
