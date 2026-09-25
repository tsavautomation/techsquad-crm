-- Workflow test for M9 (SPEC Â§6 + decisions 2026-09-25). Run against the dev database:
--   npx supabase db query --linked --file supabase/tests/workflows_m9.sql
-- Like rls_m4.sql, everything is rolled back by the final RAISE; the result is in its message.

do $test$
declare
  users jsonb := jsonb_build_object(
    'tech',  '00000000-0000-4000-b000-000000000001',
    'pm',    '00000000-0000-4000-b000-000000000002',
    'acc',   '00000000-0000-4000-b000-000000000003',
    'admin', '00000000-0000-4000-b000-000000000005',
    'om',    '00000000-0000-4000-b000-000000000006'
  );
  steps jsonb := $steps$[
    ["pm",    "insert into public.projects (id, title, type, category) values (910001, 'WF test', 'Residential', 'Low Voltage')", "ok"],
    ["pm",    "update public.projects set locked = true, submitted_at = now() where id = 910001", "ok"],
    ["pm",    "select count(*) from (select public.workflow_start('projects', 910001)) x", "rows=1"],
    [null,    "select count(*) from public.projects where id = 910001 and job_status = 'Surveying' and locked", "rows=1"],

    ["tech",  "select count(*) from (select public.workflow_move('projects', 910001, (select o.id from public.workflow_outcomes o join public.workflow_levels l on l.id = o.level_id where l.workflow_id = 'project_proposal' and l.place = 1 and o.title = 'Create Proposal'))) x", "error"],
    ["acc",   "select count(*) from (select public.workflow_move('projects', 910001, (select o.id from public.workflow_outcomes o join public.workflow_levels l on l.id = o.level_id where l.workflow_id = 'project_proposal' and l.place = 1 and o.title = 'Create Proposal'))) x", "error"],
    ["pm",    "select count(*) from (select public.workflow_move('projects', 910001, (select o.id from public.workflow_outcomes o join public.workflow_levels l on l.id = o.level_id where l.workflow_id = 'project_proposal' and l.place = 1 and o.title = 'Create Proposal'), null, 'Survey done')) x", "rows=1"],
    [null,    "select count(*) from public.projects where id = 910001 and job_status = 'Create Proposal' and locked", "rows=1"],
    ["pm",    "update public.projects set title = 'PM edit while locked' where id = 910001", "error"],
    ["pm",    "select count(*) from (select public.workflow_move('projects', 910001, (select o.id from public.workflow_outcomes o join public.workflow_levels l on l.id = o.level_id where l.workflow_id = 'project_proposal' and l.place = 1 and o.title = 'Create Proposal'))) x", "error"],

    ["pm",    "insert into public.projects (id, title, type, category) values (910002, 'WF override', 'Commercial', 'Electrical')", "ok"],
    ["pm",    "update public.projects set locked = true, submitted_at = now() where id = 910002", "ok"],
    ["pm",    "select count(*) from (select public.workflow_start('projects', 910002)) x", "rows=1"],
    ["om",    "select count(*) from (select public.workflow_move('projects', 910002, (select o.id from public.workflow_outcomes o join public.workflow_levels l on l.id = o.level_id where l.workflow_id = 'project_proposal' and l.place = 1 and o.title = 'Override'), (select id from public.workflow_levels where workflow_id = 'project_proposal' and place = 8))) x", "rows=1"],
    [null,    "select count(*) from public.projects where id = 910002 and job_status = 'Installation'", "rows=1"],

    ["pm",    "insert into public.projects (id, title, type, category) values (910003, 'WF remove', 'Commercial', 'Electrical')", "ok"],
    ["pm",    "update public.projects set locked = true, submitted_at = now() where id = 910003", "ok"],
    ["pm",    "select count(*) from (select public.workflow_start('projects', 910003)) x", "rows=1"],
    ["admin", "select count(*) from (select public.workflow_move('projects', 910003, (select o.id from public.workflow_outcomes o join public.workflow_levels l on l.id = o.level_id where l.workflow_id = 'project_proposal' and l.place = 1 and o.title = 'Remove from Workflow'))) x", "rows=1"],
    [null,    "select count(*) from public.projects where id = 910003 and not locked and submitted_at is null", "rows=1"],
    [null,    "select count(*) from public.record_workflow_state where table_name = 'projects' and record_id = 910003", "rows=0"],

    [null,    "insert into public.punch_list_items (id, project_id, type, locked, submitted_at) values (910101, 910001, 'Installation', true, now())", "ok"],
    ["pm",    "select count(*) from (select public.workflow_start('punch_list_items', 910101)) x", "rows=1"],
    ["tech",  "select count(*) from (select public.workflow_move('punch_list_items', 910101, (select o.id from public.workflow_outcomes o join public.workflow_levels l on l.id = o.level_id where l.workflow_id = 'punch_list' and l.place = 1 and o.title = 'Approved'))) x", "rows=1"],
    [null,    "select count(*) from public.punch_list_items where id = 910101 and status = 'Scheduled'", "rows=1"],
    ["tech",  "select count(*) from public.my_workflow_queue() where table_name = 'punch_list_items' and record_id = 910101", "rows=1"],
    ["tech",  "select count(*) from public.my_workflow_queue() where table_name = 'projects'", "rows=0"],
    ["pm",    "select count(*) from public.my_workflow_queue() where table_name = 'projects' and record_id in (910001, 910002)", "rows=2"],

    ["admin", "insert into public.stock_items (id, serial) values (910201, 'SN-WF')", "ok"],
    ["admin", "select count(*) from (select public.workflow_start('stock_items', 910201, 'create')) x", "rows=1"],
    [null,    "select count(*) from public.stock_items where id = 910201 and status = 'In Stock'", "rows=1"],
    ["pm",    "select count(*) from (select public.workflow_move('stock_items', 910201, (select o.id from public.workflow_outcomes o join public.workflow_levels l on l.id = o.level_id where l.workflow_id = 'stock_status' and l.place = 1))) x", "error"],

    ["pm",    "select count(*) from public.workflow_events where table_name = 'projects' and record_id = 910001", "rows=2"],
    [null,    "select count(*) from public.audit_log where table_name = 'projects' and record_id = 910001 and action = 'update' and changes ? 'job_status'", "rows=2"]
  ]$steps$;
  s jsonb; who text; expected text; outcome text; n bigint; passed int := 0; failed jsonb := '[]';
begin
  insert into auth.users (id, instance_id, aud, role, email)
  select (value #>> '{}')::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '@wf-test.invalid'
  from jsonb_each(users);

  insert into public.group_members (group_id, user_id)
  select g.id, (users ->> x.who)::uuid
  from (values ('tech', 'technician'), ('pm', 'project_manager'), ('acc', 'accounting'), ('admin', 'admin'), ('om', 'office_management')) as x(who, slug)
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
      outcome := case when expected = 'error' then 'error' else 'error ' || sqlstate || ': ' || sqlerrm end;
    end;
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    if outcome = expected then passed := passed + 1;
    else failed := failed || jsonb_build_object('as', who, 'sql', left(s ->> 1, 140), 'expected', expected, 'got', outcome);
    end if;
  end loop;

  raise exception 'WF_RESULT %', jsonb_build_object('passed', passed, 'failed', failed);
end
$test$;

