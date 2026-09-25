-- M9: the four WebAuthor workflows (SPEC §6) with the decisions of 2026-09-25.

do $seed$
declare
  wf record;
  lvl record;
  oc record;
  level_ids jsonb;
begin
  -- [workflow id, name, table, start_on, active, recipient group slugs]
  for wf in
    select * from (values
      ('project_proposal', 'Project Proposal', 'projects', 'submit', true,
        array['office_management', 'project_manager', 'coo', 'admin', 'system_administrators']),
      ('punch_list', 'Punch List Workflow', 'punch_list_items', 'submit', true,
        array['accounting', 'coo', 'office_management', 'project_manager', 'treasurer', 'test', 'system_administrators', 'technician']),
      ('stock_status', 'Stock Status', 'stock_items', 'create', true,
        array['admin', 'system_administrators']),
      ('help_desk', 'Help Desk Workflow', 'support_tickets', 'submit', false,
        array['office_management', 'test', 'system_administrators'])
    ) as v(id, name, table_name, start_on, active, groups)
  loop
    insert into public.workflows (id, name, table_name, start_on, active) values (wf.id, wf.name, wf.table_name, wf.start_on, wf.active);
  end loop;

  -- Levels: [workflow, place, title, colour, field, value]
  insert into public.workflow_levels (workflow_id, place, title, color, is_start, field_updates)
  select w, p, t, c, p = 1, case when f is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('field', f, 'value', val)) end
  from (values
    ('project_proposal', 1, 'Surveying', '#2196f3', 'job_status', 'Surveying'),
    ('project_proposal', 2, 'Create Proposal', '#1266f1', 'job_status', 'Create Proposal'),
    ('project_proposal', 3, 'Proposal Revisions', '#ff9800', 'job_status', 'Proposal Revisions'),
    ('project_proposal', 4, 'Proposal Sent', '#c5e6c1', 'job_status', 'Proposal Sent'),
    ('project_proposal', 5, 'Proposal Approved', '#4caf50', 'job_status', 'Proposal Approved'),
    ('project_proposal', 6, 'ON HOLD', '#f44336', 'job_status', 'ON HOLD'),
    ('project_proposal', 7, 'Infrastructure', '#ffeb3b', 'job_status', 'Infrastructure'),
    ('project_proposal', 8, 'Installation', '#9c27b0', 'job_status', 'Installation'),
    ('project_proposal', 9, 'Programming', '#ffcdd2', 'job_status', 'Programming'),
    ('project_proposal', 10, 'Complete', '#212121', 'job_status', 'Complete'),
    ('project_proposal', 11, 'Proposal Denied', '#dddddd', 'job_status', 'Proposal Denied'),
    ('punch_list', 1, 'Review', '#03a9f4', 'status', 'Review'),
    ('punch_list', 2, 'Scheduled', '#ff9800', 'status', 'Scheduled'), -- WebAuthor wrote "Approved" (not an option), SPEC §9.1 Q9
    ('punch_list', 3, 'In Progress', '#009688', 'status', 'In Progress'),
    ('punch_list', 4, 'On Hold', '#ffc107', 'status', 'On Hold'),
    ('punch_list', 5, 'Completed', '#4caf50', 'status', 'Completed'),
    ('punch_list', 6, 'Canceled', '#f44336', 'status', 'Canceled'),
    ('stock_status', 1, 'In Stock', '#8bc34a', 'status', 'In Stock'),
    ('stock_status', 2, 'On Project', '#03a9f4', 'status', 'On Project'),
    ('stock_status', 3, 'RMA', '#f44336', 'status', 'RMA'),
    ('help_desk', 1, 'Submitted', '#f44336', null, null),
    ('help_desk', 2, 'Completed', '#3f51b5', null, null)
  ) as v(w, p, t, c, f, val);

  -- Recipients per level = the workflow's groups.
  insert into public.workflow_level_groups (level_id, group_id)
  select l.id, g.id
  from public.workflow_levels l
  join (values
    ('project_proposal', array['office_management', 'project_manager', 'coo', 'admin', 'system_administrators']),
    ('punch_list', array['accounting', 'coo', 'office_management', 'project_manager', 'treasurer', 'test', 'system_administrators', 'technician']),
    ('stock_status', array['admin', 'system_administrators']),
    ('help_desk', array['office_management', 'test', 'system_administrators'])
  ) as r(w, groups) on r.w = l.workflow_id
  join public.groups g on g.slug = any (r.groups);

  -- Outcomes: [workflow, from place, outcome place, title, kind, to place]
  insert into public.workflow_outcomes (level_id, place, title, kind, target_level_id)
  select f.id, o.op, o.title, o.kind, t.id
  from (values
    ('project_proposal', 1, 1, 'Create Proposal', 'goto', 2),
    ('project_proposal', 1, 2, 'Still Surveying', 'goto', 1),
    ('project_proposal', 1, 3, 'Override', 'override', null),
    ('project_proposal', 1, 4, 'Remove from Workflow', 'unsubmit', null),
    ('project_proposal', 2, 1, 'Proposal Review', 'goto', 3),
    ('project_proposal', 2, 2, 'Proposal Sent', 'goto', 4),
    ('project_proposal', 3, 1, 'Proposal Sent', 'goto', 4),
    ('project_proposal', 4, 1, 'Proposal Approved', 'goto', 5),
    ('project_proposal', 4, 2, 'Proposal Denied', 'goto', 11),
    ('project_proposal', 4, 3, 'Proposal Revisions', 'goto', 3),
    ('project_proposal', 5, 1, 'Complete', 'goto', 10),
    ('project_proposal', 5, 2, 'Creating Proposal', 'goto', 2),
    ('project_proposal', 5, 3, 'On Hold', 'goto', 6),
    ('project_proposal', 6, 1, 'Infrastructure', 'goto', 7),
    ('project_proposal', 6, 2, 'Installation', 'goto', 8),
    ('project_proposal', 6, 3, 'Programming', 'goto', 9),
    ('project_proposal', 6, 4, 'Proposal Review', 'goto', 3),
    ('project_proposal', 7, 1, 'Installation', 'goto', 8),
    ('project_proposal', 7, 2, 'ON HOLD', 'goto', 6),
    ('project_proposal', 7, 3, 'Complete', 'goto', 10),
    ('project_proposal', 8, 1, 'Programming', 'goto', 9),
    ('project_proposal', 8, 2, 'ON HOLD', 'goto', 6),
    ('project_proposal', 8, 3, 'Complete', 'goto', 10),
    ('project_proposal', 9, 1, 'Complete', 'goto', 10),
    ('project_proposal', 9, 2, 'ON HOLD', 'goto', 6),
    ('project_proposal', 10, 1, 'Create Proposal', 'goto', 2),
    ('project_proposal', 10, 2, 'Surveying', 'goto', 1),
    ('project_proposal', 11, 1, 'Surveying', 'goto', 1),
    ('project_proposal', 11, 2, 'Create Proposal', 'goto', 2),
    ('project_proposal', 11, 3, 'Complete', 'goto', 10),
    ('punch_list', 1, 1, 'Approved', 'goto', 2),
    ('punch_list', 1, 2, 'Canceled', 'goto', 6),
    ('punch_list', 2, 1, 'In Progress', 'goto', 3),
    ('punch_list', 2, 2, 'On Hold', 'goto', 4),
    ('punch_list', 2, 3, 'Completed', 'goto', 5),
    ('punch_list', 2, 4, 'Canceled', 'goto', 6),
    ('punch_list', 3, 1, 'On Hold', 'goto', 4),
    ('punch_list', 3, 2, 'Completed', 'goto', 5),
    ('punch_list', 3, 3, 'Canceled', 'goto', 6),
    ('punch_list', 4, 1, 'In Progress', 'goto', 3),
    ('punch_list', 4, 2, 'Completed', 'goto', 5),
    ('punch_list', 4, 3, 'Canceled', 'goto', 6),
    ('punch_list', 6, 1, 'In Progress', 'goto', 3),
    ('punch_list', 6, 2, 'Scheduled', 'goto', 2),
    ('punch_list', 6, 3, 'On Hold', 'goto', 4),
    ('stock_status', 1, 1, 'On Project', 'goto', 2),
    ('stock_status', 2, 1, 'RMA', 'goto', 3),
    ('help_desk', 1, 1, 'Completed', 'goto', 2)
  ) as o(w, fp, op, title, kind, tp)
  join public.workflow_levels f on f.workflow_id = o.w and f.place = o.fp
  left join public.workflow_levels t on t.workflow_id = o.w and t.place = o.tp;
end
$seed$;
