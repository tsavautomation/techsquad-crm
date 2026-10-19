-- PER-a (Fred 2026-10-19): a permit whose Status becomes "Passed Final, Done" is finished with.
-- It is archived on its own and its Permit Expiration is cleared, so it never reads "Expired" again.
-- The three expiry automations (691 / 693 / 692) leave finished permits alone.

-- 1. New data automation: Status = Passed Final Done → clear Permit Expiration, archive.
insert into public.automations (id, table_name, title, active, events, conditions, actions, notes) values
(900801, 'permits', 'Permit passed final → archived', true, '{added,modified,field:status}',
  '{"match":"all","rules":[{"field":"status","op":"=","value":"Passed Final Done"}]}',
  '[{"type":"update","set":{"expiration_status":null}},{"type":"archive"}]',
  'PER-a: a permit that passed its final inspection is done; it is archived and its expiration status is cleared so it never shows Expired.')
on conflict (id) do nothing;

-- 2. The expiry automations skip finished permits.
update public.automations
   set conditions = jsonb_set(conditions, '{rules}', (conditions->'rules') || '[{"field":"status","op":"!=","value":"Passed Final Done"}]'::jsonb),
       notes = concat_ws(' · ', notes, 'PER-a: not on permits that passed final'),
       updated_at = now()
 where id in (691, 692, 693)
   and not (conditions->'rules') @> '[{"field":"status","op":"!=","value":"Passed Final Done"}]'::jsonb;

-- 3. Permits already in that situation: archive them and clear the expiration status.
update public.permits
   set archived_at = coalesce(archived_at, now()),
       expiration_status = null
 where status = 'Passed Final Done'
   and deleted_at is null
   and (archived_at is null or expiration_status is not null);
