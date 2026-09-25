-- Decisions of 2026-09-25 (SPEC §9).
-- Q11: Inventory › Sale was granted to nobody in WebAuthor; give it exactly the grants Stock has.
-- (The M2 seed migration is historical and is not regenerated; scripts/lib/permissions-map.ts applies the same fix.)

insert into public.group_permissions (group_id, permission_key)
select gp.group_id, 'inventory.sales.' || p.action
from public.group_permissions gp
join public.permissions p on p.key = gp.permission_key
where p.module = 'inventory' and p.resource = 'stock'
  and exists (select 1 from public.permissions s where s.key = 'inventory.sales.' || p.action)
on conflict do nothing;
