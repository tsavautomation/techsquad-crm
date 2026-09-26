# CLAUDE.md: TechSquad CRM

@AGENTS.md

Replacement for the WebAuthor CRM at techsquad.webauthor.com.
- **Phase 1**: an exact functional rebuild, with no data.
- **Phase 2**: field reports with media going to OneDrive / Google Drive, inventory and job costing, and AI.

## Source of truth
- `SPEC.md` is the functional spec. Every table, field, option, rule, trigger, workflow and permission comes from there. Do not invent behaviour. If SPEC.md is silent or ambiguous, ask, and record the answer in SPEC.md §9.
- `techsquad_crm_spec.json` is the raw WebAuthor export. It is **read-only**; never edit it. Scripts may read it to generate or verify code.
- `PLAN.md` holds the milestones. Work one milestone at a time and stop for review at the end of each.
- **Labels and dropdown options must match SPEC.md character for character**, including their odd spellings ("Alternate Role / Tilte", "Building / Developement"). Fix typos only when the user asks.

## Stack
- **Next.js** (latest stable, App Router, TypeScript `strict`) on **Vercel**.
- **Supabase**: Postgres, Auth (email + password / magic link) and Storage. Use `@supabase/ssr` for server and browser clients.
- Tailwind CSS + shadcn/ui · react-hook-form + Zod · TanStack Table for grids.
- Email: Resend, always through the `email_outbox` table (never send directly from a request handler). Record PDFs: `@react-pdf/renderer`.
- Tests: Vitest (engines, registry parity) and Playwright (smoke tests at an iPhone viewport).
- Package manager: npm. Dev machine: Windows / PowerShell. Use `;` rather than `&&` in commands given to the user.

## Architecture
- **Typed tables, not EAV.** Each WebAuthor table becomes a real Postgres table with typed columns and real foreign keys. Phase 2 job costing needs plain SQL over them.
- **Registry** in `src/registry/`: one TypeScript definition per table, with name, module, fields (label, column, type, required, options, lookup target / filter, auto-fill mapping, default), field rules, title formula and `legacy` names.
  - The first draft is generated from the JSON by `scripts/generate-registry.ts`. After that the committed TypeScript is the source.
  - `tests/registry-parity.test.ts` checks labels, options and required flags against the JSON.
  - Forms, grids, detail pages and validation are all driven by the registry. Do not hand-build a form per table unless there is a real layout need.
- **Engines** in `src/lib/engine/` are pure, unit-tested functions:
  - `rules.ts`: shared by client and server. Evaluate rules declaratively (see SPEC §4); hidden fields are never required.
  - `conditions.ts`: condition evaluation, including "days to today" = today − date in America/New_York.
  - `automations.ts`: event triggers and scheduled triggers.
  - `workflow.ts`: levels, outcomes, override, unsubmit.
- **Automations (triggers) and workflows are data**, stored in the `automations`, `workflows`, `workflow_levels` and `workflow_outcomes` tables and seeded from SPEC. Do not hard-code them in if-statements.
- **One write path.** Every create or update goes through `saveRecord()` in `src/lib/records/`, which does, in order:
  1. permission check
  2. registry + rules validation (Zod), with clear-value rules applied
  3. database write
  4. audit log entry
  5. event automations (Added / Modified / Field Change)
  6. workflow effects

  Engines use the same path, so their changes are audited too.
- **Scheduled triggers**: Supabase pg_cron (job `crm-tick`, hourly at :01) calls `/api/cron/tick` through pg_net; Vercel Cron (`vercel.json`, daily 05:15 UTC) is a backup, since Hobby allows one cron a day. The tick runs each Eastern-time slot once (`scheduled_runs` keys `daily:<date>` / `hourly:<date>T<hh>`). Protected by `CRON_SECRET`; everything must be idempotent. The URL and secret live in Supabase Vault (`crm_cron_url`, `crm_cron_secret`); set them again on the production project (M13). `/api/cron/daily|hourly|events` run a check on demand.
- **Files**: one `attachments` table (table, record_id, field, provider, provider_path, name, mime, size).
  - Phase 1 provider = `supabase`; Phase 2 adds `onedrive` / `gdrive` without touching domain tables.
  - Upload **directly from the browser** (signed upload URLs / resumable sessions). Never stream file bodies through a Vercel function (4.5 MB request limit; iPhone videos are large).
- **Platform features every record has** (SPEC §1.3) are generic tables keyed by (table, record_id): `record_notes`, `record_comments`, `record_checklist_items`, `audit_log`. Soft-delete uses `deleted_at`, archive uses `archived_at`, and locking uses `locked` + `submitted_at`.

