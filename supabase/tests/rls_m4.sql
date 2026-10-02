-- Row-level security test for M4 (SPEC §7). Run against the dev database:
--
--   npx supabase db query --linked --file supabase/tests/rls_m4.sql
--
-- Everything happens inside one DO block that ENDS BY RAISING AN EXCEPTION, so
-- all fixtures (temporary users, records) are rolled back. The exception text
-- carries the result: RLS_RESULT {"passed": n, "failed": [...]}.
-- Never run this against production.

do $test$
declare
  users jsonb := jsonb_build_object(
    'tech',     '00000000-0000-4000-a000-000000000001',
    'pm',       '00000000-0000-4000-a000-000000000002',
    'acc',      '00000000-0000-4000-a000-000000000003',
    'everyone', '00000000-0000-4000-a000-000000000004',
    'admin',    '00000000-0000-4000-a000-000000000005',
    'tre',      '00000000-0000-4000-a000-000000000006',
    'sa',       '00000000-0000-4000-a000-000000000007'
  );
  -- What the old groups granted each test person (SPEC §9.1 P1); the keys this app checks.
  grants jsonb := $grants${"tech":["administrative.inventory-checkout.create","administrative.inventory-checkout.view_all","administrative.inventory-checkout.view_page","administrative.module.activity_history_add","administrative.module.activity_history_view","administrative.module.files_add_new","administrative.module.files_view_files_pod","administrative.rma.view_all","administrative.rma.view_page","administrative.tasks.create","administrative.tasks.modify","administrative.tasks.view_all","administrative.tasks.view_page","forms.job-reports.create","forms.job-reports.modify","forms.job-reports.view_all","forms.job-reports.view_page","forms.notes.create","forms.notes.modify","forms.notes.view_all","forms.notes.view_page","forms.survey-and-proposals.create","forms.survey-and-proposals.modify","forms.survey-and-proposals.view_all","forms.survey-and-proposals.view_page","forms.tv-installations.create","forms.tv-installations.modify","forms.tv-installations.view_all","forms.tv-installations.view_page","projects.buildings.view_all","projects.buildings.view_page","projects.module.activity_history_add","projects.module.activity_history_view","projects.module.audit_log","projects.module.deleted_items","projects.module.files_add_new","projects.module.files_view_files_pod","projects.permits.view_all","projects.permits.view_page","projects.projects.view_all","projects.projects.view_page","projects.punch-list.view_all","projects.punch-list.view_page","schedule.visits.view_all","schedule.visits.view_page","workflow.punch_list.act"],"pm":["administrative.module.activity_history_add","administrative.module.activity_history_view","administrative.module.audit_log","administrative.module.deleted_items","administrative.module.files_add_new","administrative.module.files_view_files_pod","administrative.module.notes_allow_delete","administrative.module.notes_allow_delete_of_my_notes","administrative.payroll.create","administrative.payroll.view_page","administrative.rma.create","administrative.rma.delete","administrative.rma.modify","administrative.rma.view_all","administrative.rma.view_page","administrative.tasks.create","administrative.tasks.delete","administrative.tasks.modify","administrative.tasks.view_all","administrative.tasks.view_page","administrative.vehicles.create","administrative.vehicles.delete","administrative.vehicles.modify","administrative.vehicles.view_all","administrative.vehicles.view_page","forms.job-reports.archive","forms.job-reports.create","forms.job-reports.view_all","forms.job-reports.view_page","forms.module.deleted_items","forms.notes.archive","forms.notes.create","forms.notes.view_all","forms.notes.view_page","forms.records.lock_unlock","forms.staff-performance.archive","forms.staff-performance.create","forms.staff-performance.view_all","forms.staff-performance.view_page","forms.survey-and-proposals.archive","forms.survey-and-proposals.create","forms.survey-and-proposals.view_all","forms.survey-and-proposals.view_page","forms.tv-installations.archive","forms.tv-installations.create","forms.tv-installations.view_all","forms.tv-installations.view_page","projects.buildings.create","projects.buildings.delete","projects.buildings.modify","projects.buildings.view_all","projects.buildings.view_page","projects.contacts.create","projects.contacts.delete","projects.contacts.modify","projects.contacts.view_all","projects.contacts.view_page","projects.module.activity_history_add","projects.module.activity_history_view","projects.module.audit_log","projects.module.deleted_items","projects.module.files_add_new","projects.module.files_allow_delete","projects.module.files_view_files_pod","projects.module.notes_allow_delete","projects.module.notes_allow_delete_of_my_notes","projects.organizations.create","projects.organizations.delete","projects.organizations.modify","projects.organizations.view_all","projects.organizations.view_page","projects.permits.create","projects.permits.delete","projects.permits.modify","projects.permits.view_all","projects.permits.view_page","projects.projects.create","projects.projects.delete","projects.projects.delete_locked","projects.projects.modify","projects.projects.view_all","projects.projects.view_page","projects.punch-list.create","projects.punch-list.delete","projects.punch-list.modify","projects.punch-list.view_all","projects.punch-list.view_page","schedule.visits.archive","schedule.visits.create","schedule.visits.delete","schedule.visits.modify","schedule.visits.view_all","schedule.visits.view_page","workflow.project_proposal.act","workflow.punch_list.act"],"acc":["forms.job-reports.archive","forms.job-reports.create","forms.job-reports.delete","forms.job-reports.modify","forms.job-reports.view_all","forms.job-reports.view_page","forms.module.deleted_items","forms.module.files_allow_delete","forms.notes.archive","forms.notes.create","forms.notes.delete","forms.notes.modify","forms.notes.view_all","forms.notes.view_page","forms.records.delete_locked","forms.records.lock_unlock","forms.records.modify_locked","forms.staff-performance.archive","forms.staff-performance.create","forms.staff-performance.delete","forms.staff-performance.modify","forms.staff-performance.view_all","forms.staff-performance.view_page","forms.survey-and-proposals.archive","forms.survey-and-proposals.create","forms.survey-and-proposals.delete","forms.survey-and-proposals.modify","forms.survey-and-proposals.view_all","forms.survey-and-proposals.view_page","forms.tv-installations.archive","forms.tv-installations.create","forms.tv-installations.delete","forms.tv-installations.modify","forms.tv-installations.view_all","forms.tv-installations.view_page","projects.buildings.create","projects.buildings.delete","projects.buildings.modify","projects.buildings.view_all","projects.buildings.view_page","projects.contacts.create","projects.contacts.delete","projects.contacts.modify","projects.contacts.view_all","projects.contacts.view_page","projects.module.activity_history_add","projects.module.activity_history_view","projects.module.audit_log","projects.module.deleted_items","projects.module.design_design","projects.module.design_triggers","projects.module.files_add_new","projects.module.files_allow_delete","projects.module.files_view_files_pod","projects.module.notes_allow_delete","projects.module.notes_allow_delete_of_my_notes","projects.module.options_utility_tables","projects.permits.create","projects.permits.delete","projects.permits.modify","projects.permits.view_all","projects.permits.view_page","projects.projects.create","projects.projects.delete","projects.projects.delete_locked","projects.projects.lock_unlock","projects.projects.modify","projects.projects.modify_locked","projects.projects.view_all","projects.projects.view_page","projects.punch-list.create","projects.punch-list.delete","projects.punch-list.modify","projects.punch-list.view_all","projects.punch-list.view_page","workflow.punch_list.act"],"everyone":["projects.module.activity_history_add","projects.module.activity_history_view","projects.module.audit_log","projects.module.deleted_items","projects.module.files_add_new","projects.module.files_view_files_pod"],"admin":["administrative.module.activity_history_add","administrative.module.activity_history_view","administrative.module.audit_log","administrative.module.deleted_items","administrative.module.files_add_new","administrative.module.files_allow_delete","administrative.module.files_view_files_pod","administrative.module.notes_allow_delete","administrative.module.notes_allow_delete_of_my_notes","administrative.module.options_utility_tables","administrative.records.delete_locked","administrative.records.lock_unlock","administrative.records.modify_locked","forms.job-reports.archive","forms.job-reports.create","forms.job-reports.delete","forms.job-reports.modify","forms.job-reports.view_all","forms.job-reports.view_page","forms.module.deleted_items","forms.module.files_allow_delete","forms.notes.archive","forms.notes.create","forms.notes.delete","forms.notes.modify","forms.notes.view_all","forms.notes.view_page","forms.records.delete_locked","forms.records.lock_unlock","forms.staff-performance.archive","forms.staff-performance.create","forms.staff-performance.delete","forms.staff-performance.modify","forms.staff-performance.view_all","forms.staff-performance.view_page","forms.survey-and-proposals.archive","forms.survey-and-proposals.create","forms.survey-and-proposals.delete","forms.survey-and-proposals.modify","forms.survey-and-proposals.view_all","forms.survey-and-proposals.view_page","forms.tv-installations.archive","forms.tv-installations.create","forms.tv-installations.delete","forms.tv-installations.modify","forms.tv-installations.view_all","forms.tv-installations.view_page","inventory.module.activity_history_add","inventory.module.activity_history_view","inventory.module.files_add_new","inventory.products.create","inventory.products.modify","inventory.products.view_all","inventory.products.view_page","inventory.sales.create","inventory.sales.modify","inventory.sales.view_all","inventory.sales.view_page","inventory.stock.create","inventory.stock.modify","inventory.stock.view_all","inventory.stock.view_page","projects.buildings.create","projects.buildings.delete","projects.buildings.modify","projects.buildings.view_all","projects.buildings.view_page","projects.contacts.create","projects.contacts.delete","projects.contacts.modify","projects.contacts.view_all","projects.contacts.view_page","projects.module.activity_history_add","projects.module.activity_history_view","projects.module.audit_log","projects.module.deleted_items","projects.module.design_design","projects.module.design_triggers","projects.module.files_add_new","projects.module.files_allow_delete","projects.module.files_view_files_pod","projects.module.notes_allow_delete","projects.module.notes_allow_delete_of_my_notes","projects.module.options_utility_tables","projects.organizations.create","projects.organizations.delete","projects.organizations.modify","projects.organizations.view_all","projects.organizations.view_page","projects.permits.create","projects.permits.delete","projects.permits.modify","projects.permits.view_all","projects.permits.view_page","projects.projects.create","projects.projects.delete","projects.projects.delete_locked","projects.projects.lock_unlock","projects.projects.modify","projects.projects.modify_locked","projects.projects.view_all","projects.projects.view_page","schedule.visits.archive","schedule.visits.create","schedule.visits.delete","schedule.visits.modify","schedule.visits.view_all","schedule.visits.view_page","site.admin.add_new_member","site.admin.members","workflow.project_proposal.act","workflow.stock_status.act"],"tre":["administrative.employees.create","administrative.employees.delete","administrative.employees.modify","administrative.employees.view_all","administrative.employees.view_page","administrative.inventory-checkout.create","administrative.inventory-checkout.delete","administrative.inventory-checkout.modify","administrative.inventory-checkout.view_page","administrative.module.activity_history_add","administrative.module.activity_history_view","administrative.module.audit_log","administrative.module.deleted_items","administrative.module.files_add_new","administrative.module.files_allow_delete","administrative.module.files_view_files_pod","administrative.module.notes_allow_delete","administrative.module.notes_allow_delete_of_my_notes","administrative.payroll.create","administrative.payroll.modify","administrative.payroll.view_all","administrative.payroll.view_page","administrative.records.delete_locked","administrative.records.lock_unlock","administrative.records.modify_locked","administrative.rma.create","administrative.rma.delete","administrative.rma.modify","administrative.rma.view_all","administrative.rma.view_page","administrative.tasks.create","administrative.tasks.delete","administrative.tasks.modify","administrative.tasks.view_all","administrative.tasks.view_page","administrative.transactions.create","administrative.transactions.delete","administrative.transactions.modify","administrative.transactions.view_all","administrative.transactions.view_page","administrative.vehicles.create","administrative.vehicles.delete","administrative.vehicles.modify","administrative.vehicles.view_all","administrative.vehicles.view_page","forms.job-reports.archive","forms.job-reports.create","forms.job-reports.delete","forms.job-reports.modify","forms.job-reports.view_all","forms.job-reports.view_page","forms.module.deleted_items","forms.notes.archive","forms.notes.create","forms.notes.delete","forms.notes.modify","forms.notes.view_all","forms.notes.view_page","forms.records.delete_locked","forms.staff-performance.archive","forms.staff-performance.create","forms.staff-performance.delete","forms.staff-performance.modify","forms.staff-performance.view_all","forms.staff-performance.view_page","forms.survey-and-proposals.archive","forms.survey-and-proposals.create","forms.survey-and-proposals.delete","forms.survey-and-proposals.modify","forms.survey-and-proposals.view_all","forms.survey-and-proposals.view_page","forms.tv-installations.archive","forms.tv-installations.create","forms.tv-installations.delete","forms.tv-installations.modify","forms.tv-installations.view_all","forms.tv-installations.view_page","projects.buildings.create","projects.buildings.delete","projects.buildings.modify","projects.buildings.view_all","projects.buildings.view_page","projects.contacts.create","projects.contacts.delete","projects.contacts.modify","projects.contacts.view_all","projects.contacts.view_page","projects.module.activity_history_add","projects.module.activity_history_view","projects.module.audit_log","projects.module.deleted_items","projects.module.files_add_new","projects.module.files_allow_delete","projects.module.files_view_files_pod","projects.module.notes_allow_delete","projects.module.notes_allow_delete_of_my_notes","projects.organizations.create","projects.organizations.delete","projects.organizations.modify","projects.organizations.view_all","projects.organizations.view_page","projects.permits.create","projects.permits.delete","projects.permits.modify","projects.permits.view_all","projects.permits.view_page","projects.projects.archive","projects.projects.create","projects.projects.delete","projects.projects.delete_locked","projects.projects.lock_unlock","projects.projects.modify","projects.projects.modify_locked","projects.projects.view_all","projects.projects.view_page","projects.punch-list.create","projects.punch-list.delete","projects.punch-list.modify","projects.punch-list.view_all","projects.punch-list.view_page","schedule.visits.archive","schedule.visits.create","schedule.visits.delete","schedule.visits.modify","schedule.visits.view_all","schedule.visits.view_page","workflow.punch_list.act"]}$grants$;
  -- [who, sql, expected]; who = null runs as the database owner (like an engine).
  -- expected: 'ok' (≥1 row affected) | 'none' (0 rows affected, silently filtered) | 'error' | 'rows=N'
  steps jsonb := $steps$[
    ["pm",       "insert into public.projects (id, title, type, category) values (900001, 'RLS test', 'Residential', 'Low Voltage')", "ok"],
    ["tech",     "insert into public.projects (id, title, type, category) values (900002, 'x', 'Residential', 'Low Voltage')", "error"],
    ["tech",     "select count(*) from public.projects where id = 900001", "rows=1"],
    ["everyone", "select count(*) from public.projects where id = 900001", "rows=0"],
    ["everyone", "update public.projects set title = 'x' where id = 900001", "none"],

    [null,       "insert into public.punch_list_items (id, project_id, type) values (900101, 900001, 'Installation')", "ok"],
    ["everyone", "select count(*) from public.punch_list_items where id = 900101", "rows=0"],
    ["tech",     "select count(*) from public.punch_list_items where id = 900101", "rows=1"],
    ["pm",       "update public.punch_list_items set details = 'x' where id = 900101", "ok"],
    ["admin",    "update public.punch_list_items set details = 'y' where id = 900101", "none"],

    ["pm",       "insert into public.payouts (id, reason, amount) values (900201, 'Loan', 10)", "ok"],
    [null,       "insert into public.payouts (id, reason, amount) values (900202, 'Loan', 20)", "ok"],
    ["pm",       "select count(*) from public.payouts where id in (900201, 900202)", "rows=1"],
    ["tre",      "select count(*) from public.payouts where id in (900201, 900202)", "rows=2"],

    ["pm",       "update public.projects set locked = true, submitted_at = now() where id = 900001", "ok"],
    ["pm",       "update public.projects set title = 'changed' where id = 900001", "error"],
    ["acc",      "update public.projects set title = 'acc edit' where id = 900001", "ok"],
    ["pm",       "update public.projects set archived_at = now() where id = 900001", "error"],
    ["tre",      "update public.projects set archived_at = now() where id = 900001", "ok"],
    ["pm",       "update public.projects set locked = false where id = 900001", "error"],
    ["pm",       "delete from public.projects where id = 900001", "none"],
    [null,       "select count(*) from public.projects where id = 900001", "rows=1"],
    ["pm",       "select count(*) from public.audit_log where table_name = 'projects' and record_id = 900001", "rows=4"],

    [null,       "insert into public.contacts (id, type, first_name) values (900301, 'End Customer', 'Test')", "ok"],
    ["tech",     "insert into public.contact_interactions (id, contact_id, type) values (900401, 900301, 'Email')", "error"],
    ["pm",       "insert into public.contact_interactions (id, contact_id, type) values (900402, 900301, 'Email')", "ok"],
    ["pm",       "update public.contacts set deleted_at = now() where id = 900301", "ok"],

    ["tech",     "insert into public.brands (id, name) values (900501, 'B')", "error"],
    ["admin",    "insert into public.brands (id, name) values (900502, 'B2')", "ok"],
    ["tech",     "select count(*) from public.brands where id = 900502", "rows=1"],

    [null,       "insert into public.transactions (project_id, type, amount, payment_type, description) values (900001, 'Proposal', 100, 'Apply to Project', 'p'), (900001, 'Invoice', 50, 'Apply to Project', 'i'), (900001, 'Payment', 20, 'Apply to Project', 'x'), (900001, 'Proposal', 1000, 'Pay Individual', 'leftover hidden values must not count')", "ok"],
    ["tech",     "select count(*) from public.project_financials(array[900001]::bigint[]) where approved_amount = 100 and invoiced_amount = 50 and paid_amount = 20", "rows=1"],
    ["tech",     "select count(*) from public.transactions where project_id = 900001", "rows=0"],

    [null,       "insert into public.products (id, model) values (900601, 'M')", "ok"],
    ["tech",     "select count(*) from public.products where id = 900601", "rows=0"],
    ["admin",    "select count(*) from public.products where id = 900601", "rows=1"],
    ["sa",       "insert into public.sales (id) values (900701)", "ok"],
    ["tech",     "insert into public.sales (id) values (900702)", "error"],

    [null,       "insert into public.staff_performance (id) values (900801)", "ok"],
    ["tech",     "select count(*) from public.staff_performance where id = 900801", "rows=0"],
    ["pm",       "select count(*) from public.staff_performance where id = 900801", "rows=1"],
    ["tech",     "insert into public.job_reports (id) values (900802)", "ok"],

    ["pm",       "insert into public.visits (id, project_id, starts_at, duration, arrival_window, status) values (900901, 900001, now(), '120', '60', 'Scheduled')", "ok"],
    ["tech",     "select count(*) from public.visits where id = 900901", "rows=1"],
    ["tech",     "insert into public.visits (id, project_id, starts_at) values (900902, 900001, now())", "error"],
    ["tech",     "update public.visits set duration = '30' where id = 900901", "none"],
    ["everyone", "select count(*) from public.visits where id = 900901", "rows=0"],
    ["admin",    "update public.visits set duration = '90' where id = 900901", "ok"],

    ["pm",       "insert into public.record_notes (id, table_name, record_id, body) values (900951, 'projects', 900001, '@Tech please check')", "ok"],
    ["pm",       "insert into public.record_mentions (note_id, table_name, record_id, user_id) values (900951, 'projects', 900001, '00000000-0000-4000-a000-000000000001')", "ok"],
    ["acc",      "insert into public.record_mentions (note_id, table_name, record_id, user_id) values (900951, 'projects', 900001, '00000000-0000-4000-a000-000000000004')", "error"],
    ["tech",     "select count(*) from public.record_mentions where note_id = 900951", "rows=1"],
    ["acc",      "select count(*) from public.record_mentions where note_id = 900951", "rows=0"],
    ["acc",      "update public.record_mentions set seen_at = now() where note_id = 900951", "none"],
    ["tech",     "update public.record_mentions set seen_at = now() where note_id = 900951", "ok"],

    ["admin",    "insert into public.user_permissions (user_id, permission_key) values ('00000000-0000-4000-a000-000000000001', 'projects.projects.create')", "error"],
    ["admin",    "update public.profiles set is_admin = true where id = '00000000-0000-4000-a000-000000000001'", "error"],
    ["admin",    "delete from public.user_permissions where user_id = '00000000-0000-4000-a000-000000000002'", "none"],
    ["admin",    "select count(distinct user_id) from public.user_permissions where user_id::text like '00000000-0000-4000-a000-%'", "rows=6"],
    ["tech",     "insert into public.user_permissions (user_id, permission_key) values ('00000000-0000-4000-a000-000000000001', 'projects.projects.create')", "error"],
    ["tech",     "select count(distinct user_id) from public.user_permissions", "rows=1"],
    ["tech",     "update public.profiles set is_admin = true where id = '00000000-0000-4000-a000-000000000001'", "error"],
    ["tech",     "update public.profiles set active = false where id = '00000000-0000-4000-a000-000000000004'", "none"],
    ["tech",     "select count(*) from public.user_last_sign_in()", "rows=0"],
    ["sa",       "insert into public.user_permissions (user_id, permission_key) values ('00000000-0000-4000-a000-000000000004', 'projects.projects.view_page')", "ok"],
    ["sa",       "update public.profiles set is_admin = true where id = '00000000-0000-4000-a000-000000000004'", "ok"],
    ["admin",    "update public.profiles set first_name = 'Renamed' where id = '00000000-0000-4000-a000-000000000004'", "ok"],

    ["tech",     "update public.profiles set language = 'pt' where id = '00000000-0000-4000-a000-000000000001'", "ok"],
    ["tech",     "update public.profiles set language = 'pt' where id = '00000000-0000-4000-a000-000000000002'", "none"],
    ["tech",     "update public.profiles set language = 'xx' where id = '00000000-0000-4000-a000-000000000001'", "error"],
    ["tech",     "update public.profiles set active = false where id = '00000000-0000-4000-a000-000000000001'", "error"],
    ["tech",     "update public.profiles set email = 'x@y.z' where id = '00000000-0000-4000-a000-000000000001'", "error"],
    [null,       "update public.profiles set active = false where id = '00000000-0000-4000-a000-000000000001'", "ok"],
    ["tech",     "select count(*) from public.projects where id = 900001", "rows=0"]
  ]$steps$;
  s jsonb;
  who text;
  expected text;
  outcome text;
  n bigint;
  passed int := 0;
  failed jsonb := '[]';
