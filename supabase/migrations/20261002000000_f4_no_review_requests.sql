-- F4 change (Fred 2026-10-02): clients are never sent a Google review link (SPEC §9.1 F4-d).
--   app_settings 'messages'   drop the "Review request" template and the review link setting
--   automation 900403         on Complete: only "offer a maintenance plan", and only when the project has none

update public.app_settings
set value = jsonb_build_object(
  'templates',
  coalesce((select jsonb_agg(t) from jsonb_array_elements(value -> 'templates') t where t ->> 'key' <> 'review_request'), '[]'::jsonb)
)
where key = 'messages';

update public.automations
set title = 'Offer a maintenance plan after completion',
    conditions = '{"match":"all","rules":[{"field":"job_status","op":"=","value":"Complete"},{"field":"maintenance_plan","op":"=","value":false}]}',
    actions = '[{"type":"task","text":"Project complete: offer {job_owner_id} a maintenance plan ({title})","due_days":2,"assign":"salesperson_id","labels":["Client"]}]',
    notes = 'F4: a task for the salesperson when a project without a maintenance plan is completed.',
    updated_at = now()
where id = 900403;