## Commands
- `npm run dev` · `npm test` · `npm run lint` · `npm run typecheck` · `npm run build`
- `npm run gen:registry`: regenerate `src/registry/tables/*` from the JSON. **This overwrites hand edits**, so check `git diff`.
- `npx tsx scripts/generate-schema.ts <file>`: SQL for record tables. It generated the M4 migration; never regenerate an applied migration.
- `npm run db:push`: apply new migrations to the linked **dev** project. `npm run db:types` regenerates `database.types.ts` after every migration.
- `npm run db:test-rls` (55 permission checks) and `npm run db:test-workflows` (34 workflow checks) run against dev and are fully rolled back. Run both after any change to policies, permissions or workflows.
- `npm run users:sync -- --apply [--only a@b.c]`: create logins and sync groups from `scripts/data/users.ts`. Sign-up links go to `.invite-links.txt`.
- Agent PowerShell sessions must refresh PATH (Machine + User) before calling node/npm/npx. In the user's own terminal, use `npx.cmd` (script execution is disabled).
- Migration file names must sort after the last applied one. Check before `db push`.

## Database conventions
- Migrations live in `supabase/migrations/`, one file per change, created with `npx supabase migration new <name>`. Never edit a migration that has already been applied; add a new one.
- Table names are clean, plural snake_case (`projects`, `contacts`, `organizations`, `punch_list_items`, `job_reports`, …). Column names are clean snake_case. Each registry field keeps `legacy: 'fx_techsquad_projects.which_one'` for the future data import. SPEC §9 Q2.
- Primary keys: `id bigint generated by default as identity`, so legacy WebAuthor IDs can be inserted as-is on import.
- Every domain table has `created_at, created_by, updated_at, updated_by, archived_at, deleted_at`. Tables with Submit also have `locked boolean default false, submitted_at timestamptz`.
- Types:
  - money: `numeric(12,2)`
  - Yes/No: `boolean not null default false`
  - checkbox multi-select: `text[]`
  - address: `jsonb` `{street,address_2,city,state,zip}`
  - multi-lookups: join tables (for example `job_report_team`), because Phase 2 hangs hours per tech on them
- Dropdown values are stored as the **stored value** from SPEC ("Developer Builder", not "Developer / Builder"). Options live in the registry and are validated with Zod. No Postgres enums.
- Computed fields (Projects Approved / Invoiced / Paid) and Summary counts come from **views or queries**. They are never stored.
- **RLS is on for every table.** Policies call `app.has_permission(resource, action)`, which reads `group_members` + `permissions`.
  - Every signed-in user is implicitly in *Everyone*.
  - System Administrators bypass everything.
  - Without "View All", a user sees only rows where `created_by = auth.uid()`.
- The service-role key is used only in server-side engine code and cron routes, never in client bundles or `NEXT_PUBLIC_*` variables.
- Sensitive fields (SSN, organization passwords, system credentials, job report logins) are encrypted at rest, masked in the UI and excluded from emails and PDFs.

## UI conventions
- **Mobile-first; the iPhone is the primary device.**
  - Design at 390 px first, then widen.
  - Single-column forms, 44 px minimum tap targets, and input font-size ≥ 16 px (stops iOS zoom-on-focus).
  - Bottom navigation on mobile, sidebar on desktop.
  - Lists become cards under `md`.
  - File inputs use `accept` + `capture` so the camera opens.
  - The app is installable as a PWA (manifest + icons).
- Modules and tab order follow SPEC §1.1. Record forms follow the field order and section headings in SPEC §3.
- Dates are shown as m/d/yyyy and date-times as m/d/yyyy h:mm AM/PM, all in America/New_York.

## Email
- The sender identities (info@tsav.net, saulo@tsav.net, "TS CRM") require the tsav.net domain to be verified in Resend.
- `EMAIL_TEST_MODE=true` (the default everywhere except production) redirects **every** email to `EMAIL_TEST_RECIPIENT` and prefixes the subject with `[TEST]`.
- Real addresses from the spec must never receive mail from dev or preview environments.

## Phase 2: design for it, don't build it yet
- Job Report media → OneDrive (Microsoft Graph) or Google Drive, in a per-project folder. Keep the `attachments.provider` abstraction and a nullable `projects.drive_folder_ref`. Uploads use resumable sessions from the phone.
- Inventory control and job costing. Stock movements become a ledger table later, so stock quantities must never be hand-edited in place. Tech hours hang on job-report team rows. Units per job come from Sale / Inventory Checkout lines tied to projects.
- AI (Claude API) reads job reports, fills fields and drafts or sends emails.
  - Automation actions are a typed union, so new action types (`ai_extract`, `ai_draft_email`) can be added.
  - Every automation run is logged in `automation_runs`.
  - Emails go through the outbox, so AI emails can require approval.

## Working rules for Claude
- Stop at the end of each milestone: summarise what changed and how it was verified, then wait for the user's OK.
- Run `npm run lint`, `npm run typecheck` and `npm test` before calling a milestone done. For UI changes, also check the page at an iPhone viewport.
- Never apply migrations to, or send email from, the production Supabase project without explicit confirmation.
- Never commit secrets. `.env.local` is git-ignored, and `.env.example` lists every variable with no values.
- Don't assume the user is a developer. When they must do something (dashboards, DNS, accounts), give exact click-by-click steps.