begin
  -- Temporary people (rolled back at the end). The profile trigger creates their profiles.
  insert into auth.users (id, instance_id, aud, role, email)
  select (value #>> '{}')::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '@rls-test.invalid'
  from jsonb_each(users);

  insert into public.user_permissions (user_id, permission_key)
  select (users ->> r.who)::uuid, k
  from jsonb_each(grants) as r(who, keys), jsonb_array_elements_text(r.keys) as k;
  update public.profiles set is_admin = true where id = (users ->> 'sa')::uuid;

  for s in select value from jsonb_array_elements(steps) loop
    who := s ->> 0;
    expected := s ->> 2;
    if who is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', users ->> who, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', users ->> who, true);
      execute 'set local role authenticated';
    end if;

    begin
      if expected like 'rows=%' then
        execute s ->> 1 into n;
        outcome := 'rows=' || n;
      else
        execute s ->> 1;
        get diagnostics n = row_count;
        outcome := case when n > 0 then 'ok' else 'none' end;
      end if;
    exception when others then
      outcome := 'error';
      if expected <> 'error' then
        outcome := 'error ' || sqlstate || ': ' || sqlerrm;
      end if;
    end;

    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);

    if outcome = expected then
      passed := passed + 1;
    else
      failed := failed || jsonb_build_object('as', who, 'sql', s ->> 1, 'expected', expected, 'got', outcome);
    end if;
  end loop;

  raise exception 'RLS_RESULT %', jsonb_build_object('passed', passed, 'failed', failed);
end
$test$;
