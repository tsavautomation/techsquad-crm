-- Inventory Checkout moves from Administrative to Inventory and replaces Sale (Fred 2026-10-04,
-- "checkout would be the same as sale"; SPEC §9.1 INV-a). Permission keys are named
-- module.resource.action, so the keys move with it and every person keeps the same rights.
-- The sales table stays (no data was ever imported into it); only its keys and menu entry go.

-- 1. The catalogue: the same six keys under the Inventory module.
insert into public.permissions (key, module, resource, action, kind, area, label, description)
select replace(key, 'administrative.', 'inventory.'), 'inventory', resource, action, kind, replace(area, 'Administrative', 'Inventory'), label, description
from public.permissions
where key like 'administrative.inventory-checkout.%'
on conflict (key) do nothing;

-- 2. Everyone keeps what they had.
insert into public.user_permissions (user_id, permission_key)
select user_id, replace(permission_key, 'administrative.inventory-checkout.', 'inventory.inventory-checkout.')
from public.user_permissions
where permission_key like 'administrative.inventory-checkout.%'
on conflict do nothing;

-- 3. Old keys go (their grants go with them), and so do the Sale keys.
delete from public.permissions where key like 'administrative.inventory-checkout.%';
delete from public.permissions where key like 'inventory.sales.%';

-- 4. The database's own permission checks read the module from here.
update app.record_types
set module = 'inventory', lock_resource = 'products'
where table_name = 'inventory_checkouts';
