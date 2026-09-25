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
  -- [who, sql, expected]; who = null runs as the database owner (like an engine).
  -- expected: 'ok' (≥1 row affected) | 'none' (0 rows affected, silently filtered) | 'error' | 'rows=N'
  steps jsonb := $steps$[
    ["pm",       "insert into public.projects (id, title, type, category) values (900001, 'RLS test', 'Residential', 'Low Voltage')", "ok"],
    ["tech",     "insert into public.projects (id, title, type, category) values (900002, 'x', 'Residential', 'Low Voltage')", "error"],
    ["tech",     "select count(*) from public.projects where id = 900001", "rows=1"],
    ["everyone", "select count(*) from public.projects where id = 900001", "rows=1"],
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

    [null,       "insert into public.transactions (project_id, type, amount, payment_type, description) values (900001, 'Proposal', 100, 'Apply to Project', 'p'), (900001, 'Invoice', 50, 'Apply to Project', 'i'), (900001, 'Payment', 20, 'Apply to Project', 'x')", "ok"],
    ["everyone", "select count(*) from public.project_financials(array[900001]::bigint[]) where approved_amount = 100 and invoiced_amount = 50 and paid_amount = 20", "rows=1"],
    ["tech",     "select count(*) from public.transactions where project_id = 900001", "rows=0"],

    [null,       "insert into public.products (id, model) values (900601, 'M')", "ok"],
    ["tech",     "select count(*) from public.products where id = 900601", "rows=0"],
    ["admin",    "select count(*) from public.products where id = 900601", "rows=1"],
    ["sa",       "insert into public.sales (id) values (900701)", "ok"],
    ["tech",     "insert into public.sales (id) values (900702)", "error"],

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

  insert into public.group_members (group_id, user_id)
  select g.id, (users ->> x.who)::uuid
  from (values ('tech', 'technician'), ('pm', 'project_manager'), ('acc', 'accounting'), ('admin', 'admin'),
               ('tre', 'treasurer'), ('sa', 'system_administrators')) as x(who, slug)
  join public.groups g on g.slug = x.slug;

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
